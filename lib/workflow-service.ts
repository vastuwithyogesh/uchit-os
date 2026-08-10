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
import { alignmentStatuses, attentionClasses, canonicalPipelineStages, canonicalServiceStages, caseDocumentTypes, decisionMakerStatuses, decisionPriorities, deliveryMilestoneKinds, deliveryMilestoneStatuses, documentRevisionStatuses, energyStatuses, implementationHorizons, implementationStatuses, placementStatuses, recommendationLevels, responsibilityRoles, serviceTypes, type AlignmentStatus, type AttentionClass, type CanonicalPipelineStage, type CanonicalServiceStage, type CaseDocumentType, type CaseDrawingReference, type CaseInputReadiness, type DecisionMakerStatus, type DecisionPriority, type DeliveryMilestoneKind, type DeliveryMilestoneStatus, type DocumentRevisionStatus, type EnergyStatus, type ImplementationHorizon, type ImplementationStatus, type PlacementStatus, type RecommendationLevel, type ResponsibilityRole, type VastuServiceType } from "@/lib/domain";
import { buildInboundLeadIdentity, buildStableClientId, normalizeCsvDate, normalizeLeadEmail, normalizeLeadPhone, type ParsedInboundLeadRow } from "@/lib/lead-import";
import { canCreateCase, generateUtilityEvaluation, lockWorkspace, rankShakti } from "@/lib/workflows";
import { getAppState, resetAppState } from "@/lib/store";
import { formatMoney } from "@/lib/workflows";
import { writeOptInLeadRecords } from "@/lib/optin-leads-store";
import { writeReviewCallBookingRecords } from "@/lib/review-call-bookings-store";
import {
  deterministicContentHash,
  SHAKTI_ALGORITHM_VERSION,
  SHAKTI_MAPPING_VERSION,
  SHAKTI_ROUNDING_VERSION,
  UTILITY_EVALUATION_ALGORITHM_VERSION,
  UTILITY_RULESET_FORMAT_VERSION,
  validateShaktiInputs
} from "@/lib/evaluation-provenance";
import { assertCaseReadyForEvaluation, getActiveCaseForClient, getServiceReadinessChecklist, normalizeCaseService, serviceDocumentRequirements } from "@/lib/service-framework";
import { artifactStillMatches } from "@/lib/report-artifacts";
import { assertCaseFileEvidenceRefs, assertCaseFileEvidenceScope } from "@/lib/case-file-assets.server";
import { getAllowedPipelineTransitions, normalizeClientPipeline } from "@/lib/crm-pipeline";
import { readPaymentProofForVerification } from "@/lib/payment-proof-assets.server";

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

export class PreconditionRequiredError extends Error {
  readonly statusCode = 428;
  constructor(message: string) { super(message); this.name = "PreconditionRequiredError"; }
}

function assertExpectedRecordVersion(caseRecord: { recordVersion?: number }, expectedRecordVersion: unknown) {
  if (!Number.isInteger(expectedRecordVersion) || (expectedRecordVersion as number) < 0) throw new PreconditionRequiredError("The latest case record version is required. Refresh the case and try again.");
  if ((caseRecord.recordVersion ?? 0) !== expectedRecordVersion) throw new WorkflowConflictError("This case changed since it was opened. Refresh the case and retry.");
}

function enumValue<T extends string>(value: unknown, values: readonly T[], label: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) throw new Error(`Choose a valid ${label}.`);
  return value as T;
}

function boundedRefs(value: unknown, label: string) {
  if (!Array.isArray(value) || value.length > 40 || value.some((item) => typeof item !== "string" || !item.trim() || item.trim().length > 240)) throw new Error(`${label} must contain at most 40 valid references.`);
  const refs = value.map((item) => (item as string).trim());
  if (new Set(refs).size !== refs.length) throw new Error(`${label} must not contain duplicates.`);
  return refs;
}

function assessmentContext(caseIdValue: unknown, allowArtifact = false) {
  const state = getAppState();
  const caseId = boundedRequiredString(caseIdValue, "Case ID");
  const caseRecord = state.vastuCases.find((item) => item.id === caseId);
  if (!caseRecord) throw new Error("Case not found.");
  if (getActiveCaseForClient(state, caseRecord.clientId)?.id !== caseId) throw new WorkflowConflictError("This is not the active case revision. Open the latest revision before recording assessment work.");
  if (!allowArtifact && state.reportVersions.some((item) => item.caseId === caseId && item.artifact)) throw new WorkflowConflictError("Assessment work is locked by an immutable report. Start formal rectification to continue.");
  return { state, caseRecord, caseId, serviceType: normalizeCaseService(caseRecord).serviceType, revisionNumber: caseRecord.revisionNumber ?? 1 };
}

function audit(actor: AppUser) { return { actorId: actor.id, actorName: actor.fullName, actorRole: actor.role, at: nowIso() }; }

export function transitionClientPipeline(input: Record<string, unknown> & { actor: AppUser }) {
  const state = getAppState();
  const clientId = boundedRequiredString(input.clientId, "Client ID");
  const client = state.clients.find((item) => item.id === clientId);
  if (!client) throw new Error("Client not found.");
  if (input.actor.role === "SETTER" && client.assignedSetterId && client.assignedSetterId !== input.actor.id) throw new WorkflowConflictError("Setters may update only clients assigned to them.");
  const idempotencyKey = boundedRequiredString(input.idempotencyKey, "Idempotency key", 120);
  const retry = state.pipelineTransitions.find((item) => item.clientId === clientId && item.idempotencyKey === idempotencyKey);
  if (retry) return { client, transition: retry };
  assertExpectedRecordVersion(client, input.expectedRecordVersion);
  const beforeStage = normalizeClientPipeline(client).stage;
  const afterStage = enumValue(input.pipelineStage, canonicalPipelineStages, "pipeline stage") as CanonicalPipelineStage;
  const correction = input.correction === true;
  const correctionReason = input.correctionReason === undefined || input.correctionReason === "" ? undefined : boundedRequiredString(input.correctionReason, "Correction reason", 500);
  const isAdmin = input.actor.role === "ADMIN" || input.actor.role === "SUPER_ADMIN";
  const allowed = getAllowedPipelineTransitions(beforeStage).includes(afterStage);
  if (!allowed && !(correction && isAdmin && correctionReason && correctionReason.length >= 20)) throw new WorkflowConflictError("Pipeline stages cannot move backwards or skip steps. An administrator may record an explicit correction with a reason of at least 20 characters.");
  if (correction && (!isAdmin || !correctionReason || correctionReason.length < 20)) throw new WorkflowConflictError("Administrative pipeline correction requires a reason of at least 20 characters.");
  const ownerId = input.actor.id;
  const ownerName = input.actor.fullName;
  const ownerRole = input.actor.role;
  const isTerminal = afterStage === "CLOSED_REFERRAL" || afterStage === "DISQUALIFIED";
  let nextAction: { summary: string; dueAt: string } | undefined;
  if (!isTerminal || input.nextAction !== undefined || input.nextActionDueAt !== undefined) {
    const dueAt = optionalMilestoneDate(input.nextActionDueAt, "Next action due date");
    if (!dueAt) throw new Error("Every active pipeline stage requires a dated next action.");
    if (new Date(dueAt).getTime() <= Date.now()) throw new Error("Next action due date must be in the future.");
    nextAction = { summary: boundedRequiredString(input.nextAction, "Next action", 500), dueAt };
  }
  const happenedAt = nowIso();
  const transition = { id: nextId("pipeline"), clientId, idempotencyKey, beforeStage, afterStage, owner: { id: ownerId, name: ownerName, role: ownerRole }, nextAction, correctionReason: correction ? correctionReason : undefined, actor: { id: input.actor.id, name: input.actor.fullName, role: input.actor.role }, happenedAt };
  Object.assign(client, { pipelineStage: afterStage, pipelineOwner: transition.owner, nextAction, recordVersion: (client.recordVersion ?? 0) + 1 });
  state.pipelineTransitions.unshift(transition);
  appendTimeline(clientId, "CRM pipeline updated", `${input.actor.fullName} moved ${beforeStage} to ${afterStage}; owner ${ownerName}; ${nextAction ? `next action due ${nextAction.dueAt}.` : "terminal stage has no next action."}${transition.correctionReason ? ` Correction: ${transition.correctionReason}` : ""}`, "CRM", input.actor);
  return { client, transition };
}

function boundedPolicyInteger(value: unknown, label: string, minimum: number, maximum: number) {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) throw new Error(`${label} must be a whole number from ${minimum} to ${maximum}.`);
  return Number(value);
}

export function updateCommercialPolicy(input: Record<string, unknown> & { actor: AppUser }) {
  const state = getAppState();
  if (input.actor.role !== "SUPER_ADMIN") throw new Error("Only a Super-Admin can publish commercial policy.");
  const idempotencyKey = boundedRequiredString(input.idempotencyKey, "Idempotency key", 120);
  const retry = state.commercialPolicyHistory.find((item) => item.idempotencyKey === idempotencyKey);
  if (retry) return retry;
  if (!Number.isSafeInteger(input.expectedPolicyVersion) || input.expectedPolicyVersion !== state.commercialPolicy.version) throw new WorkflowConflictError("Commercial policy changed. Refresh and retry with the current policy version.");
  const reason = boundedRequiredString(input.reason, "Policy change reason", 500);
  if (reason.length < 20) throw new Error("Policy change reason must be at least 20 characters.");
  const policy = { version: state.commercialPolicy.version + 1, defaultProposalAmountInr: boundedPolicyInteger(input.defaultProposalAmountInr, "Default proposal amount", 1, 100_000_000), minimumAdvanceInr: boundedPolicyInteger(input.minimumAdvanceInr, "Minimum advance", 1, 100_000_000), qualificationCallTargetMinutes: boundedPolicyInteger(input.qualificationCallTargetMinutes, "Qualification call target", 1, 1440), nextActionDueSoonHours: boundedPolicyInteger(input.nextActionDueSoonHours, "Next-action due-soon threshold", 1, 720), defaultReviewCallMinutes: boundedPolicyInteger(input.defaultReviewCallMinutes, "Default review-call duration", 5, 480), reason, updatedAt: nowIso(), updatedBy: { id: input.actor.id, name: input.actor.fullName, role: input.actor.role }, idempotencyKey };
  if (policy.minimumAdvanceInr > policy.defaultProposalAmountInr) throw new Error("Minimum advance cannot exceed the default proposal amount.");
  state.commercialPolicy = policy;
  state.commercialPolicyHistory.unshift(policy);
  appendTimeline("system", "Commercial policy updated", `${input.actor.fullName} published commercial policy v${policy.version}: ${reason}`, "Commercial", input.actor);
  return policy;
}

function intakeObject(value: unknown, label: string, allowedFields: readonly string[]) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be a structured object.`);
  const object = value as Record<string, unknown>;
  const unknown = Object.keys(object).find((key) => !allowedFields.includes(key));
  if (unknown) throw new Error(`Unknown ${label.toLowerCase()} field: ${unknown}.`);
  return object;
}

function optionalIntakeString(value: unknown, label: string, maxLength = 500) {
  if (value === undefined || value === null || value === "") return undefined;
  const clean = boundedRequiredString(value, label, maxLength);
  if (/[\u0000-\u001f\u007f<>]/.test(clean) || /(?:^|\s)(?:[a-z][a-z0-9+.-]*:|www\.)\S*/i.test(clean) || /^(?:\/|\\|\.\.)/.test(clean) || /(?:\/|\\)\.\.(?:\/|\\)/.test(clean)) {
    throw new Error(`${label} must not contain HTML, a URL, or an embedded data payload.`);
  }
  return clean;
}

export function upsertClientIntake(input: Record<string, unknown> & { actor: AppUser }) {
  const state = getAppState();
  const clientId = boundedRequiredString(input.clientId, "Client ID");
  const client = state.clients.find((item) => item.id === clientId);
  if (!client) throw new Error("Client not found.");
  if (input.actor.role === "SETTER" && client.assignedSetterId && client.assignedSetterId !== input.actor.id) throw new WorkflowConflictError("Setters may update intake only for clients assigned to them.");
  const idempotencyKey = boundedRequiredString(input.idempotencyKey, "Idempotency key", 120);
  const existing = state.clientIntakeProfiles.find((item) => item.clientId === clientId);
  if (existing?.idempotencyKey === idempotencyKey) return existing;
  assertExpectedRecordVersion(client, input.expectedRecordVersion);
  const activeCase = getActiveCaseForClient(state, clientId);
  if (activeCase && state.reportVersions.some((item) => item.caseId === activeCase.id && item.artifact)) throw new WorkflowConflictError("Client intake is locked by an immutable report. Use formal case rectification before changing intake evidence.");

  const contactInput = intakeObject(input.contactPreference, "Contact preference", ["whatsapp", "preferredLanguage", "preferredContactWindow"]);
  let whatsapp: string | undefined;
  if (contactInput?.whatsapp !== undefined && contactInput.whatsapp !== "") {
    if (typeof contactInput.whatsapp !== "string") throw new Error("WhatsApp number must be text in international format.");
    whatsapp = contactInput.whatsapp.replace(/[\s()-]/g, "");
    if (!/^\+[1-9]\d{7,14}$/.test(whatsapp)) throw new Error("WhatsApp number must use valid international E.164 format.");
  }
  const contactPreference = contactInput ? { whatsapp, preferredLanguage: optionalIntakeString(contactInput.preferredLanguage, "Preferred language", 80), preferredContactWindow: optionalIntakeString(contactInput.preferredContactWindow, "Preferred contact window", 120) } : undefined;

  const businessInput = intakeObject(input.businessContext, "Business context", ["company", "industry", "designation", "vision"]);
  const businessContext = businessInput ? { company: optionalIntakeString(businessInput.company, "Company", 160), industry: optionalIntakeString(businessInput.industry, "Industry", 120), designation: optionalIntakeString(businessInput.designation, "Designation", 120), vision: optionalIntakeString(businessInput.vision, "Business vision", 1000) } : undefined;
  const decisionMakerStatus = input.decisionMakerStatus === undefined || input.decisionMakerStatus === "" ? undefined : enumValue(input.decisionMakerStatus, decisionMakerStatuses, "decision-maker status") as DecisionMakerStatus;
  const otherDecisionMakers = optionalIntakeString(input.otherDecisionMakers, "Other decision makers", 500);

  const propertyInput = intakeObject(input.propertyContext, "Property context", ["serviceInterest", "propertyType", "propertyStatus", "areaValue", "areaUnit", "cityCountry", "constraints"]);
  let areaValue: number | undefined;
  if (propertyInput?.areaValue !== undefined && propertyInput.areaValue !== null && propertyInput.areaValue !== "") {
    if (typeof propertyInput.areaValue !== "number" || !Number.isFinite(propertyInput.areaValue) || propertyInput.areaValue <= 0 || propertyInput.areaValue > 1_000_000_000) throw new Error("Area must be a finite number greater than zero and no more than 1,000,000,000.");
    areaValue = propertyInput.areaValue;
  }
  const areaUnit = propertyInput ? optionalIntakeString(propertyInput.areaUnit, "Area unit", 40) : undefined;
  if ((areaValue === undefined) !== (areaUnit === undefined)) throw new Error("Area value and area unit must be provided together.");
  const serviceInterest = propertyInput?.serviceInterest === undefined || propertyInput.serviceInterest === "" ? undefined : enumValue(propertyInput.serviceInterest, serviceTypes, "service interest") as VastuServiceType;
  const propertyContext = propertyInput ? { serviceInterest, propertyType: optionalIntakeString(propertyInput.propertyType, "Property type", 120), propertyStatus: optionalIntakeString(propertyInput.propertyStatus, "Property status", 120), areaValue, areaUnit, cityCountry: optionalIntakeString(propertyInput.cityCountry, "City and country", 160), constraints: optionalIntakeString(propertyInput.constraints, "Property constraints", 1000) } : undefined;

  const needsInput = intakeObject(input.needs, "Needs", ["mainChallenge", "desiredOutcome", "urgency"]);
  const needs = needsInput ? { mainChallenge: optionalIntakeString(needsInput.mainChallenge, "Main challenge", 1000), desiredOutcome: optionalIntakeString(needsInput.desiredOutcome, "Desired outcome", 1000), urgency: optionalIntakeString(needsInput.urgency, "Urgency", 120) } : undefined;

  const consentInput = intakeObject(input.consent, "Consent", ["version", "contact", "accuracy", "confidentiality"]);
  if (!consentInput || consentInput.version !== "uchit-intake/v1") throw new Error("Consent version must be uchit-intake/v1.");
  for (const key of ["contact", "accuracy", "confidentiality"] as const) if (consentInput[key] !== undefined && typeof consentInput[key] !== "boolean") throw new Error(`Consent ${key} must be true or false.`);
  const consentComplete = consentInput.contact === true && consentInput.accuracy === true && consentInput.confidentiality === true;
  const stamp = audit(input.actor);
  const profile = { clientId, version: (existing?.version ?? 0) + 1, idempotencyKey, contactPreference, businessContext, decisionMakerStatus, otherDecisionMakers, propertyContext, needs, consent: { version: "uchit-intake/v1" as const, contact: consentInput.contact as boolean | undefined, accuracy: consentInput.accuracy as boolean | undefined, confidentiality: consentInput.confidentiality as boolean | undefined, confirmedAt: consentComplete ? (existing?.consent.confirmedAt ?? stamp.at) : undefined }, created: existing?.created ?? stamp, updated: stamp };
  if (existing) Object.assign(existing, profile); else state.clientIntakeProfiles.unshift(profile);
  client.recordVersion = (client.recordVersion ?? 0) + 1;
  appendTimeline(clientId, "Client intake updated", `${input.actor.fullName} recorded client intake profile version ${profile.version}.`, "CRM", input.actor);
  return profile;
}

export function upsertAssessmentObservation(input: Record<string, unknown> & { actor: AppUser }) {
  const { state, caseRecord, caseId, serviceType, revisionNumber } = assessmentContext(input.caseId);
  const idempotencyKey = boundedRequiredString(input.idempotencyKey, "Idempotency key", 120);
  const retry = state.assessmentObservations.find((item) => item.caseId === caseId && item.idempotencyKey === idempotencyKey);
  if (retry) return retry;
  assertExpectedRecordVersion(caseRecord, input.expectedRecordVersion);
  const recordId = input.recordId === undefined ? undefined : boundedRequiredString(input.recordId, "Observation ID");
  const existing = recordId ? state.assessmentObservations.find((item) => item.id === recordId && item.caseId === caseId) : undefined;
  if (recordId && !existing) throw new Error("Observation not found on this case revision.");
  const evidenceRefs = boundedRefs(input.evidenceRefs, "Evidence references");
  if (existing && deterministicContentHash(existing.evidenceRefs) !== deterministicContentHash(evidenceRefs)) throw new WorkflowConflictError("Evidence references are immutable. Create a new observation for different evidence.");
  const stamp = audit(input.actor);
  const next = { id: existing?.id ?? nextId("observation"), caseId, caseRevisionNumber: revisionNumber, serviceType, version: (existing?.version ?? 0) + 1, idempotencyKey, title: boundedRequiredString(input.title, "Observation title", 160), observation: boundedRequiredString(input.observation, "Observation", 2000), alignmentStatus: enumValue(input.alignmentStatus, alignmentStatuses, "alignment status") as AlignmentStatus, energyStatus: enumValue(input.energyStatus, energyStatuses, "energy status") as EnergyStatus, placementStatus: enumValue(input.placementStatus, placementStatuses, "placement status") as PlacementStatus, evidenceRefs, created: existing?.created ?? stamp, updated: stamp };
  if (existing) Object.assign(existing, next); else state.assessmentObservations.unshift(next);
  caseRecord.recordVersion = (caseRecord.recordVersion ?? 0) + 1;
  appendTimeline(caseRecord.clientId, existing ? "Assessment observation updated" : "Assessment observation recorded", `${input.actor.fullName} recorded ${next.title} on case revision ${revisionNumber}.`, "Assessment", input.actor);
  return next;
}

export function upsertRecommendation(input: Record<string, unknown> & { actor: AppUser }) {
  const { state, caseRecord, caseId, serviceType, revisionNumber } = assessmentContext(input.caseId);
  const idempotencyKey = boundedRequiredString(input.idempotencyKey, "Idempotency key", 120);
  const retry = state.recommendations.find((item) => item.caseId === caseId && item.idempotencyKey === idempotencyKey); if (retry) return retry;
  assertExpectedRecordVersion(caseRecord, input.expectedRecordVersion);
  const recordId = input.recordId === undefined ? undefined : boundedRequiredString(input.recordId, "Recommendation ID");
  const existing = recordId ? state.recommendations.find((item) => item.id === recordId && item.caseId === caseId) : undefined; if (recordId && !existing) throw new Error("Recommendation not found on this case revision.");
  const observationIds = boundedRefs(input.observationIds, "Observation links");
  if (observationIds.some((id) => !state.assessmentObservations.some((item) => item.id === id && item.caseId === caseId))) throw new Error("Every observation link must belong to this case revision.");
  const evidenceRefs = boundedRefs(input.evidenceRefs, "Evidence references");
  if (existing && deterministicContentHash(existing.evidenceRefs) !== deterministicContentHash(evidenceRefs)) throw new WorkflowConflictError("Evidence references are immutable. Create a new recommendation for different evidence.");
  const stamp = audit(input.actor);
  const next = { id: existing?.id ?? nextId("recommendation"), caseId, caseRevisionNumber: revisionNumber, serviceType, version: (existing?.version ?? 0) + 1, idempotencyKey, title: boundedRequiredString(input.title, "Recommendation title", 160), rationale: boundedRequiredString(input.rationale, "Rationale", 2000), action: boundedRequiredString(input.recommendedAction, "Recommended action", 2000), decisionPriority: enumValue(input.decisionPriority, decisionPriorities, "decision priority") as DecisionPriority, attentionClass: enumValue(input.attentionClass, attentionClasses, "attention class") as AttentionClass, implementationHorizon: enumValue(input.implementationHorizon, implementationHorizons, "implementation horizon") as ImplementationHorizon, level: enumValue(input.level, recommendationLevels, "recommendation level") as RecommendationLevel, observationIds, evidenceRefs, created: existing?.created ?? stamp, updated: stamp };
  if (existing) Object.assign(existing, next); else state.recommendations.unshift(next); caseRecord.recordVersion = (caseRecord.recordVersion ?? 0) + 1;
  appendTimeline(caseRecord.clientId, existing ? "Recommendation updated" : "Recommendation recorded", `${input.actor.fullName} recorded ${next.title} at ${next.level}.`, "Assessment", input.actor); return next;
}

export function upsertImplementationTask(input: Record<string, unknown> & { actor: AppUser }) {
  const { state, caseRecord, caseId, serviceType, revisionNumber } = assessmentContext(input.caseId);
  const idempotencyKey = boundedRequiredString(input.idempotencyKey, "Idempotency key", 120); const retry = state.implementationTasks.find((item) => item.caseId === caseId && item.idempotencyKey === idempotencyKey); if (retry) return retry;
  assertExpectedRecordVersion(caseRecord, input.expectedRecordVersion);
  const recordId = input.recordId === undefined ? undefined : boundedRequiredString(input.recordId, "Implementation task ID"); const existing = recordId ? state.implementationTasks.find((item) => item.id === recordId && item.caseId === caseId) : undefined; if (recordId && !existing) throw new Error("Implementation task not found on this case revision.");
  const recommendationId = boundedRequiredString(input.recommendationId, "Recommendation ID"); if (!state.recommendations.some((item) => item.id === recommendationId && item.caseId === caseId)) throw new Error("Recommendation must belong to this case revision.");
  const evidenceRefs = boundedRefs(input.evidenceRefs, "Evidence references"); if (existing && deterministicContentHash(existing.evidenceRefs) !== deterministicContentHash(evidenceRefs)) throw new WorkflowConflictError("Evidence references are immutable. Create a new task for different evidence."); const stamp = audit(input.actor);
  const next = { id: existing?.id ?? nextId("implementation"), caseId, caseRevisionNumber: revisionNumber, serviceType, version: (existing?.version ?? 0) + 1, idempotencyKey, recommendationId, title: boundedRequiredString(input.title, "Task title", 160), notes: input.notes === undefined || input.notes === "" ? undefined : boundedRequiredString(input.notes, "Task notes", 2000), status: enumValue(input.status, implementationStatuses, "implementation status") as ImplementationStatus, implementationHorizon: enumValue(input.implementationHorizon, implementationHorizons, "implementation horizon") as ImplementationHorizon, ownerRole: enumValue(input.ownerRole, responsibilityRoles, "responsibility owner role") as ResponsibilityRole, ownerName: boundedRequiredString(input.ownerName, "Responsibility owner name", 120), evidenceRefs, created: existing?.created ?? stamp, updated: stamp };
  if (existing) Object.assign(existing, next); else state.implementationTasks.unshift(next); caseRecord.recordVersion = (caseRecord.recordVersion ?? 0) + 1; appendTimeline(caseRecord.clientId, existing ? "Implementation task updated" : "Implementation task recorded", `${input.actor.fullName} recorded ${next.title} as ${next.status}.`, "Assessment", input.actor); return next;
}

export async function upsertCaseDocument(input: Record<string, unknown> & { actor: AppUser }) {
  const { state, caseRecord, caseId, serviceType, revisionNumber } = assessmentContext(input.caseId);
  const idempotencyKey = boundedRequiredString(input.idempotencyKey, "Idempotency key", 120);
  const retry = state.caseDocuments.find((item) => item.caseId === caseId && item.idempotencyKey === idempotencyKey);
  if (retry) return retry;
  assertExpectedRecordVersion(caseRecord, input.expectedRecordVersion);
  const recordId = input.recordId === undefined ? undefined : boundedRequiredString(input.recordId, "Document ID");
  const existing = recordId ? state.caseDocuments.find((item) => item.id === recordId && item.caseId === caseId && item.caseRevisionNumber === revisionNumber && item.serviceType === serviceType) : undefined;
  if (recordId && !existing) throw new Error("Document version not found on this case revision.");
  const assetType = enumValue(input.assetType, caseDocumentTypes, "case document type") as CaseDocumentType;
  if (!serviceDocumentRequirements[serviceType].includes(assetType)) throw new Error("This document type does not belong to the active case service.");
  const floorLabel = input.floorLabel === undefined || input.floorLabel === "" ? undefined : boundedRequiredString(input.floorLabel, "Floor label", 120);
  if (floorLabel && !state.floorWorkspaces.some((item) => item.caseId === caseId && item.floorLabel === floorLabel)) throw new Error("Floor label must identify a floor on this case revision.");
  const versionLabel = boundedRequiredString(input.versionLabel, "Version label", 120);
  if (state.caseDocuments.some((item) => item.caseId === caseId && item.id !== existing?.id && item.assetType === assetType && (item.floorLabel ?? "") === (floorLabel ?? "") && item.versionLabel.toLowerCase() === versionLabel.toLowerCase())) throw new WorkflowConflictError("That document version already exists for this requirement and floor.");
  const evidenceRef = boundedRequiredString(input.evidenceRef, "Evidence reference", 500);
  if (/^(?:data:|blob:)/i.test(evidenceRef) || /^[a-z][a-z0-9+.-]*:/i.test(evidenceRef) || evidenceRef.includes("..") || evidenceRef.includes("\\") || evidenceRef.startsWith("/")) throw new Error("Evidence reference must be an opaque protected-file reference, not embedded file data or a public path.");
  if (existing && existing.evidenceRef !== evidenceRef) throw new WorkflowConflictError("Evidence reference is immutable. Add a new document version for a different file.");
  if (typeof input.isCurrent !== "boolean" || typeof input.blocker !== "boolean") throw new Error("Current and blocker must be true or false.");
  if (!input.isCurrent && (!existing || existing.isCurrent)) throw new WorkflowConflictError("Every document requirement must retain one current version. Make a replacement current to supersede this version.");
  const revisionStatus = enumValue(input.revisionStatus, documentRevisionStatuses, "document revision status") as DocumentRevisionStatus;
  if (revisionStatus === "VERIFIED" && !evidenceRef) throw new Error("A document cannot be verified without evidence.");
  if (revisionStatus === "SUPERSEDED" && input.isCurrent) throw new Error("A superseded document cannot be current.");
  const discrepancy = input.discrepancy === undefined || input.discrepancy === "" ? undefined : boundedRequiredString(input.discrepancy, "Discrepancy", 1000);
  if (revisionStatus === "VERIFIED" && (input.blocker || discrepancy)) throw new WorkflowConflictError("Resolve blockers and discrepancies before verification.");
  await assertCaseFileEvidenceScope(evidenceRef, { caseId, caseRevisionNumber: revisionNumber, serviceType, floorLabel });
  const stamp = audit(input.actor);
  const next = { id: existing?.id ?? nextId("document"), caseId, caseRevisionNumber: revisionNumber, serviceType, assetType, floorLabel, versionLabel, documentDate: optionalDate(input.documentDate, "Document date"), isCurrent: input.isCurrent as boolean, evidenceRef, discrepancy, blocker: input.blocker as boolean, reviewObservation: input.reviewObservation === undefined || input.reviewObservation === "" ? undefined : boundedRequiredString(input.reviewObservation, "Review observation", 2000), requiredChange: input.requiredChange === undefined || input.requiredChange === "" ? undefined : boundedRequiredString(input.requiredChange, "Required change", 2000), preferredAlternative: input.preferredAlternative === undefined || input.preferredAlternative === "" ? undefined : boundedRequiredString(input.preferredAlternative, "Preferred alternative", 1000), acceptableAlternative: input.acceptableAlternative === undefined || input.acceptableAlternative === "" ? undefined : boundedRequiredString(input.acceptableAlternative, "Acceptable alternative", 1000), ownerRole: enumValue(input.ownerRole, responsibilityRoles, "responsibility owner role") as ResponsibilityRole, ownerName: boundedRequiredString(input.ownerName, "Responsibility owner name", 120), revisionStatus, idempotencyKey, version: (existing?.version ?? 0) + 1, received: existing?.received ?? stamp, verified: revisionStatus === "VERIFIED" ? (existing?.verified ?? stamp) : undefined, updated: stamp };
  if (next.isCurrent) for (const item of state.caseDocuments) if (item.caseId === caseId && item.caseRevisionNumber === revisionNumber && item.serviceType === serviceType && item.id !== next.id && item.assetType === assetType && (item.floorLabel ?? "") === (floorLabel ?? "") && item.isCurrent) { item.isCurrent = false; item.revisionStatus = "SUPERSEDED"; item.version += 1; item.updated = stamp; }
  if (existing) Object.assign(existing, next); else state.caseDocuments.unshift(next);
  caseRecord.recordVersion = (caseRecord.recordVersion ?? 0) + 1;
  appendTimeline(caseRecord.clientId, existing ? "Case document review updated" : "Case document received", `${input.actor.fullName} recorded ${assetType} ${versionLabel} as ${revisionStatus}.`, "Documents", input.actor);
  return next;
}

const milestoneKindsByService: Record<VastuServiceType, readonly DeliveryMilestoneKind[]> = {
  NEW_CONSTRUCTION: ["REVIEW_ROUND", "FINAL_COMPLIANCE_CHECK", "CONSTRUCTION_CHECKPOINT"],
  EXISTING_SPACE: ["CLARIFICATION", "FOLLOW_UP", "OPTIONAL_VERIFICATION"]
};
const preDeliveryMilestoneKinds = new Set<DeliveryMilestoneKind>(["REVIEW_ROUND", "FINAL_COMPLIANCE_CHECK"]);
const drawingReviewKinds = new Set<DeliveryMilestoneKind>(["REVIEW_ROUND", "FINAL_COMPLIANCE_CHECK", "CONSTRUCTION_CHECKPOINT"]);

function optionalMilestoneDate(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.length > 40 || Number.isNaN(Date.parse(value))) throw new Error(`${label} must be a valid date.`);
  return new Date(value).toISOString();
}

export async function upsertDeliveryMilestone(input: Record<string, unknown> & { actor: AppUser }) {
  const { state, caseRecord, caseId, serviceType, revisionNumber } = assessmentContext(input.caseId, true);
  const idempotencyKey = boundedRequiredString(input.idempotencyKey, "Idempotency key", 120);
  const retry = state.deliveryMilestones.find((item) => item.caseId === caseId && item.caseRevisionNumber === revisionNumber && item.serviceType === serviceType && item.idempotencyKey === idempotencyKey);
  if (retry) return retry;
  assertExpectedRecordVersion(caseRecord, input.expectedRecordVersion);
  const recordId = input.recordId === undefined ? undefined : boundedRequiredString(input.recordId, "Delivery milestone ID");
  const existing = recordId ? state.deliveryMilestones.find((item) => item.id === recordId && item.caseId === caseId && item.caseRevisionNumber === revisionNumber && item.serviceType === serviceType) : undefined;
  if (recordId && !existing) throw new Error("Delivery milestone not found on this case revision.");
  const kind = enumValue(input.kind, deliveryMilestoneKinds, "delivery milestone kind") as DeliveryMilestoneKind;
  if (!milestoneKindsByService[serviceType].includes(kind)) throw new Error("This milestone kind does not belong to the active case service.");
  if (preDeliveryMilestoneKinds.has(kind) && state.reportVersions.some((item) => item.caseId === caseId && item.artifact)) throw new WorkflowConflictError("Pre-delivery reviews are frozen by the immutable report. Use an allowed post-delivery checkpoint or formal rectification.");
  if (!Number.isInteger(input.sequence) || Number(input.sequence) < 1 || Number(input.sequence) > 1000) throw new Error("Sequence must be a whole number from 1 to 1000.");
  const sequence = Number(input.sequence);
  if (state.deliveryMilestones.some((item) => item.caseId === caseId && item.caseRevisionNumber === revisionNumber && item.serviceType === serviceType && item.id !== existing?.id && item.kind === kind && item.sequence === sequence)) throw new WorkflowConflictError("That sequence already exists for this milestone kind.");
  const status = enumValue(input.status, deliveryMilestoneStatuses, "delivery milestone status") as DeliveryMilestoneStatus;
  const reason = input.reason === undefined || input.reason === "" ? undefined : boundedRequiredString(input.reason, "Milestone reason", 1000);
  if ((status === "BLOCKED" || status === "DEFERRED") && !reason) throw new Error(`${status === "BLOCKED" ? "Blocked" : "Deferred"} milestones require a reason.`);
  if (status === "COMPLETED" && state.deliveryMilestones.some((item) => item.caseId === caseId && item.caseRevisionNumber === revisionNumber && item.serviceType === serviceType && item.kind === kind && item.id !== existing?.id && item.sequence < sequence && item.status !== "COMPLETED" && item.status !== "DEFERRED")) throw new WorkflowConflictError("Complete or defer earlier milestones of this kind before completing this sequence.");
  const evidenceRefs = boundedRefs(input.evidenceRefs, "Evidence references");
  if (existing && existing.evidenceRefs.some((reference) => !evidenceRefs.includes(reference))) throw new WorkflowConflictError("Milestone evidence is immutable and append-only; existing references cannot be removed or replaced.");
  if (status === "COMPLETED" && evidenceRefs.length === 0) throw new Error("Completed milestones require protected evidence.");
  await assertCaseFileEvidenceRefs(evidenceRefs, { caseId, caseRevisionNumber: revisionNumber, serviceType });
  let drawingRef: { caseDocumentId: string; version: number } | undefined;
  if (input.drawingRef !== undefined && input.drawingRef !== null) {
    if (typeof input.drawingRef !== "object" || Array.isArray(input.drawingRef)) throw new Error("Drawing reference must identify a case document and version.");
    const value = input.drawingRef as Record<string, unknown>;
    if (Object.keys(value).some((key) => !["caseDocumentId", "version"].includes(key))) throw new Error("Unknown drawing reference field.");
    const caseDocumentId = boundedRequiredString(value.caseDocumentId, "Drawing document ID");
    if (!Number.isInteger(value.version) || Number(value.version) < 1) throw new Error("Drawing document version must be a positive whole number.");
    const document = state.caseDocuments.find((item) => item.id === caseDocumentId && item.caseId === caseId && item.caseRevisionNumber === revisionNumber && item.serviceType === serviceType);
    if (!document || document.version !== value.version || document.assetType !== "ARCHITECTURAL_DRAWING" || !document.isCurrent || document.revisionStatus !== "VERIFIED" || !document.verified || document.blocker || document.discrepancy) throw new WorkflowConflictError("Drawing reference must be the current verified architectural drawing without blockers or discrepancies.");
    drawingRef = { caseDocumentId, version: Number(value.version) };
  }
  if (serviceType === "NEW_CONSTRUCTION" && drawingReviewKinds.has(kind) && !drawingRef) throw new Error("New-construction reviews and checkpoints require the current verified drawing reference.");
  const stamp = audit(input.actor);
  const next = { id: existing?.id ?? nextId("delivery"), caseId, caseRevisionNumber: revisionNumber, serviceType, kind, sequence, roundLabel: boundedRequiredString(input.roundLabel, "Round label", 120), title: boundedRequiredString(input.title, "Milestone title", 180), status, dueDate: optionalMilestoneDate(input.dueDate, "Due date"), completedAt: status === "COMPLETED" ? (existing?.completedAt ?? stamp.at) : undefined, ownerRole: enumValue(input.ownerRole, responsibilityRoles, "responsibility owner role") as ResponsibilityRole, ownerName: boundedRequiredString(input.ownerName, "Responsibility owner name", 120), drawingRef, observationSummary: input.observationSummary === undefined || input.observationSummary === "" ? undefined : boundedRequiredString(input.observationSummary, "Observation summary", 2000), actionSummary: input.actionSummary === undefined || input.actionSummary === "" ? undefined : boundedRequiredString(input.actionSummary, "Action summary", 2000), reason, blocker: status === "BLOCKED", evidenceRefs, idempotencyKey, version: (existing?.version ?? 0) + 1, created: existing?.created ?? stamp, updated: stamp };
  if (existing) Object.assign(existing, next); else state.deliveryMilestones.unshift(next);
  caseRecord.recordVersion = (caseRecord.recordVersion ?? 0) + 1;
  appendTimeline(caseRecord.clientId, existing ? "Delivery milestone updated" : "Delivery milestone planned", `${input.actor.fullName} recorded ${next.title} as ${status}; next owner ${next.ownerName}.`, "Delivery", input.actor);
  return next;
}

export function getClientSafeDeliveryMilestones(state: ReturnType<typeof getAppState>, caseId: string) {
  const caseRecord = state.vastuCases.find((item) => item.id === caseId);
  if (!caseRecord) return [];
  const revisionNumber = caseRecord.revisionNumber ?? 1;
  const serviceType = normalizeCaseService(caseRecord).serviceType;
  return state.deliveryMilestones.filter((item) => item.caseId === caseId && item.caseRevisionNumber === revisionNumber && item.serviceType === serviceType && !preDeliveryMilestoneKinds.has(item.kind)).map((item) => ({
    title: item.title,
    status: item.status,
    dueDate: item.dueDate,
    nextStep: item.status === "COMPLETED" ? "This checkpoint is complete." : item.status === "BLOCKED" ? "Our team will contact you when the next step is ready." : item.status === "DEFERRED" ? "This checkpoint is paused until it is needed." : "Our team is working on this checkpoint."
  })).sort((left, right) => (left.dueDate ?? "").localeCompare(right.dueDate ?? "") || left.title.localeCompare(right.title));
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
  expectedRecordVersion: unknown;
}) {
  const state = getAppState();
  const caseId = boundedRequiredString(input.caseId, "Case ID");
  const caseRecord = state.vastuCases.find((item) => item.id === caseId);
  if (!caseRecord) throw new Error("Case not found.");
  if (state.evaluationSnapshots.some((item) => item.caseId === caseId) || state.shaktiSnapshots.some((item) => item.caseId === caseId) || state.reportVersions.some((item) => item.caseId === caseId && item.artifact)) {
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
  assertExpectedRecordVersion(caseRecord, input.expectedRecordVersion);
  Object.assign(caseRecord, nextConfiguration, { recordVersion: (caseRecord.recordVersion ?? 0) + 1 });
  appendTimeline(caseRecord.clientId, "Service setup updated", `${input.actor.fullName} set ${serviceType} at ${canonicalStage}; template=${serviceTemplateVersion}; scope=${scopeVersion}.`, "Case", input.actor);
  return caseRecord;
}

export function requestCaseRectification(input: { caseId: unknown; reason: unknown; idempotencyKey: unknown; expectedRecordVersion: unknown; actor: AppUser }) {
  const state = getAppState();
  const caseId = boundedRequiredString(input.caseId, "Case ID");
  const caseRecord = state.vastuCases.find((item) => item.id === caseId);
  if (!caseRecord) throw new Error("Case not found.");
  const hasFormalEvidence = state.evaluationSnapshots.some((item) => item.caseId === caseId) || state.shaktiSnapshots.some((item) => item.caseId === caseId) || state.reportVersions.some((item) => item.caseId === caseId);
  if (!hasFormalEvidence) throw new WorkflowConflictError("Rectification requires existing evaluation or report evidence. Continue the current case workflow instead.");
  const reason = boundedRequiredString(input.reason, "Rectification reason", 500);
  if (reason.length < 20) throw new Error("Rectification reason must be at least 20 characters.");
  const idempotencyKey = boundedRequiredString(input.idempotencyKey, "Idempotency key", 120);
  const existing = state.rectificationRequests.find((item) => item.predecessorCaseId === caseId && item.idempotencyKey === idempotencyKey);
  if (existing) return existing;
  assertExpectedRecordVersion(caseRecord, input.expectedRecordVersion);
  const pending = state.rectificationRequests.find((item) => item.predecessorCaseId === caseId && item.status === "PENDING");
  if (pending) throw new WorkflowConflictError("A rectification request is already pending for this case.");
  const request = {
    id: nextId("rectification"), predecessorCaseId: caseId, clientId: caseRecord.clientId, reason, idempotencyKey,
    requestedBy: { id: input.actor.id, name: input.actor.fullName, role: input.actor.role }, requestedAt: nowIso(), status: "PENDING" as const
  };
  state.rectificationRequests.unshift(request);
  appendTimeline(caseRecord.clientId, "Rectification requested", `${input.actor.fullName} created request ${request.id} for predecessor ${caseRecord.id}: ${reason}`, "Case", input.actor);
  return request;
}

export async function approveCaseRectification(input: { requestId: unknown; expectedRecordVersion: unknown; actor: AppUser }) {
  const state = getAppState();
  const requestId = boundedRequiredString(input.requestId, "Rectification request ID");
  const request = state.rectificationRequests.find((item) => item.id === requestId);
  if (!request) throw new Error("Rectification request not found.");
  if (request.status === "APPROVED" && request.successorCaseId) return { request, successor: state.vastuCases.find((item) => item.id === request.successorCaseId) };
  if (request.requestedBy.id === input.actor.id) throw new WorkflowConflictError("The requester cannot approve their own rectification request.");
  const predecessor = state.vastuCases.find((item) => item.id === request.predecessorCaseId);
  if (!predecessor) throw new Error("Predecessor case not found.");
  assertExpectedRecordVersion(predecessor, input.expectedRecordVersion);

  const protectedReports = state.reportVersions.filter((item) => item.caseId === predecessor.id && item.artifact);
  const matchesBefore = await Promise.all(protectedReports.map((report) => artifactStillMatches(state, report)));
  if (matchesBefore.some((matches) => !matches)) throw new WorkflowConflictError("Historical report integrity failed before rectification. Stop and investigate the case evidence.");

  const revisionNumber = (predecessor.revisionNumber ?? 1) + 1;
  const successor = {
    ...predecessor,
    id: nextId("case"),
    caseNumber: `${predecessor.caseNumber}-R${revisionNumber}`,
    parentCaseId: predecessor.id,
    revisionNumber,
    recordVersion: 0,
    status: "RECTIFICATION" as const,
    reportStatus: "DRAFT" as const,
    orientationLocked: false,
    balanceApproved: false,
    fullPaymentApproved: false,
    canonicalStage: "UNDERSTAND" as const,
    inputReadiness: undefined,
    currentDrawing: undefined
  };
  state.vastuCases.unshift(successor);
  const matchesAfter = await Promise.all(protectedReports.map((report) => artifactStillMatches(state, report)));
  if (matchesAfter.some((matches) => !matches)) {
    state.vastuCases = state.vastuCases.filter((item) => item.id !== successor.id);
    throw new WorkflowConflictError("Rectification would alter historical report integrity, so no successor was created.");
  }
  request.status = "APPROVED";
  request.approvedBy = { id: input.actor.id, name: input.actor.fullName, role: input.actor.role };
  request.approvedAt = nowIso();
  request.successorCaseId = successor.id;
  appendTimeline(predecessor.clientId, "Rectification approved", `${input.actor.fullName} approved request ${request.id}; predecessor ${predecessor.id} remains unchanged and successor ${successor.id} (${successor.caseNumber}) is now active.`, "Case", input.actor);
  return { request, successor, artifactStillMatchesBefore: matchesBefore.every(Boolean), artifactStillMatchesAfter: matchesAfter.every(Boolean) };
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
    qualificationCallDueAt: new Date(Date.now() + state.commercialPolicy.qualificationCallTargetMinutes * 60 * 1000).toISOString(),
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
    `Qualification call scheduled for ${input.scheduledAt}. The configured target is ${state.commercialPolicy.qualificationCallTargetMinutes} minutes.`,
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
    qualificationCallDueAt: new Date(Date.now() + state.commercialPolicy.qualificationCallTargetMinutes * 60 * 1000).toISOString(),
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

export function createCommercialProposal(clientId: string, amountInr?: number) {
  const state = getAppState();
  const explicitAmount = amountInr ?? state.commercialPolicy.defaultProposalAmountInr;
  if (!Number.isSafeInteger(explicitAmount) || explicitAmount <= 0) throw new Error("Proposal amount must be a positive whole INR amount.");
  const proposal: CommercialProposalRecord = {
    id: nextId("proposal"),
    clientId,
    amountInr: explicitAmount,
    minAdvanceInr: state.commercialPolicy.minimumAdvanceInr,
    status: "PENDING_APPROVAL"
  };

  state.commercialProposals.unshift(proposal);
  appendTimeline(clientId, "Commercial proposal drafted", `Proposal prepared at ${formatMoney(explicitAmount)} under commercial policy v${state.commercialPolicy.version}.`, "Commercial", "ADMIN");
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
    durationMinutes: input.durationMinutes ?? state.commercialPolicy.defaultReviewCallMinutes,
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
  if (proposal.clientId !== clientId) throw new Error("The proposal does not belong to this client.");
  if (!Number.isSafeInteger(proposal.minAdvanceInr) || proposal.minAdvanceInr < 1 || proposal.minAdvanceInr > proposal.amountInr) {
    throw new WorkflowConflictError("The approved proposal has an invalid minimum advance and must be corrected before payment verification.");
  }
  if (!Number.isSafeInteger(amountInr) || amountInr < proposal.minAdvanceInr || amountInr > proposal.amountInr) {
    throw new Error(`Advance amount must be between ${formatMoney(proposal.minAdvanceInr)} and the approved proposal amount.`);
  }
  if (state.payments.some((payment) => payment.clientId === clientId && payment.proposalId === proposalId && payment.type === "ADVANCE" && payment.status === "APPROVED")) {
    throw new WorkflowConflictError("An approved advance already exists for this proposal.");
  }

  const payment: PaymentRecord = {
    id: nextId("payment"),
    clientId,
    proposalId,
    type: "ADVANCE",
    amountInr,
    status: "APPROVED",
    approvedAt: new Date().toISOString()
  };

  state.payments.unshift(payment);
  appendTimeline(clientId, "Advance payment recorded", `${formatMoney(amountInr)} advance marked ${payment.status}.`, "Payments", reviewer);
  return payment;
}

export async function verifyAdvanceProofAndOpenCase(input: {
  clientId: string;
  proposalId: string;
  amountInr: number;
  proofId: string;
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
  if (proposal.clientId !== input.clientId) throw new Error("The proposal does not belong to this client.");

  const proof = await readPaymentProofForVerification(input.proofId, {
    key: "advance-proof",
    clientId: input.clientId,
    proposalId: input.proposalId
  });
  if (!proof?.id) throw new Error("Choose an uploaded advance proof for this client and proposal.");
  if (proof.uploadedById === input.actor.id) throw new WorkflowConflictError("The person who uploaded payment proof cannot verify the same proof.");
  const existingVerification = state.advanceVerifications.find((item) => item.clientId === input.clientId && item.proposalId === input.proposalId);
  if (existingVerification?.proofAssetId === proof.id) {
    const existingPayment = state.payments.find((item) => item.id === existingVerification.paymentId);
    if (!existingPayment) throw new WorkflowConflictError("The verified advance is missing its payment record and must be repaired before continuing.");
    return {
      payment: existingPayment,
      verification: existingVerification,
      caseRecord: existingVerification.caseId ? state.vastuCases.find((item) => item.id === existingVerification.caseId) : undefined
    };
  }
  if (existingVerification) throw new WorkflowConflictError("This proposal already has a different verified advance proof.");

  const payment = approveAdvancePayment(input.clientId, input.proposalId, input.amountInr, input.actor);
  payment.proofAssetId = proof.id;
  payment.referenceScreenshotUrl = proof.url;
  payment.referenceScreenshotFileName = proof.fileName;
  payment.verifiedBy = input.actor.fullName;
  payment.verifiedAt = nowIso();
  payment.verificationNote = "Scoped receipt uploaded and checked against the approved advance amount.";

  const verification: AdvanceVerificationRecord = {
    id: nextId("advver"),
    clientId: input.clientId,
    proposalId: input.proposalId,
    amountInr: input.amountInr,
    referenceScreenshotUrl: proof.url,
    referenceScreenshotFileName: proof.fileName,
    verifiedBy: input.actor.fullName,
    verifiedAt: payment.verifiedAt!,
    paymentId: payment.id,
    proofAssetId: proof.id,
    status: "VERIFIED"
  };

  state.advanceVerifications.unshift(verification);

  let caseRecord = state.vastuCases.find((item) => item.clientId === input.clientId && item.proposalId === input.proposalId);
  if (!caseRecord) {
    try {
      caseRecord = createVastuCase(input.clientId, input.proposalId, input.actor);
      verification.caseId = caseRecord.id;
      verification.status = "CASE_OPENED";
      appendTimeline(input.clientId, "Advance verified and case opened", `Scoped receipt checked. Case ${caseRecord.caseNumber} opened automatically.`, "Payments", input.actor);
    } catch (error) {
      appendTimeline(input.clientId, "Advance verified", "Advance was checked, but automatic case opening could not complete.", "Payments", input.actor);
    }
  } else {
    verification.caseId = caseRecord.id;
    verification.status = "CASE_OPENED";
    appendTimeline(input.clientId, "Advance verified", `Scoped receipt checked for case ${caseRecord.caseNumber}.`, "Payments", input.actor);
  }

  return { payment, verification, caseRecord };
}

export function createVastuCase(clientId: string, proposalId: string, actor: AppUser) {
  const state = getAppState();
  const proposal = state.commercialProposals.find((item) => item.id === proposalId);
  if (!proposal) {
    throw new Error("Proposal not found.");
  }
  if (proposal.clientId !== clientId) throw new Error("The proposal does not belong to this client.");

  const advance = state.payments.find((payment) => payment.clientId === clientId
    && payment.proposalId === proposalId
    && payment.type === "ADVANCE"
    && payment.status === "APPROVED"
    && Boolean(payment.proofAssetId));
  if (!canCreateCase(proposal, advance)) {
    throw new Error("Advance approval is required before the case can be created.");
  }

  const activeRecord = getActiveCaseForClient(state, clientId);
  const record = activeRecord?.proposalId === proposalId ? activeRecord : state.vastuCases.find((item) => item.clientId === clientId && item.proposalId === proposalId);
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
  appendTimeline(clientId, "Case created", `Case ${caseNumber} opened after scoped advance proof approval.`, "Case", actor);
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
  if (caseRecord.clientId !== clientId) throw new Error("The case does not belong to this client.");
  const activeCase = getActiveCaseForClient(state, clientId);
  if (activeCase?.id !== caseId) throw new WorkflowConflictError("Balance proof must be verified against the active case revision.");
  const proposal = state.commercialProposals.find((item) => item.id === caseRecord.proposalId && item.clientId === clientId);
  if (!proposal) throw new Error("The approved proposal for this case was not found.");
  const approvedAdvance = state.payments
    .filter((item) => item.clientId === clientId && item.proposalId === proposal.id && item.type === "ADVANCE" && item.status === "APPROVED")
    .reduce((total, item) => total + item.amountInr, 0);
  const expectedBalance = Math.max(0, proposal.amountInr - approvedAdvance);
  if (!Number.isSafeInteger(amountInr) || amountInr !== expectedBalance || expectedBalance <= 0) {
    throw new Error(`Balance amount must exactly match the remaining approved proposal balance of ${formatMoney(expectedBalance)}.`);
  }
  if (state.payments.some((item) => item.clientId === clientId && item.caseId === caseId && item.type === "BALANCE" && item.status === "APPROVED")) {
    throw new WorkflowConflictError("An approved balance already exists for this case.");
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

  appendTimeline(clientId, "Balance approved", `${formatMoney(amountInr)} balance cleared.`, "Payments", reviewer);
  return payment;
}

export async function verifyBalanceProof(input: {
  clientId: string;
  caseId: string;
  amountInr: number;
  proofId: string;
  actor: AppUser;
}) {
  const state = getAppState();
  const caseRecord = state.vastuCases.find((item) => item.id === input.caseId);
  if (!caseRecord) {
    throw new Error("Case not found.");
  }

  const proof = await readPaymentProofForVerification(input.proofId, {
    key: "balance-proof",
    clientId: input.clientId,
    caseId: input.caseId
  });
  if (!proof?.id) throw new Error("Choose an uploaded balance proof for this client and active case.");
  if (proof.uploadedById === input.actor.id) throw new WorkflowConflictError("The person who uploaded payment proof cannot verify the same proof.");
  const existingPayment = state.payments.find((item) => item.clientId === input.clientId && item.caseId === input.caseId && item.type === "BALANCE" && item.status === "APPROVED");
  if (existingPayment?.proofAssetId === proof.id) return { payment: existingPayment, caseRecord };
  if (existingPayment) throw new WorkflowConflictError("This case already has a different verified balance proof.");

  const payment = approveBalancePayment(input.clientId, input.caseId, input.amountInr, input.actor);
  payment.proofAssetId = proof.id;
  payment.referenceScreenshotUrl = proof.url;
  payment.referenceScreenshotFileName = proof.fileName;
  payment.verifiedBy = input.actor.fullName;
  payment.verifiedAt = nowIso();
  payment.verificationNote = "Scoped balance receipt uploaded and checked before unlocking the final report flow.";

  appendTimeline(
    input.clientId,
    "Balance proof verified",
    `${formatMoney(input.amountInr)} balance verified from ${proof.fileName}. Final report flow is now unlocked.`,
    "Payments",
    input.actor
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

  appendTimeline(caseRecord.clientId, "Stage-A preview generated", "Watermarked preview ready for the team.", "Reports", actor);
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
  const balancePayment = state.payments.find((item) => item.caseId === caseId && item.type === "BALANCE" && item.status === "APPROVED");
  if (!balancePayment?.proofAssetId) throw new WorkflowConflictError("Final report preparation requires exact scoped balance proof verified by a different person.");

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
  appendTimeline(caseRecord.clientId, "Final report prepared", `Official verdict report prepared by ${actor.fullName}.`, "Reports", actor);
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
  const balancePayment = state.payments.find((item) => item.caseId === caseRecord.id && item.type === "BALANCE" && item.status === "APPROVED");
  if (!balancePayment?.proofAssetId) throw new WorkflowConflictError("Report approval requires exact scoped balance proof.");
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

  appendTimeline(caseRecord.clientId, "Report approved", `${actor.fullName} signed off the report version.`, "Reports", actor);
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
  const balancePayment = state.payments.find((item) => item.caseId === caseRecord.id && item.type === "BALANCE" && item.status === "APPROVED");
  if (!balancePayment?.proofAssetId) throw new WorkflowConflictError("Verdict release requires exact scoped balance proof.");
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
  appendTimeline(caseRecord.clientId, "Verdict released", `Released by ${actor.fullName} after approvals.`, "Reports", actor);
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
    caseRecord: getActiveCaseForClient(state, clientId),
    floors: state.floorWorkspaces.filter((item) => item.caseId === getActiveCaseForClient(state, clientId)?.id),
    reports: state.reportVersions.filter((item) => item.caseId === getActiveCaseForClient(state, clientId)?.id),
    timeline: getClientTimeline(clientId),
    utilityRules: state.utilityRules
  };
}
