import {
  AdvanceVerificationRecord,
  AppUser,
  CommercialProposalRecord,
  ClientRecord,
  EvaluationSnapshotRecord,
  InboundLeadStatus,
  InboundLeadRecord,
  FloorWorkspaceRecord,
  LeadQualificationRecord,
  PaymentRecord,
  ReviewCallBookingRecord,
  ReportVersionRecord,
  ShaktiSnapshotRecord,
  TimelineEvent,
  UtilityRule,
  WhatsAppTemplateLogRecord,
  WhatsAppTemplateRecord
} from "@/lib/domain";
import { canonicalServiceStages, serviceTypes, type CanonicalServiceStage, type CaseDrawingReference, type CaseInputReadiness, type VastuServiceType } from "@/lib/domain";
import { buildInboundLeadIdentity, buildStableClientId, normalizeCsvDate, normalizeLeadEmail, normalizeLeadPhone, type ParsedInboundLeadRow } from "@/lib/lead-import";
import { MIN_ADVANCE_INR, DEFAULT_PROPOSAL_AMOUNT_INR, canCreateCase, generateUtilityEvaluation, lockWorkspace, qualifyLead, rankShakti } from "@/lib/workflows";
import { getAppState, resetAppState } from "@/lib/store";
import { formatMoney } from "@/lib/workflows";
import { writeOptInLeadRecords } from "@/lib/optin-leads-store";
import { writeReviewCallBookingRecords } from "@/lib/review-call-bookings-store";
import { writeAdvanceVerificationRecords } from "@/lib/advance-verifications-store";
import {
  deterministicContentHash,
  SHAKTI_ALGORITHM_VERSION,
  SHAKTI_MAPPING_VERSION,
  SHAKTI_ROUNDING_VERSION,
  UTILITY_EVALUATION_ALGORITHM_VERSION,
  UTILITY_RULESET_FORMAT_VERSION,
  validateShaktiInputs
} from "@/lib/evaluation-provenance";
import { assertCaseReadyForEvaluation, getServiceReadinessChecklist, normalizeCaseService } from "@/lib/service-framework";

export class WorkflowConflictError extends Error {
  readonly statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = "WorkflowConflictError";
  }
}

const MAX_VERSION_LENGTH = 80;
const MAX_DISCREPANCY_LENGTH = 500;
const MAX_SNAPSHOT_NAME_LENGTH = 120;

function boundedRequiredString(value: unknown, label: string, maxLength = MAX_VERSION_LENGTH) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    throw new Error(`${label} is required and must be ${maxLength} characters or fewer.`);
  }
  return value.trim();
}

function optionalDate(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.length > 40 || Number.isNaN(Date.parse(value))) throw new Error(`${label} must be a valid date.`);
  const parsed = new Date(value);
  if (parsed.getTime() > Date.now() + 5 * 60 * 1000) throw new Error(`${label} cannot be in the future.`);
  return parsed.toISOString();
}

export function configureCaseService(input: {
  caseId: unknown;
  serviceType: unknown;
  canonicalStage: unknown;
  serviceTemplateVersion: unknown;
  scopeVersion: unknown;
  inputReadiness: unknown;
  currentDrawing?: unknown;
  actor: AppUser;
}) {
  const state = getAppState();
  const caseId = boundedRequiredString(input.caseId, "Case ID");
  const caseRecord = state.vastuCases.find((item) => item.id === caseId);
  if (!caseRecord) throw new Error("Case not found.");
  if (state.evaluationSnapshots.some((item) => item.caseId === caseId) || state.shaktiSnapshots.some((item) => item.caseId === caseId) || state.reportVersions.some((item) => item.caseId === caseId)) {
    throw new WorkflowConflictError("Service setup is locked because evaluation or report evidence already exists. Start the formal rectification workflow before changing these inputs.");
  }

  if (typeof input.serviceType !== "string" || !serviceTypes.includes(input.serviceType as VastuServiceType)) throw new Error("Choose a valid service type.");
  if (typeof input.canonicalStage !== "string" || !canonicalServiceStages.includes(input.canonicalStage as CanonicalServiceStage)) throw new Error("Choose a valid service stage.");
  const serviceType = input.serviceType as VastuServiceType;
  const canonicalStage = input.canonicalStage as CanonicalServiceStage;
  const currentStage = normalizeCaseService(caseRecord).canonicalStage;
  if (canonicalServiceStages.indexOf(canonicalStage) > canonicalServiceStages.indexOf(currentStage) + 1) throw new WorkflowConflictError("Complete the current service stage before moving further ahead.");

  if (!input.inputReadiness || typeof input.inputReadiness !== "object" || Array.isArray(input.inputReadiness)) throw new Error("Input readiness must be a checklist object.");
  const submittedReadiness = input.inputReadiness as Record<string, unknown>;
  const templateCase = { ...caseRecord, serviceType };
  const allowedKeys = new Set(getServiceReadinessChecklist(templateCase).filter((item) => item.key !== "currentDrawingVerified").map((item) => item.key));
  for (const [key, value] of Object.entries(submittedReadiness)) {
    if (!allowedKeys.has(key as keyof CaseInputReadiness)) throw new Error(`Unknown readiness item: ${key}.`);
    if (typeof value !== "boolean") throw new Error(`Readiness item ${key} must be true or false.`);
  }
  const inputReadiness = Object.fromEntries(Object.entries(submittedReadiness)) as CaseInputReadiness;

  let currentDrawing: CaseDrawingReference | undefined;
  if (input.currentDrawing !== undefined && input.currentDrawing !== null) {
    if (typeof input.currentDrawing !== "object" || Array.isArray(input.currentDrawing)) throw new Error("Current drawing must be a structured record.");
    const drawing = input.currentDrawing as Record<string, unknown>;
    const allowedDrawingKeys = new Set(["versionLabel", "receivedAt", "verifiedAt", "discrepancy", "superseded"]);
    for (const key of Object.keys(drawing)) if (!allowedDrawingKeys.has(key)) throw new Error(`Unknown drawing field: ${key}.`);
    if (drawing.superseded !== undefined && typeof drawing.superseded !== "boolean") throw new Error("Drawing superseded must be true or false.");
    if (drawing.discrepancy !== undefined && (typeof drawing.discrepancy !== "string" || drawing.discrepancy.length > MAX_DISCREPANCY_LENGTH)) throw new Error(`Drawing discrepancy must be ${MAX_DISCREPANCY_LENGTH} characters or fewer.`);
    currentDrawing = {
      versionLabel: boundedRequiredString(drawing.versionLabel, "Drawing version"),
      receivedAt: optionalDate(drawing.receivedAt, "Drawing received date"),
      verifiedAt: optionalDate(drawing.verifiedAt, "Drawing verified date"),
      discrepancy: typeof drawing.discrepancy === "string" && drawing.discrepancy.trim() ? drawing.discrepancy.trim() : undefined,
      superseded: drawing.superseded === true
    };
    if (currentDrawing.receivedAt && currentDrawing.verifiedAt && new Date(currentDrawing.verifiedAt) < new Date(currentDrawing.receivedAt)) {
      throw new Error("Drawing verification date cannot be earlier than the received date.");
    }
  }
  if (serviceType === "NEW_CONSTRUCTION" && !currentDrawing) throw new Error("New construction requires a current drawing record.");

  const serviceTemplateVersion = boundedRequiredString(input.serviceTemplateVersion, "Service template version");
  const scopeVersion = boundedRequiredString(input.scopeVersion, "Scope version");

  const nextConfiguration = { serviceType, canonicalStage, serviceTemplateVersion, scopeVersion, inputReadiness, currentDrawing };
  const currentConfiguration = {
    serviceType: caseRecord.serviceType,
    canonicalStage: caseRecord.canonicalStage,
    serviceTemplateVersion: caseRecord.serviceTemplateVersion,
    scopeVersion: caseRecord.scopeVersion,
    inputReadiness: caseRecord.inputReadiness ?? {},
    currentDrawing: caseRecord.currentDrawing
  };
  if (deterministicContentHash(currentConfiguration) === deterministicContentHash(nextConfiguration)) return caseRecord;
  Object.assign(caseRecord, nextConfiguration);
  appendTimeline(caseRecord.clientId, "Service setup updated", `${input.actor.fullName} set ${serviceType} at ${canonicalStage}; template=${serviceTemplateVersion}; scope=${scopeVersion}.`, "Case", input.actor);
  return caseRecord;
}

function nextId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function buildMeetingLink(provider: ReviewCallBookingRecord["provider"], clientId: string) {
  const fragment = clientId.replace(/[^a-zA-Z0-9]/g, "").slice(-8).padEnd(8, "x").toLowerCase();
  if (provider === "ZOOM") {
    return `https://zoom.us/j/${fragment}`;
  }
  return `https://meet.google.com/${fragment.slice(0, 3)}-${fragment.slice(3, 6)}-${fragment.slice(6, 9)}`;
}

function appendTimeline(clientId: string, headline: string, details: string, category: string, actor?: AppUser | AppUser["role"]) {
  const state = getAppState();
  const event: TimelineEvent = {
    id: nextId("event"),
    clientId,
    category,
    headline,
    details,
    happenedAt: new Date().toISOString(),
    actorRole: typeof actor === "string" ? actor : actor?.role,
    actorId: typeof actor === "object" ? actor.id : undefined,
    actorName: typeof actor === "object" ? actor.fullName : undefined
  };

  state.timelineEvents.unshift(event);
  return event;
}

export function getBootstrapPayload() {
  return getAppState();
}

export function resetDemoData() {
  return resetAppState();
}

export function recordLeadQualification(input: {
  clientId: string;
  score: number;
  notes: string;
  conversationalForm: Array<{ label: string; answer: string }>;
  qualificationCallCompletedAt?: string;
}) {
  const state = getAppState();
  const lead: LeadQualificationRecord = {
    id: nextId("lead"),
    clientId: input.clientId,
    score: input.score,
    notes: input.notes,
    qualificationCallDueAt: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
    qualificationCallCompletedAt: input.qualificationCallCompletedAt,
    deliverableTriggeredAt: input.score >= 80 && input.qualificationCallCompletedAt ? new Date().toISOString() : undefined,
    conversationalForm: input.conversationalForm
  };

  state.leadQualifications.unshift(lead);
  appendTimeline(input.clientId, "Lead qualification recorded", `Score ${input.score} logged from the conversational intake.`, "Lead", "SETTER");
  return lead;
}

export function bookQualificationCall(input: {
  clientId: string;
  scheduledAt: string;
  actor: AppUser;
}) {
  const state = getAppState();
  const lead = [...state.leadQualifications].find((item) => item.clientId === input.clientId);
  if (!lead) {
    throw new Error("Lead qualification not found.");
  }

  lead.qualificationCallDueAt = input.scheduledAt;
  appendTimeline(
    input.clientId,
    "Qualification call booked",
    `Qualification call scheduled for ${input.scheduledAt}. The 2-minute window remains the working SLA.`,
    "Lead",
    input.actor.role
  );
  return lead;
}

function mergeLeadRecord(existing: InboundLeadRecord, incoming: ParsedInboundLeadRow, importedAt: string) {
  existing.fullName = incoming.fullName || existing.fullName;
  existing.email = normalizeLeadEmail(incoming.email || existing.email);
  existing.phone = normalizeLeadPhone(incoming.phone || existing.phone);
  existing.dob = incoming.dob || existing.dob;
  existing.city = incoming.city || existing.city;
  existing.source = incoming.source || existing.source;
  existing.statusLabel = incoming.statusLabel || existing.statusLabel;
  existing.utmSource = incoming.utmSource || existing.utmSource;
  existing.utmMedium = incoming.utmMedium || existing.utmMedium;
  existing.utmCampaign = incoming.utmCampaign || existing.utmCampaign;
  existing.utmTerm = incoming.utmTerm || existing.utmTerm;
  existing.utmContent = incoming.utmContent || existing.utmContent;
  existing.landingPage = incoming.landingPage || existing.landingPage;
  existing.referrer = incoming.referrer || existing.referrer;
  existing.assignedTo = incoming.assignedTo || existing.assignedTo;
  existing.deletedAt = incoming.deletedAt || existing.deletedAt;
  existing.score = incoming.score ?? existing.score;
  existing.message = [existing.message, incoming.message].filter(Boolean).join(" | ");
  existing.notes = [existing.notes, incoming.notes].filter(Boolean).join(" | ");
  existing.status = existing.status === "QUALIFIED" ? "QUALIFIED" : "DUPLICATE";
  existing.firstSeenAt = existing.firstSeenAt || incoming.csvCreatedDate || importedAt.slice(0, 10);
  const lastSeenCandidates = [existing.lastSeenAt, incoming.csvCreatedDate].filter(Boolean).sort();
  existing.lastSeenAt = lastSeenCandidates[lastSeenCandidates.length - 1] ?? existing.lastSeenAt;
  existing.submissionCount += 1;
  existing.duplicateCount += 1;
  existing.isReturningLead = true;
  return existing;
}

function upsertClientShellFromInboundLead(lead: InboundLeadRecord, actor?: AppUser) {
  const state = getAppState();
  const existingClient = state.clients.find((client) => client.id === lead.uniqueClientId);
  const stage = lead.status === "QUALIFIED" ? "QUALIFIED" : lead.status === "DISQUALIFIED" ? "DISQUALIFIED" : lead.score >= 80 ? "QUALIFIED" : lead.score >= 60 ? "QUALIFYING" : "NEW";
  const setterId = actor?.role === "SETTER" ? actor.id : existingClient?.assignedSetterId ?? "";

  if (existingClient) {
    existingClient.displayName = lead.fullName || existingClient.displayName;
    existingClient.email = lead.email || existingClient.email;
    existingClient.phone = lead.phone || existingClient.phone;
    existingClient.city = lead.city || existingClient.city;
    existingClient.source = lead.source || existingClient.source;
    existingClient.assignedSetterId = setterId;
    existingClient.stage = stage;
    return existingClient;
  }

  const client: ClientRecord = {
    id: lead.uniqueClientId,
    displayName: lead.fullName,
    email: lead.email,
    phone: lead.phone,
    city: lead.city,
    source: lead.source,
    assignedSetterId: setterId,
    stage
  };
  state.clients.unshift(client);
  return client;
}

export function importInboundLeads(rows: ParsedInboundLeadRow[]) {
  const state = getAppState();
  const importedAt = nowIso();
  const seenThisBatch = new Map<string, InboundLeadRecord>();
  const created: InboundLeadRecord[] = [];
  const updated: InboundLeadRecord[] = [];

  for (const [index, row] of rows.entries()) {
    const identityKey = buildInboundLeadIdentity(row);
    const uniqueClientId = buildStableClientId(identityKey);
    const existing = seenThisBatch.get(identityKey) ?? state.optInLeads.find((item) => item.identityKey === identityKey || item.uniqueClientId === uniqueClientId);

    if (existing) {
      const merged = mergeLeadRecord(existing, row, importedAt);
      seenThisBatch.set(identityKey, merged);
      updated.push(merged);
      appendTimeline(
        merged.uniqueClientId,
        "Lead refilled",
        `Repeat opt-in received from ${merged.fullName}. Submission count is now ${merged.submissionCount}.`,
        "Lead"
      );
      continue;
    }

    const lead: InboundLeadRecord = {
      id: `inbound_${Date.now()}_${index}`,
      uniqueClientId,
      identityKey,
      fullName: row.fullName,
      email: normalizeLeadEmail(row.email),
      phone: normalizeLeadPhone(row.phone),
      dob: row.dob,
      city: row.city,
      source: row.source,
      statusLabel: row.statusLabel,
      utmSource: row.utmSource,
      utmMedium: row.utmMedium,
      utmCampaign: row.utmCampaign,
      utmTerm: row.utmTerm,
      utmContent: row.utmContent,
      landingPage: row.landingPage,
      referrer: row.referrer,
      assignedTo: row.assignedTo,
      deletedAt: row.deletedAt,
      score: row.score,
      message: row.message,
      notes: row.notes,
      status: "NEW",
      importedAt,
      firstSeenAt: row.csvCreatedDate || importedAt.slice(0, 10),
      lastSeenAt: row.csvCreatedDate || importedAt.slice(0, 10),
      submissionCount: 1,
      duplicateCount: 0,
      isReturningLead: false
    };

    seenThisBatch.set(identityKey, lead);
    created.push(lead);
    upsertClientShellFromInboundLead(lead);
    appendTimeline(
      lead.uniqueClientId,
      "Lead imported",
      `New website opt-in captured from ${lead.source}. Submission count is now ${lead.submissionCount}.`,
      "Lead"
    );
  }

  const byIdentity = new Map<string, InboundLeadRecord>();
  for (const lead of [...state.optInLeads, ...updated, ...created]) {
    byIdentity.set(lead.identityKey, lead);
  }

  state.optInLeads = [...byIdentity.values()].sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt));
  void writeOptInLeadRecords(state.optInLeads);
  return { created, updated, leads: state.optInLeads };
}

export function qualifyInboundLead(inboundLeadId: string, actor: AppUser) {
  const state = getAppState();
  const inboundLead = state.optInLeads.find((item) => item.id === inboundLeadId);
  if (!inboundLead) {
    throw new Error("Inbound lead not found.");
  }

  if (inboundLead.status === "QUALIFIED" && inboundLead.convertedClientId) {
    return {
      lead: inboundLead,
      client: state.clients.find((client) => client.id === inboundLead.convertedClientId),
      qualification: state.leadQualifications.find((item) => item.clientId === inboundLead.convertedClientId)
    };
  }

  const clientId = inboundLead.uniqueClientId || `client_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const client = upsertClientShellFromInboundLead(inboundLead, actor);

  const qualification: LeadQualificationRecord = {
    id: `lead_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    clientId,
    score: inboundLead.score,
    notes: inboundLead.notes || inboundLead.message || "Imported from CSV opt-in",
    qualificationCallDueAt: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
    qualificationCallCompletedAt: new Date().toISOString(),
    deliverableTriggeredAt: inboundLead.score >= 80 ? new Date().toISOString() : undefined,
    conversationalForm: [
      { label: "Full name", answer: inboundLead.fullName },
      { label: "Email", answer: inboundLead.email },
      { label: "Phone", answer: inboundLead.phone },
      { label: "Source", answer: inboundLead.source }
    ]
  };

  state.leadQualifications.unshift(qualification);
  const qualifiedAt = nowIso();
  inboundLead.status = inboundLead.score >= 60 ? "QUALIFIED" : "FILTERED";
  inboundLead.qualifiedAt = qualifiedAt;
  inboundLead.convertedClientId = clientId;
  inboundLead.submissionCount = Math.max(inboundLead.submissionCount, 1);
  void writeOptInLeadRecords(state.optInLeads);

  appendTimeline(clientId, "Inbound lead qualified", `Imported from website CSV by ${actor.fullName}.`, "Lead", actor.role);
  return { lead: inboundLead, client, qualification };
}

export function updateInboundLeadStatus(inboundLeadId: string, status: InboundLeadStatus, actor: AppUser, note?: string) {
  const state = getAppState();
  const inboundLead = state.optInLeads.find((item) => item.id === inboundLeadId);
  if (!inboundLead) {
    throw new Error("Inbound lead not found.");
  }

  inboundLead.status = status;
  if (note) {
    inboundLead.notes = [inboundLead.notes, note].filter(Boolean).join(" | ");
  }

  const existingClient = state.clients.find((client) => client.id === inboundLead.uniqueClientId);
  if (existingClient) {
    existingClient.stage =
      status === "QUALIFIED"
        ? "QUALIFIED"
        : status === "DISQUALIFIED"
          ? "DISQUALIFIED"
          : status === "FILTERED"
            ? "QUALIFYING"
            : "NEW";
  }

  void writeOptInLeadRecords(state.optInLeads);
  appendTimeline(
    inboundLead.uniqueClientId,
    `Lead marked ${status.toLowerCase()}`,
    note ? `Lead status changed to ${status}. ${note}` : `Lead status changed to ${status}.`,
    "Lead",
    actor.role
  );

  return inboundLead;
}

export function createCommercialProposal(clientId: string, amountInr = DEFAULT_PROPOSAL_AMOUNT_INR) {
  const state = getAppState();
  const proposal: CommercialProposalRecord = {
    id: nextId("proposal"),
    clientId,
    amountInr,
    minAdvanceInr: MIN_ADVANCE_INR,
    status: "PENDING_APPROVAL"
  };

  state.commercialProposals.unshift(proposal);
  appendTimeline(clientId, "Commercial proposal drafted", `Proposal prepared at ${formatMoney(amountInr)}.`, "Commercial", "ADMIN");
  return proposal;
}

export async function bookReviewCall(input: {
  clientId: string;
  proposalId: string;
  provider: ReviewCallBookingRecord["provider"];
  scheduledAt: string;
  durationMinutes?: number;
  actor: AppUser;
}) {
  const state = getAppState();
  const existing = state.reviewCallBookings.find((booking) => booking.clientId === input.clientId && booking.proposalId === input.proposalId && booking.status !== "CANCELLED");
  if (existing) {
    return existing;
  }

  const booking: ReviewCallBookingRecord = {
    id: nextId("booking"),
    clientId: input.clientId,
    proposalId: input.proposalId,
    provider: input.provider,
    scheduledAt: input.scheduledAt,
    durationMinutes: input.durationMinutes ?? 30,
    meetingLink: buildMeetingLink(input.provider, input.clientId),
    calendarHoldId: `cal_${input.clientId}_${Date.now()}`,
    status: "BOOKED",
    bookedBy: input.actor.fullName,
    bookedAt: nowIso()
  };

  state.reviewCallBookings.unshift(booking);
  await writeReviewCallBookingRecords(state.reviewCallBookings);
  appendTimeline(
    input.clientId,
    "Review call booked",
    `Calendar held for ${input.scheduledAt}. Meeting link generated: ${booking.meetingLink}`,
    "Booking",
    input.actor.role
  );
  return booking;
}

export async function completeReviewCall(input: {
  bookingId: string;
  outcome: "COMPLETED" | "CANCELLED";
  actor: AppUser;
  note?: string;
}) {
  const state = getAppState();
  const booking = state.reviewCallBookings.find((item) => item.id === input.bookingId);
  if (!booking) {
    throw new Error("Review call booking not found.");
  }

  booking.status = input.outcome;
  await writeReviewCallBookingRecords(state.reviewCallBookings);
  appendTimeline(
    booking.clientId,
    input.outcome === "COMPLETED" ? "Review call completed" : "Review call cancelled",
    input.note
      ? `${input.note} Meeting link: ${booking.meetingLink}`
      : `Booking updated to ${input.outcome}. Meeting link: ${booking.meetingLink}`,
    "Booking",
    input.actor.role
  );
  return booking;
}

export function approveCommercialProposal(proposalId: string, reviewer: AppUser) {
  const state = getAppState();
  const proposal = state.commercialProposals.find((item) => item.id === proposalId);
  if (!proposal) {
    throw new Error("Proposal not found.");
  }
  if (reviewer.role !== "SUPER_ADMIN") {
    throw new Error("Only a Super-Admin can approve the commercial proposal.");
  }

  proposal.status = "APPROVED";
  proposal.reviewerId = reviewer.id;
  proposal.superAdminApprovedAt = new Date().toISOString();
  appendTimeline(proposal.clientId, "Commercial proposal approved", `Default package cleared by ${reviewer.fullName}.`, "Commercial", reviewer.role);
  return proposal;
}

export function approveAdvancePayment(clientId: string, proposalId: string, amountInr: number, reviewer: AppUser) {
  const state = getAppState();
  const proposal = state.commercialProposals.find((item) => item.id === proposalId);
  if (!proposal) {
    throw new Error("Proposal not found.");
  }
  if (proposal.status !== "APPROVED") {
    throw new Error("The commercial proposal must be approved before the advance can be accepted.");
  }

  const payment: PaymentRecord = {
    id: nextId("payment"),
    clientId,
    proposalId,
    type: "ADVANCE",
    amountInr,
    status: amountInr >= MIN_ADVANCE_INR ? "APPROVED" : "PENDING",
    approvedAt: amountInr >= MIN_ADVANCE_INR ? new Date().toISOString() : undefined
  };

  state.payments.unshift(payment);
  appendTimeline(clientId, "Advance payment recorded", `${formatMoney(amountInr)} advance marked ${payment.status}.`, "Payments", reviewer.role);
  return payment;
}

export async function verifyAdvanceProofAndOpenCase(input: {
  clientId: string;
  proposalId: string;
  amountInr: number;
  referenceScreenshotUrl: string;
  referenceScreenshotFileName: string;
  actor: AppUser;
}) {
  const state = getAppState();
  const proposal = state.commercialProposals.find((item) => item.id === input.proposalId);
  if (!proposal) {
    throw new Error("Proposal not found.");
  }
  if (proposal.status !== "APPROVED") {
    throw new Error("The commercial proposal must be approved before advance proof can be verified.");
  }

  const payment = approveAdvancePayment(input.clientId, input.proposalId, input.amountInr, input.actor);
  payment.referenceScreenshotUrl = input.referenceScreenshotUrl;
  payment.referenceScreenshotFileName = input.referenceScreenshotFileName;
  payment.verifiedBy = input.actor.fullName;
  payment.verifiedAt = nowIso();
  payment.verificationNote = "Reference screenshot uploaded and checked against the advance amount.";

  const verification: AdvanceVerificationRecord = {
    id: nextId("advver"),
    clientId: input.clientId,
    proposalId: input.proposalId,
    amountInr: input.amountInr,
    referenceScreenshotUrl: input.referenceScreenshotUrl,
    referenceScreenshotFileName: input.referenceScreenshotFileName,
    verifiedBy: input.actor.fullName,
    verifiedAt: payment.verifiedAt!,
    paymentId: payment.id,
    status: "VERIFIED"
  };

  state.advanceVerifications.unshift(verification);
  await writeAdvanceVerificationRecords(state.advanceVerifications);

  let caseRecord = state.vastuCases.find((item) => item.clientId === input.clientId && item.proposalId === input.proposalId);
  if (!caseRecord) {
    try {
      caseRecord = createVastuCase(input.clientId, input.proposalId);
      verification.caseId = caseRecord.id;
      verification.status = "CASE_OPENED";
      appendTimeline(input.clientId, "Advance verified and case opened", `Reference screenshot checked. Case ${caseRecord.caseNumber} opened automatically.`, "Payments", input.actor.role);
    } catch (error) {
      appendTimeline(input.clientId, "Advance verified", "Advance was checked, but automatic case opening could not complete.", "Payments", input.actor.role);
    }
  } else {
    verification.caseId = caseRecord.id;
    verification.status = "CASE_OPENED";
    appendTimeline(input.clientId, "Advance verified", `Reference screenshot checked for case ${caseRecord.caseNumber}.`, "Payments", input.actor.role);
  }

  return { payment, verification, caseRecord };
}

export function createVastuCase(clientId: string, proposalId: string) {
  const state = getAppState();
  const proposal = state.commercialProposals.find((item) => item.id === proposalId);
  if (!proposal) {
    throw new Error("Proposal not found.");
  }

  const advance = state.payments.find((payment) => payment.clientId === clientId && payment.proposalId === proposalId && payment.type === "ADVANCE");
  if (!canCreateCase(proposal, advance)) {
    throw new Error("Advance approval is required before the case can be created.");
  }

  const record = state.vastuCases.find((item) => item.clientId === clientId && item.proposalId === proposalId);
  if (record) {
    return record;
  }

  const caseNumber = `UV-${new Date().getFullYear()}-${String(state.vastuCases.length + 1).padStart(3, "0")}`;
  const nextCase = {
    id: nextId("case"),
    caseNumber,
    clientId,
    proposalId,
    status: "CASE_CREATED",
    reportStatus: "DRAFT",
    orientationLocked: false,
    balanceApproved: false,
    fullPaymentApproved: false
  } satisfies (typeof state.vastuCases)[number];

  state.vastuCases.unshift(nextCase);
  const primaryFloor: FloorWorkspaceRecord = {
    id: nextId("floor"),
    caseId: nextCase.id,
    floorLabel: "Ground floor",
    status: "DRAFT",
    locked: false,
    evidenceUploads: []
  };

  state.floorWorkspaces.unshift(primaryFloor);
  appendTimeline(clientId, "Case created", `Case ${caseNumber} opened after advance approval.`, "Case", "ADMIN");
  return nextCase;
}

export function addFloorWorkspace(caseId: string, floorLabel: string, actor: AppUser) {
  const state = getAppState();
  const caseRecord = state.vastuCases.find((item) => item.id === caseId);
  if (!caseRecord) {
    throw new Error("Case not found.");
  }

  const normalizedLabel = String(floorLabel ?? "").trim();
  if (!normalizedLabel) {
    throw new Error("Floor label is required.");
  }

  const existing = state.floorWorkspaces.find(
    (workspace) => workspace.caseId === caseId && workspace.floorLabel.toLowerCase() === normalizedLabel.toLowerCase()
  );
  if (existing) {
    return existing;
  }

  const workspace: FloorWorkspaceRecord = {
    id: nextId("floor"),
    caseId,
    floorLabel: normalizedLabel,
    status: "DRAFT",
    locked: false,
    evidenceUploads: []
  };

  state.floorWorkspaces.unshift(workspace);
  caseRecord.status = caseRecord.orientationLocked ? caseRecord.status : "FLOOR_WORKSPACE_ACTIVE";
  appendTimeline(caseRecord.clientId, "Floor workspace created", `${normalizedLabel} added to the case workspace.`, "Workspace", actor.role);
  return workspace;
}

export function addFloorEvidence(floorId: string, fileName: string, actor: AppUser) {
  const state = getAppState();
  const workspace = state.floorWorkspaces.find((item) => item.id === floorId);
  if (!workspace) {
    throw new Error("Floor workspace not found.");
  }

  const caseRecord = state.vastuCases.find((item) => item.id === workspace.caseId);
  if (!caseRecord) {
    throw new Error("Case not found.");
  }

  const normalizedFileName = String(fileName ?? "").trim();
  if (!normalizedFileName) {
    throw new Error("Evidence file name is required.");
  }

  if (!workspace.evidenceUploads.includes(normalizedFileName)) {
    workspace.evidenceUploads.push(normalizedFileName);
  }

  appendTimeline(caseRecord.clientId, "Evidence added", `${normalizedFileName} attached to ${workspace.floorLabel}.`, "Workspace", actor.role);
  return workspace;
}

export function markFloorWorkspaceReady(floorId: string, actor: AppUser) {
  const state = getAppState();
  const workspace = state.floorWorkspaces.find((item) => item.id === floorId);
  if (!workspace) {
    throw new Error("Floor workspace not found.");
  }

  const caseRecord = state.vastuCases.find((item) => item.id === workspace.caseId);
  if (!caseRecord) {
    throw new Error("Case not found.");
  }

  workspace.status = workspace.locked ? "LOCKED" : "READY_FOR_REVIEW";
  if (!caseRecord.orientationLocked) {
    caseRecord.status = "FLOOR_WORKSPACE_ACTIVE";
  }

  appendTimeline(caseRecord.clientId, "Floor marked ready", `${workspace.floorLabel} is ready for consultant review.`, "Workspace", actor.role);
  return workspace;
}

export function lockOrientation(caseId: string, reason: string, actor: AppUser) {
  const state = getAppState();
  const caseRecord = state.vastuCases.find((item) => item.id === caseId);
  if (!caseRecord) {
    throw new Error("Case not found.");
  }
  caseRecord.orientationLocked = true;
  caseRecord.status = "ORIENTATION_LOCKED";

  const workspaces = state.floorWorkspaces.filter((workspace) => workspace.caseId === caseId);
  const updated = workspaces.map((workspace) => lockWorkspace(workspace, reason));
  state.floorWorkspaces = state.floorWorkspaces.map((workspace) => {
    const match = updated.find((item) => item.id === workspace.id);
    return match ?? workspace;
  });

  appendTimeline(caseRecord.clientId, "Orientation locked", reason, "Workspace", actor.role);
  return { caseRecord, workspaces: updated };
}

export function approveBalancePayment(clientId: string, caseId: string, amountInr: number, reviewer: AppUser) {
  const state = getAppState();
  const caseRecord = state.vastuCases.find((item) => item.id === caseId);
  if (!caseRecord) {
    throw new Error("Case not found.");
  }
  if (caseRecord.status === "VERDICT_RELEASED") {
    throw new Error("The verdict has already been released for this case.");
  }

  const payment: PaymentRecord = {
    id: nextId("payment"),
    clientId,
    caseId,
    type: "BALANCE",
    amountInr,
    status: "APPROVED",
    approvedAt: new Date().toISOString()
  };

  state.payments.unshift(payment);
  caseRecord.balanceApproved = true;
  caseRecord.fullPaymentApproved = true;
  caseRecord.status = "FULL_PAYMENT_APPROVED";
  caseRecord.reportStatus = "READY_FOR_APPROVAL";

  appendTimeline(clientId, "Balance approved", `${formatMoney(amountInr)} balance cleared.`, "Payments", reviewer.role);
  return payment;
}

export function verifyBalanceProof(input: {
  clientId: string;
  caseId: string;
  amountInr: number;
  referenceScreenshotUrl: string;
  referenceScreenshotFileName: string;
  actor: AppUser;
}) {
  const state = getAppState();
  const caseRecord = state.vastuCases.find((item) => item.id === input.caseId);
  if (!caseRecord) {
    throw new Error("Case not found.");
  }

  const payment = approveBalancePayment(input.clientId, input.caseId, input.amountInr, input.actor);
  payment.referenceScreenshotUrl = input.referenceScreenshotUrl;
  payment.referenceScreenshotFileName = input.referenceScreenshotFileName;
  payment.verifiedBy = input.actor.fullName;
  payment.verifiedAt = nowIso();
  payment.verificationNote = "Balance reference screenshot uploaded and checked before unlocking the final report flow.";

  appendTimeline(
    input.clientId,
    "Balance proof verified",
    `${formatMoney(input.amountInr)} balance verified from ${input.referenceScreenshotFileName}. Final report flow is now unlocked.`,
    "Payments",
    input.actor.role
  );

  return { payment, caseRecord };
}

export async function generatePreviewReport(caseId: string, actor: AppUser) {
  const state = getAppState();
  const caseRecord = state.vastuCases.find((item) => item.id === caseId);
  if (!caseRecord) {
    throw new Error("Case not found.");
  }
  if (caseRecord.status === "VERDICT_RELEASED") {
    throw new Error("Cannot generate a preview for a released verdict.");
  }

  const report: ReportVersionRecord = {
      id: nextId("report"),
      caseId,
      versionLabel: "Stage-A Preview",
      isPreview: true,
      status: "PAYMENT_BLOCKED",
      watermarkText: "Preview only. Balance pending.",
      approvals: []
    } satisfies ReportVersionRecord;
  const { createArtifactManifest, PREVIEW_WATERMARK } = await import("@/lib/report-artifacts");
  report.watermarkText = PREVIEW_WATERMARK;
  report.artifact = await createArtifactManifest(state, report, actor);
  state.reportVersions.unshift(report);
  caseRecord.reportStatus = "PAYMENT_BLOCKED";

  appendTimeline(caseRecord.clientId, "Stage-A preview generated", "Watermarked preview ready for the team.", "Reports", "CONSULTANT");
  return report;
}

export async function prepareFinalReport(caseId: string, actor: AppUser) {
  const state = getAppState();
  const caseRecord = state.vastuCases.find((item) => item.id === caseId);
  if (!caseRecord) {
    throw new Error("Case not found.");
  }
  if (!caseRecord.balanceApproved || !caseRecord.fullPaymentApproved) {
    throw new Error("Final report can only be prepared after the balance is approved.");
  }

  const existing = state.reportVersions.find((item) => item.caseId === caseId && !item.isPreview && item.status !== "RELEASED");
  if (existing?.artifact?.immutable) {
    throw new Error("This report version is immutable. Create a new revision instead of changing it.");
  }
  const report: ReportVersionRecord = {
      id: nextId("report"),
      caseId,
      versionLabel: "Official Verdict Report",
      isPreview: false,
      status: "READY_FOR_APPROVAL",
      approvals: []
    } satisfies ReportVersionRecord;
  const { createArtifactManifest } = await import("@/lib/report-artifacts");
  report.artifact = await createArtifactManifest(state, report, actor);
  state.reportVersions.unshift(report);

  caseRecord.reportStatus = "READY_FOR_APPROVAL";
  caseRecord.status = "REPORT_APPROVAL_PENDING";
  appendTimeline(caseRecord.clientId, "Final report prepared", `Official verdict report prepared by ${actor.fullName}.`, "Reports", actor.role);
  return report;
}

export function createEvaluationSnapshot(caseId: string, snapshotName: unknown = "Residential tab evaluation", zoneCodes: unknown = undefined, actor: AppUser) {
  const state = getAppState();
  const { caseRecord } = assertCaseReadyForEvaluation(state, caseId);
  const cleanSnapshotName = boundedRequiredString(snapshotName, "Snapshot name", MAX_SNAPSHOT_NAME_LENGTH);
  if (zoneCodes !== undefined && !Array.isArray(zoneCodes)) throw new Error("Zone codes must be a list.");
  const selectedZoneCodes = zoneCodes === undefined ? state.utilityRules.map((rule) => rule.zoneCode) : zoneCodes;
  if (!Array.isArray(selectedZoneCodes) || selectedZoneCodes.length === 0) throw new Error("Choose at least one zone code.");
  if (selectedZoneCodes.some((zoneCode) => typeof zoneCode !== "string" || !zoneCode.trim())) throw new Error("Every zone code must be a non-blank string.");
  if (new Set(selectedZoneCodes).size !== selectedZoneCodes.length) throw new Error("Zone codes must not contain duplicates.");
  const knownZoneCodes = new Set(state.utilityRules.map((rule) => rule.zoneCode));
  const unknownZoneCode = selectedZoneCodes.find((zoneCode) => !knownZoneCodes.has(zoneCode));
  if (unknownZoneCode) throw new Error(`Unknown zone code: ${unknownZoneCode}.`);
  const caseInputs = {
    caseId: caseRecord.id,
    caseStatus: caseRecord.status,
    orientationLocked: caseRecord.orientationLocked,
    floors: state.floorWorkspaces
      .filter((floor) => floor.caseId === caseId)
      .map(({ id, floorLabel, status, locked }) => ({ id, floorLabel, status, locked }))
      .sort((left, right) => left.id.localeCompare(right.id))
  };
  const generatedMatrix = generateUtilityEvaluation(
    state.utilityRules,
    selectedZoneCodes.map((zoneCode) => ({ zoneCode }))
  ).map((entry) => ({
    code: entry.zoneCode,
    verdict: entry.verdict,
    confidence: entry.confidence,
    ...(state.utilityRules.find((rule) => rule.zoneCode === entry.zoneCode)?.id
      ? { ruleId: state.utilityRules.find((rule) => rule.zoneCode === entry.zoneCode)!.id }
      : {})
  }));
  const selectedRuleIds = generatedMatrix.flatMap((entry) => (entry.ruleId ? [entry.ruleId] : []));
  const sourceContentHash = deterministicContentHash(state.utilityRules.map((rule) => ({
    confidence: rule.confidence,
    description: rule.description,
    id: rule.id,
    sourceCsvRow: rule.sourceCsvRow,
    tabName: rule.tabName,
    verdict: rule.verdict,
    zoneCode: rule.zoneCode
  })));

  const inputHash = deterministicContentHash({ caseInputs, snapshotName: cleanSnapshotName, selectedZoneCodes, sourceContentHash });
  const existingSnapshot = state.evaluationSnapshots.find((item) => item.caseId === caseId);
  if (existingSnapshot) {
    if (existingSnapshot.provenance?.inputHash === inputHash) return existingSnapshot;
    throw new WorkflowConflictError("A different Utility evaluation already exists for this case. Start formal rectification before creating another snapshot.");
  }
  const snapshot: EvaluationSnapshotRecord = {
    id: nextId("eval"),
    caseId,
    snapshotName: cleanSnapshotName,
    sourceVersion: "residential-tab.csv",
    generatedMatrix,
    provenance: {
      inputHash,
      outputHash: deterministicContentHash(generatedMatrix),
      sourceContentHash,
      ruleSetFormatVersion: UTILITY_RULESET_FORMAT_VERSION,
      algorithmVersion: UTILITY_EVALUATION_ALGORITHM_VERSION,
      caseInputs,
      selectedRuleIds
    }
  };

  state.evaluationSnapshots.unshift(snapshot);
  appendTimeline(caseRecord.clientId, "Utility evaluation snapshot generated", `${cleanSnapshotName} captured from the master rule table by ${actor.fullName}.`, "Evaluation", actor);
  return snapshot;
}

export function recordShaktiSnapshot(caseId: string, values: number[], actor: AppUser) {
  const state = getAppState();
  const { caseRecord } = assertCaseReadyForEvaluation(state, caseId);

  const inputValues = validateShaktiInputs(values);
  const ranking = rankShakti(inputValues);
  const caseInputs = {
    caseId: caseRecord.id,
    caseStatus: caseRecord.status,
    orientationLocked: caseRecord.orientationLocked,
    floors: state.floorWorkspaces
      .filter((floor) => floor.caseId === caseId)
      .map(({ id, floorLabel, status, locked }) => ({ id, floorLabel, status, locked }))
      .sort((left, right) => left.id.localeCompare(right.id))
  };
  const output = { elementAverages: ranking.averages, rankedVerdicts: ranking.ranked, tieBreakUsed: ranking.tieBreakUsed };
  const inputHash = deterministicContentHash({ caseInputs, inputValues });
  const existingSnapshot = state.shaktiSnapshots.find((item) => item.caseId === caseId);
  if (existingSnapshot) {
    if (existingSnapshot.provenance?.inputHash === inputHash) return existingSnapshot;
    throw new WorkflowConflictError("A different Shakti evaluation already exists for this case. Start formal rectification before creating another snapshot.");
  }
  const snapshot: ShaktiSnapshotRecord = {
    id: nextId("shakti"),
    caseId,
    inputValues,
    elementAverages: ranking.averages,
    rankedVerdicts: ranking.ranked,
    tieBreakUsed: ranking.tieBreakUsed,
    provenance: {
      inputHash,
      outputHash: deterministicContentHash(output),
      algorithmVersion: SHAKTI_ALGORITHM_VERSION,
      mappingVersion: SHAKTI_MAPPING_VERSION,
      roundingVersion: SHAKTI_ROUNDING_VERSION,
      caseInputs
    }
  };

  state.shaktiSnapshots.unshift(snapshot);
  appendTimeline(caseRecord.clientId, "Shakti snapshot generated", `Computed from ${values.length} input values by ${actor.fullName}.`, "Evaluation", actor);
  return snapshot;
}

export function approveReport(reportId: string, actor: AppUser, comment = "Reviewed and approved") {
  const state = getAppState();
  const report = state.reportVersions.find((item) => item.id === reportId);
  if (!report) {
    throw new Error("Report not found.");
  }
  const caseRecord = state.vastuCases.find((item) => item.id === report.caseId);
  if (!caseRecord) {
    throw new Error("Case not found.");
  }
  if (report.isPreview) {
    throw new Error("Preview reports cannot be approved as final verdict reports.");
  }
  if (!caseRecord.balanceApproved || !caseRecord.fullPaymentApproved) {
    throw new Error("Balance approval is required before the final report can be approved.");
  }
  if (report.status !== "READY_FOR_APPROVAL" && report.status !== "APPROVED") {
    throw new Error("Report is not in an approvable state.");
  }
  if (!report.artifact?.immutable) throw new Error("This legacy report has no immutable artifact and cannot receive new approvals.");
  if (report.artifact.createdBy.id === actor.id) throw new Error("The report creator cannot approve their own report.");
  if (report.approvalEvidence?.some((item) => item.actorId === actor.id) || report.approvals.includes(actor.id)) throw new Error("This person has already approved this report version.");
  const cleanComment = comment.trim();
  if (cleanComment.length < 3) throw new Error("Approval comment must explain the review decision.");

  report.approvals = Array.from(new Set([...(report.approvals ?? []), actor.id]));
  report.approvalEvidence = [...(report.approvalEvidence ?? []), { actorId: actor.id, actorName: actor.fullName, actorRole: actor.role, approvedAt: nowIso(), comment: cleanComment, artifactHash: report.artifact.contentHash }];
  report.status = report.approvals.length >= 2 ? "APPROVED" : "READY_FOR_APPROVAL";
  caseRecord.reportStatus = report.status;
  caseRecord.status = (report.approvals ?? []).length >= 2 ? "REPORT_APPROVED" : "REPORT_APPROVAL_PENDING";

  appendTimeline(caseRecord.clientId, "Report approved", `${actor.fullName} signed off the report version.`, "Reports", actor.role);
  return report;
}

export function releaseVerdict(reportId: string, actor: AppUser) {
  const state = getAppState();
  const report = state.reportVersions.find((item) => item.id === reportId);
  if (!report) {
    throw new Error("Report not found.");
  }
  const caseRecord = state.vastuCases.find((item) => item.id === report.caseId);
  if (!caseRecord) {
    throw new Error("Case not found.");
  }
  if (!caseRecord.balanceApproved || !caseRecord.fullPaymentApproved) {
    throw new Error("Verdict release is blocked until the balance is approved.");
  }
  if (report.status !== "APPROVED" || caseRecord.reportStatus !== "APPROVED") {
    throw new Error("Verdict release requires an approved report.");
  }
  if ((report.approvals ?? []).length < 2) {
    throw new Error("Verdict release requires two report approvals.");
  }
  if (!report.artifact?.immutable || (report.approvalEvidence?.length ?? 0) < 2) throw new Error("Verdict release requires two evidenced approvals on an immutable artifact.");
  if (new Set(report.approvalEvidence?.map((item) => item.actorId)).size < 2) throw new Error("Verdict release requires two distinct approvers.");
  if (report.approvalEvidence?.some((item) => item.actorId === report.artifact?.createdBy.id || item.artifactHash !== report.artifact?.contentHash)) throw new Error("Approval evidence does not match the immutable artifact.");

  caseRecord.status = "VERDICT_RELEASED";
  caseRecord.reportStatus = "RELEASED";
  report.status = "RELEASED";
  appendTimeline(caseRecord.clientId, "Verdict released", `Released by ${actor.fullName} after approvals.`, "Reports", actor.role);
  return report;
}

export function evaluateUtilityRules(rules: UtilityRule[], zoneCodes: string[]) {
  return generateUtilityEvaluation(rules, zoneCodes.map((zoneCode) => ({ zoneCode })));
}

export function rankShaktiValues(values: number[]) {
  return rankShakti(values);
}

export function sendWhatsAppTemplate(templateId: string, clientId: string, recipientPhone: string, sentBy: AppUser) {
  const state = getAppState();
  const template = state.whatsappTemplates.find((item) => item.id === templateId);
  if (!template) {
    throw new Error("Template not found.");
  }

  const log = {
    id: nextId("wlog"),
    clientId,
    templateId,
    recipientPhone,
    status: "QUEUED",
    sentAt: new Date().toISOString()
  } satisfies WhatsAppTemplateLogRecord;

  state.whatsappLogs.unshift(log);
  appendTimeline(
    clientId,
    `WhatsApp template queued: ${template.title}`,
    `Queued locally for ${recipientPhone} by ${sentBy.fullName}; provider delivery is not configured.`,
    "WhatsApp",
    sentBy.role
  );
  return log;
}

export function recordClientOutreachSend(input: {
  clientId: string;
  stepKey: string;
  channel: "email" | "whatsapp";
  title: string;
  sentBy: AppUser;
}) {
  appendTimeline(
    input.clientId,
    `${input.channel === "email" ? "Email" : "WhatsApp"} outreach recorded: ${input.title}`,
    `step=${input.stepKey};channel=${input.channel};status=RECORDED;by=${input.sentBy.fullName}`,
    "Outreach",
    input.sentBy.role
  );
  return {
    clientId: input.clientId,
    stepKey: input.stepKey,
    channel: input.channel,
    title: input.title,
    sentBy: input.sentBy.fullName,
    status: "RECORDED" as const,
    recordedAt: new Date().toISOString()
  };
}

export function toggleWhatsAppTemplate(templateId: string, active: boolean, actor: AppUser) {
  const state = getAppState();
  const template = state.whatsappTemplates.find((item) => item.id === templateId);
  if (!template) {
    throw new Error("Template not found.");
  }

  template.active = active;
  appendTimeline(
    state.clients[0]?.id ?? "",
    `WhatsApp template ${active ? "activated" : "paused"}`,
    `${template.title} was ${active ? "enabled" : "disabled"} by ${actor.fullName}.`,
    "WhatsApp",
    actor.role
  );
  return template;
}

export function createWhatsAppTemplate(input: {
  slug: string;
  title: string;
  category: string;
  body: string;
  variables: string[];
}, actor: AppUser) {
  const state = getAppState();
  const template = {
    id: nextId("tpl"),
    slug: input.slug,
    title: input.title,
    category: input.category,
    body: input.body,
    variables: input.variables,
    active: true
  } satisfies WhatsAppTemplateRecord;

  state.whatsappTemplates.unshift(template);
  appendTimeline(
    state.clients[0]?.id ?? "",
    "WhatsApp template created",
    `${input.title} was created by ${actor.fullName}.`,
    "WhatsApp",
    actor.role
  );
  return template;
}

export function getClientTimeline(clientId: string) {
  return getAppState().timelineEvents.filter((event) => event.clientId === clientId).sort((a, b) => new Date(b.happenedAt).getTime() - new Date(a.happenedAt).getTime());
}

export function getClientSnapshot(clientId: string) {
  const state = getAppState();
  const client = state.clients.find((item) => item.id === clientId);
  if (!client) {
    throw new Error("Client not found.");
  }

  return {
    client,
    lead: state.leadQualifications.find((item) => item.clientId === clientId),
    proposal: state.commercialProposals.find((item) => item.clientId === clientId),
    reviewCallBooking: state.reviewCallBookings.find((item) => item.clientId === clientId),
    payments: state.payments.filter((item) => item.clientId === clientId),
    advanceVerifications: state.advanceVerifications.filter((item) => item.clientId === clientId),
    caseRecord: state.vastuCases.find((item) => item.clientId === clientId),
    floors: state.floorWorkspaces.filter((item) => item.caseId === state.vastuCases.find((caseItem) => caseItem.clientId === clientId)?.id),
    reports: state.reportVersions.filter((item) => item.caseId === state.vastuCases.find((caseItem) => caseItem.clientId === clientId)?.id),
    timeline: getClientTimeline(clientId),
    utilityRules: state.utilityRules
  };
}
