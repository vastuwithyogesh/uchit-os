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
import { buildInboundLeadIdentity, buildStableClientId, normalizeCsvDate, normalizeLeadEmail, normalizeLeadPhone, type ParsedInboundLeadRow } from "@/lib/lead-import";
import { MIN_ADVANCE_INR, DEFAULT_PROPOSAL_AMOUNT_INR, canCreateCase, generateUtilityEvaluation, lockWorkspace, qualifyLead, rankShakti } from "@/lib/workflows";
import { getAppState, resetAppState } from "@/lib/store";
import { formatMoney } from "@/lib/workflows";
import { writeOptInLeadRecords } from "@/lib/optin-leads-store";
import { writeReviewCallBookingRecords } from "@/lib/review-call-bookings-store";
import { writeAdvanceVerificationRecords } from "@/lib/advance-verifications-store";

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

function appendTimeline(clientId: string, headline: string, details: string, category: string, actorRole?: AppUser["role"]) {
  const state = getAppState();
  const event: TimelineEvent = {
    id: nextId("event"),
    clientId,
    category,
    headline,
    details,
    happenedAt: new Date().toISOString(),
    actorRole
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

export function generatePreviewReport(caseId: string) {
  const state = getAppState();
  const caseRecord = state.vastuCases.find((item) => item.id === caseId);
  if (!caseRecord) {
    throw new Error("Case not found.");
  }
  if (caseRecord.status === "VERDICT_RELEASED") {
    throw new Error("Cannot generate a preview for a released verdict.");
  }

  const existingPreview = state.reportVersions.find((item) => item.caseId === caseId && item.isPreview);
  const report =
    existingPreview ??
    ({
      id: nextId("report"),
      caseId,
      versionLabel: "Stage-A Preview",
      isPreview: true,
      status: "PAYMENT_BLOCKED",
      watermarkText: "Preview only. Balance pending.",
      approvals: []
    } satisfies ReportVersionRecord);

  report.status = caseRecord.balanceApproved ? "READY_FOR_APPROVAL" : "PAYMENT_BLOCKED";
  report.watermarkText = caseRecord.balanceApproved ? undefined : "Preview only. Balance pending.";
  report.approvals = [];

  if (!existingPreview) {
    state.reportVersions.unshift(report);
  }
  caseRecord.reportStatus = "PAYMENT_BLOCKED";

  appendTimeline(caseRecord.clientId, "Stage-A preview generated", "Watermarked preview ready for the team.", "Reports", "CONSULTANT");
  return report;
}

export function prepareFinalReport(caseId: string, actor: AppUser) {
  const state = getAppState();
  const caseRecord = state.vastuCases.find((item) => item.id === caseId);
  if (!caseRecord) {
    throw new Error("Case not found.");
  }
  if (!caseRecord.balanceApproved || !caseRecord.fullPaymentApproved) {
    throw new Error("Final report can only be prepared after the balance is approved.");
  }

  const existing = state.reportVersions.find((item) => item.caseId === caseId && !item.isPreview);
  const report =
    existing ??
    ({
      id: nextId("report"),
      caseId,
      versionLabel: "Official Verdict Report",
      isPreview: false,
      status: "READY_FOR_APPROVAL",
      approvals: []
    } satisfies ReportVersionRecord);

  report.status = "READY_FOR_APPROVAL";
  report.watermarkText = undefined;

  if (!existing) {
    state.reportVersions.unshift(report);
  }

  caseRecord.reportStatus = "READY_FOR_APPROVAL";
  caseRecord.status = "REPORT_APPROVAL_PENDING";
  appendTimeline(caseRecord.clientId, "Final report prepared", `Official verdict report prepared by ${actor.fullName}.`, "Reports", actor.role);
  return report;
}

export function createEvaluationSnapshot(caseId: string, snapshotName = "Residential tab evaluation", zoneCodes?: string[]) {
  const state = getAppState();
  const caseRecord = state.vastuCases.find((item) => item.id === caseId);
  if (!caseRecord) {
    throw new Error("Case not found.");
  }

  const selectedZoneCodes = zoneCodes?.length ? zoneCodes : state.utilityRules.map((rule) => rule.zoneCode);
  const generatedMatrix = generateUtilityEvaluation(
    state.utilityRules,
    selectedZoneCodes.map((zoneCode) => ({ zoneCode }))
  ).map((entry) => ({
    code: entry.zoneCode,
    verdict: entry.verdict,
    confidence: entry.confidence
  }));

  const snapshot: EvaluationSnapshotRecord = {
    id: nextId("eval"),
    caseId,
    snapshotName,
    sourceVersion: "residential-tab.csv",
    generatedMatrix
  };

  state.evaluationSnapshots.unshift(snapshot);
  appendTimeline(caseRecord.clientId, "Utility evaluation snapshot generated", `${snapshotName} captured from the master rule table.`, "Evaluation", "CONSULTANT");
  return snapshot;
}

export function recordShaktiSnapshot(caseId: string, values: number[]) {
  const state = getAppState();
  const caseRecord = state.vastuCases.find((item) => item.id === caseId);
  if (!caseRecord) {
    throw new Error("Case not found.");
  }

  const ranking = rankShakti(values);
  const snapshot: ShaktiSnapshotRecord = {
    id: nextId("shakti"),
    caseId,
    inputValues: values,
    elementAverages: ranking.averages,
    rankedVerdicts: ranking.ranked,
    tieBreakUsed: ranking.tieBreakUsed
  };

  state.shaktiSnapshots.unshift(snapshot);
  appendTimeline(caseRecord.clientId, "Shakti snapshot generated", `Computed from ${values.length} input values.`, "Evaluation", "CONSULTANT");
  return snapshot;
}

export function approveReport(reportId: string, actor: AppUser) {
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

  report.approvals = Array.from(new Set([...(report.approvals ?? []), actor.id]));
  report.status = "APPROVED";
  caseRecord.reportStatus = "APPROVED";
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
