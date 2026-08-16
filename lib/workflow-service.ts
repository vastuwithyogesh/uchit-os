import {
  AdvanceVerificationRecord,
  AppUser,
  CommercialProposalRecord,
  ClientRecord,
  EvaluationSnapshotRecord,
  UtilityGraphVerdictRecord,
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
import { buildInboundLeadIdentity, normalizeCsvDate, normalizeLeadEmail, toInboundLeadRecord, type LeadImportPreview, type ParsedInboundLeadRow } from "@/lib/lead-import";
import { canCreateCase, generateUtilityEvaluation, lockWorkspace, rankShakti } from "@/lib/workflows";
import { getAppState, resetAppState } from "@/lib/store";
import { ensureStageBReservation } from "@/lib/stage-b-remediation";
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
import { assertCaseReadyForEvaluation, getActiveCaseForClient, getCaseEvaluationBlockers, getServiceReadinessChecklist, normalizeCaseService, serviceDocumentRequirements } from "@/lib/service-framework";
import { artifactStillMatches } from "@/lib/report-artifacts";
import { assertCaseFileEvidenceRefs, assertCaseFileEvidenceScope } from "@/lib/case-file-assets.server";
import { getAllowedPipelineTransitions, normalizeClientPipeline } from "@/lib/crm-pipeline";
import { readPaymentProofForVerification } from "@/lib/payment-proof-assets.server";
import { getMethodologyReadiness } from "@/lib/methodology-readiness";
import { getUtilityMasterMethodologyBinding, resolveUtilityMasterRows, utilityMasterRuleId, UTILITY_MASTER_SOURCE_VERSION, UTILITY_MASTER_WORKBOOK_HASH } from "@/lib/utility-master";
import { calculateUtilityGraphVerdict, UtilityVerdictValidationError } from "@/lib/utility-verdict";
import { getStageAFloorReviewBlockers, recordStageAFloorCheckpoint } from "@/lib/founder-regeneration";
import { validateClientIntake } from "@/lib/client-intake";
import { saveCasePropertyContext } from "@/lib/case-property-context";
import { resolveEvaluationArchitecture } from "@/lib/evaluation-architecture";

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
    throw new Error(`${label} is required and must be a non-blank string of ${maxLength} characters or fewer.`);
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

function assessmentContext(caseIdValue: unknown, floorIdValue?: unknown, allowArtifact = false) {
  const state = getAppState();
  const caseId = boundedRequiredString(caseIdValue, "Case ID");
  const caseRecord = state.vastuCases.find((item) => item.id === caseId);
  if (!caseRecord) throw new Error("Case not found.");
  if (getActiveCaseForClient(state, caseRecord.clientId)?.id !== caseId) throw new WorkflowConflictError("This is not the active case revision. Open the latest revision before recording assessment work.");
  const floorId = floorIdValue === undefined ? undefined : boundedRequiredString(floorIdValue, "Floor ID", 160);
  const floor = floorId ? state.floorWorkspaces.find((item) => item.id === floorId && item.caseId === caseId && item.projectId === caseRecord.projectId) : undefined;
  if (floorId && !floor) throw new WorkflowConflictError("Assessment floor does not belong to the active project and case.");
  if (!allowArtifact && state.reportVersions.some((item) => item.caseId === caseId && item.artifact && (!floorId || !item.floorId || item.floorId === floorId))) throw new WorkflowConflictError("Assessment work is locked by an immutable report for this floor. Start formal rectification to continue.");
  return { state, caseRecord, caseId, floor, floorId, serviceType: normalizeCaseService(caseRecord).serviceType, revisionNumber: caseRecord.revisionNumber ?? 1 };
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
  if (afterStage === "PAID_REVIEW_PENDING" && (beforeStage === "CONTACTED" || beforeStage === "PRE_CASE_FOLLOW_UP")) {
    const scopedProject = state.prospectiveProjects.find((item) => item.clientId === clientId && !item.caseId && item.status !== "CONVERTED" && item.serviceType && item.propertyType && item.displayName?.trim() && item.propertyLocation?.trim());
    if (!scopedProject) throw new WorkflowConflictError("Project scope is required before moving this lead into Review. Save the structured project scope first.");
  }
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
  const caseId = input.caseId === undefined ? undefined : boundedRequiredString(input.caseId, "Case ID");
  const projectId = input.projectId === undefined ? undefined : boundedRequiredString(input.projectId, "Project ID");
  if (caseId || projectId) {
    const caseRecord = state.vastuCases.find((item) => item.id === caseId && item.clientId === clientId);
    if (!caseRecord || (projectId && caseRecord.projectId !== projectId)) throw new WorkflowConflictError("Intake context does not match the selected case, project and client.");
  }
  if (input.actor.role === "SETTER" && client.assignedSetterId && client.assignedSetterId !== input.actor.id) throw new WorkflowConflictError("Setters may update intake only for clients assigned to them.");
  const idempotencyKey = boundedRequiredString(input.idempotencyKey, "Idempotency key", 120);
  const existing = state.clientIntakeProfiles.find((item) => item.clientId === clientId);
  if (existing?.idempotencyKey === idempotencyKey) return existing;
  assertExpectedRecordVersion(client, input.expectedRecordVersion);
  const exactCase = caseId ? state.vastuCases.find((item) => item.id === caseId && item.clientId === clientId) : getActiveCaseForClient(state, clientId);
  if (exactCase && state.reportVersions.some((item) => item.caseId === exactCase.id && item.artifact)) throw new WorkflowConflictError("Client intake is locked by an immutable report. Use formal case rectification before changing intake evidence.");

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

  const propertyInput = intakeObject(input.propertyContext, "Property context", ["serviceInterest", "propertyType", "propertyStatus", "areaValue", "areaUnit", "cityCountry", "constraints", "floorCount", "locationLink", "latitude", "longitude"]);
  let areaValue: number | undefined;
  if (propertyInput?.areaValue !== undefined && propertyInput.areaValue !== null && propertyInput.areaValue !== "") {
    if (typeof propertyInput.areaValue !== "number" || !Number.isFinite(propertyInput.areaValue) || propertyInput.areaValue <= 0 || propertyInput.areaValue > 1_000_000_000) throw new Error("Area must be a finite number greater than zero and no more than 1,000,000,000.");
    areaValue = propertyInput.areaValue;
  }
  const areaUnit = propertyInput ? optionalIntakeString(propertyInput.areaUnit, "Area unit", 40) : undefined;
  if ((areaValue === undefined) !== (areaUnit === undefined)) throw new Error("Area value and area unit must be provided together.");
  const serviceInterest = propertyInput?.serviceInterest === undefined || propertyInput.serviceInterest === "" ? undefined : enumValue(propertyInput.serviceInterest, serviceTypes, "service interest") as VastuServiceType;
  const allowedPropertyTypes = ["Residential", "Commercial", "Factory", "Shop", "Hospital", "Hotel", "Temple"] as const;
  const requestedPropertyType = propertyInput ? optionalIntakeString(propertyInput.propertyType, "Property type", 120) : undefined;
  if (requestedPropertyType && !allowedPropertyTypes.includes(requestedPropertyType as typeof allowedPropertyTypes[number])) throw new Error("Property type must be one of the approved Founder options.");
  const floorCount = propertyInput?.floorCount === undefined || propertyInput.floorCount === null || propertyInput.floorCount === "" ? undefined : Number(propertyInput.floorCount);
  if (floorCount !== undefined && (!Number.isInteger(floorCount) || floorCount < 1 || floorCount > 200)) throw new Error("Number of floors must be a whole number between 1 and 200.");
  const locationLink = propertyInput?.locationLink === undefined ? undefined : String(propertyInput.locationLink).trim();
  if (locationLink && !/^https:\/\//i.test(locationLink)) throw new Error("Location link must use HTTPS.");
  const latitude = propertyInput?.latitude === undefined || propertyInput.latitude === "" ? undefined : Number(propertyInput.latitude);
  const longitude = propertyInput?.longitude === undefined || propertyInput.longitude === "" ? undefined : Number(propertyInput.longitude);
  if ((latitude === undefined) !== (longitude === undefined) || (latitude !== undefined && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude! < -180 || longitude! > 180))) throw new Error("Coordinates must include valid latitude and longitude together.");
  const previousLocation = existing?.propertyContext?.locationLink ?? `${existing?.propertyContext?.latitude ?? ""},${existing?.propertyContext?.longitude ?? ""}`;
  const nextLocation = locationLink ?? `${latitude ?? ""},${longitude ?? ""}`;
  const propertyContext = propertyInput ? { serviceInterest, propertyType: requestedPropertyType, propertyStatus: optionalIntakeString(propertyInput.propertyStatus, "Property status", 120), areaValue, areaUnit, cityCountry: optionalIntakeString(propertyInput.cityCountry, "City and country", 160), constraints: optionalIntakeString(propertyInput.constraints, "Property constraints", 1000), floorCount, locationLink, latitude, longitude, locationVersion: previousLocation !== nextLocation ? (existing?.propertyContext?.locationVersion ?? 0) + 1 : existing?.propertyContext?.locationVersion } : undefined;

  const needsInput = intakeObject(input.needs, "Needs", ["mainChallenge", "desiredOutcome", "urgency"]);
  const needs = needsInput ? { mainChallenge: optionalIntakeString(needsInput.mainChallenge, "Main challenge", 1000), desiredOutcome: optionalIntakeString(needsInput.desiredOutcome, "Desired outcome", 1000), urgency: optionalIntakeString(needsInput.urgency, "Urgency", 120) } : undefined;
  const requiredErrors = validateClientIntake({ challenge: needs?.mainChallenge, outcome: needs?.desiredOutcome, service: propertyContext?.serviceInterest, propertyType: propertyContext?.propertyType, propertyStatus: propertyContext?.propertyStatus, cityCountry: propertyContext?.cityCountry, floorCount: propertyContext?.floorCount?.toString(), locationLink: propertyContext?.locationLink, latitude: propertyContext?.latitude?.toString(), longitude: propertyContext?.longitude?.toString() });
  const firstRequiredError = Object.values(requiredErrors)[0];
  if (firstRequiredError) throw new Error(firstRequiredError);

  const consentInput = intakeObject(input.consent, "Consent", ["version", "contact", "accuracy", "confidentiality"]);
  if (!consentInput || consentInput.version !== "uchit-intake/v1") throw new Error("Consent version must be uchit-intake/v1.");
  for (const key of ["contact", "accuracy", "confidentiality"] as const) if (consentInput[key] !== undefined && typeof consentInput[key] !== "boolean") throw new Error(`Consent ${key} must be true or false.`);
  const consentComplete = consentInput.contact === true && consentInput.accuracy === true && consentInput.confidentiality === true;
  const stamp = audit(input.actor);
  const profile = { clientId, version: (existing?.version ?? 0) + 1, idempotencyKey, contactPreference, businessContext, decisionMakerStatus, otherDecisionMakers, propertyContext, needs, consent: { version: "uchit-intake/v1" as const, contact: consentInput.contact as boolean | undefined, accuracy: consentInput.accuracy as boolean | undefined, confidentiality: consentInput.confidentiality as boolean | undefined, confirmedAt: consentComplete ? (existing?.consent.confirmedAt ?? stamp.at) : undefined }, created: existing?.created ?? stamp, updated: stamp };
  if (existing) Object.assign(existing, profile); else state.clientIntakeProfiles.unshift(profile);
  // A replacement location changes the evidence context used for orientation and
  // downstream evaluation. Preserve history and require deliberate regeneration;
  // never silently reuse a prior direction/evaluation result.
  if (existing && caseId && projectId && previousLocation !== nextLocation) {
    for (const floor of state.floorWorkspaces.filter((item) => item.caseId === caseId)) {
      const targetId = `location:${profile.propertyContext?.locationVersion ?? 1}:${floor.id}`;
      if (!state.dependencyInvalidations.some((item) => item.targetType === "UTILITY_EVALUATION" && item.targetId === targetId)) state.dependencyInvalidations.unshift({ id: nextId("location-invalidation"), organisationId: client.organisationId, projectId, caseId, floorId: floor.id, targetType: "UTILITY_EVALUATION", targetId, causeType: "EVIDENCE", sourceVersionId: `location:${profile.propertyContext?.locationVersion ?? 1}`, status: "REPLACEMENT_REQUIRED", reason: "Project location changed; re-verify direction and regenerate affected evaluations.", createdAt: stamp.at, createdByActorUserId: input.actor.id });
    }
  }
  client.recordVersion = (client.recordVersion ?? 0) + 1;
  appendTimeline(clientId, "Client intake updated", `${input.actor.fullName} recorded client intake profile version ${profile.version}.`, "CRM", input.actor);
  return profile;
}

export function upsertAssessmentObservation(input: Record<string, unknown> & { actor: AppUser }) {
  const { state, caseRecord, caseId, floor, floorId, serviceType, revisionNumber } = assessmentContext(input.caseId, input.floorId);
  if (!floor || !floorId || !floor.locked) throw new WorkflowConflictError("Choose a locked floor before recording an assessment observation.");
  const idempotencyKey = boundedRequiredString(input.idempotencyKey, "Idempotency key", 120);
  const retry = state.assessmentObservations.find((item) => item.caseId === caseId && item.floorId === floorId && item.idempotencyKey === idempotencyKey);
  if (retry) return retry;
  assertExpectedRecordVersion(caseRecord, input.expectedRecordVersion);
  const recordId = input.recordId === undefined ? undefined : boundedRequiredString(input.recordId, "Observation ID");
  const existing = recordId ? state.assessmentObservations.find((item) => item.id === recordId && item.caseId === caseId && item.floorId === floorId) : undefined;
  if (recordId && !existing) throw new Error("Observation not found on this case revision.");
  const evidenceRefs = boundedRefs(input.evidenceRefs, "Evidence references");
  const floorEvidenceRefs = new Set([...floor.evidenceUploads, ...state.spatialEvidenceVersions.filter((item) => item.caseId === caseId && item.floorId === floorId && item.status === "CURRENT").map((item) => item.protectedFileRef)]);
  if (!evidenceRefs.length || evidenceRefs.some((ref) => !floorEvidenceRefs.has(ref))) throw new WorkflowConflictError("Every observation evidence reference must belong to the selected floor and a current evidence version.");
  if (existing && deterministicContentHash(existing.evidenceRefs) !== deterministicContentHash(evidenceRefs)) throw new WorkflowConflictError("Evidence references are immutable. Create a new observation for different evidence.");
  const stamp = audit(input.actor);
  const next = { id: existing?.id ?? nextId("observation"), caseId, floorId, caseRevisionNumber: revisionNumber, serviceType, version: (existing?.version ?? 0) + 1, idempotencyKey, title: boundedRequiredString(input.title, "Observation title", 160), observation: boundedRequiredString(input.observation, "Observation", 2000), alignmentStatus: enumValue(input.alignmentStatus, alignmentStatuses, "alignment status") as AlignmentStatus, energyStatus: enumValue(input.energyStatus, energyStatuses, "energy status") as EnergyStatus, placementStatus: enumValue(input.placementStatus, placementStatuses, "placement status") as PlacementStatus, evidenceRefs, created: existing?.created ?? stamp, updated: stamp };
  if (existing) Object.assign(existing, next); else state.assessmentObservations.unshift(next);
  caseRecord.recordVersion = (caseRecord.recordVersion ?? 0) + 1;
  appendTimeline(caseRecord.clientId, existing ? "Assessment observation updated" : "Assessment observation recorded", `${input.actor.fullName} recorded ${next.title} on case revision ${revisionNumber}.`, "Assessment", input.actor);
  return next;
}

export function upsertRecommendation(input: Record<string, unknown> & { actor: AppUser }) {
  const { state, caseRecord, caseId, floor, floorId, serviceType, revisionNumber } = assessmentContext(input.caseId, input.floorId);
  if (!floor || !floorId) throw new WorkflowConflictError("Choose a floor before recording a recommendation.");
  const idempotencyKey = boundedRequiredString(input.idempotencyKey, "Idempotency key", 120);
  const retry = state.recommendations.find((item) => item.caseId === caseId && item.floorId === floorId && item.idempotencyKey === idempotencyKey); if (retry) return retry;
  assertExpectedRecordVersion(caseRecord, input.expectedRecordVersion);
  const recordId = input.recordId === undefined ? undefined : boundedRequiredString(input.recordId, "Recommendation ID");
  const existing = recordId ? state.recommendations.find((item) => item.id === recordId && item.caseId === caseId && item.floorId === floorId) : undefined; if (recordId && !existing) throw new Error("Recommendation not found on this floor and case revision.");
  const observationIds = boundedRefs(input.observationIds, "Observation links");
  if (observationIds.some((id) => !state.assessmentObservations.some((item) => item.id === id && item.caseId === caseId && item.floorId === floorId))) throw new Error("Every observation link must belong to this floor and case revision.");
  const evidenceRefs = boundedRefs(input.evidenceRefs, "Evidence references");
  if (existing && deterministicContentHash(existing.evidenceRefs) !== deterministicContentHash(evidenceRefs)) throw new WorkflowConflictError("Evidence references are immutable. Create a new recommendation for different evidence.");
  const stamp = audit(input.actor);
  const next = { id: existing?.id ?? nextId("recommendation"), caseId, floorId, caseRevisionNumber: revisionNumber, serviceType, version: (existing?.version ?? 0) + 1, idempotencyKey, title: boundedRequiredString(input.title, "Recommendation title", 160), rationale: boundedRequiredString(input.rationale, "Rationale", 2000), action: boundedRequiredString(input.recommendedAction, "Recommended action", 2000), decisionPriority: enumValue(input.decisionPriority, decisionPriorities, "decision priority") as DecisionPriority, attentionClass: enumValue(input.attentionClass, attentionClasses, "attention class") as AttentionClass, implementationHorizon: enumValue(input.implementationHorizon, implementationHorizons, "implementation horizon") as ImplementationHorizon, level: enumValue(input.level, recommendationLevels, "recommendation level") as RecommendationLevel, observationIds, evidenceRefs, created: existing?.created ?? stamp, updated: stamp };
  if (existing) Object.assign(existing, next); else state.recommendations.unshift(next); caseRecord.recordVersion = (caseRecord.recordVersion ?? 0) + 1;
  appendTimeline(caseRecord.clientId, existing ? "Recommendation updated" : "Recommendation recorded", `${input.actor.fullName} recorded ${next.title} at ${next.level}.`, "Assessment", input.actor); return next;
}

export function upsertImplementationTask(input: Record<string, unknown> & { actor: AppUser }) {
  const { state, caseRecord, caseId, floor, floorId, serviceType, revisionNumber } = assessmentContext(input.caseId, input.floorId);
  if (!floor || !floorId) throw new WorkflowConflictError("Choose a floor before assigning an implementation task.");
  const idempotencyKey = boundedRequiredString(input.idempotencyKey, "Idempotency key", 120); const retry = state.implementationTasks.find((item) => item.caseId === caseId && item.floorId === floorId && item.idempotencyKey === idempotencyKey); if (retry) return retry;
  assertExpectedRecordVersion(caseRecord, input.expectedRecordVersion);
  const recordId = input.recordId === undefined ? undefined : boundedRequiredString(input.recordId, "Implementation task ID"); const existing = recordId ? state.implementationTasks.find((item) => item.id === recordId && item.caseId === caseId && item.floorId === floorId) : undefined; if (recordId && !existing) throw new Error("Implementation task not found on this floor and case revision.");
  const recommendationId = boundedRequiredString(input.recommendationId, "Recommendation ID"); if (!state.recommendations.some((item) => item.id === recommendationId && item.caseId === caseId && item.floorId === floorId)) throw new Error("Recommendation must belong to this floor and case revision.");
  const evidenceRefs = boundedRefs(input.evidenceRefs, "Evidence references"); if (existing && deterministicContentHash(existing.evidenceRefs) !== deterministicContentHash(evidenceRefs)) throw new WorkflowConflictError("Evidence references are immutable. Create a new task for different evidence."); const stamp = audit(input.actor);
  const next = { id: existing?.id ?? nextId("implementation"), caseId, floorId, caseRevisionNumber: revisionNumber, serviceType, version: (existing?.version ?? 0) + 1, idempotencyKey, recommendationId, title: boundedRequiredString(input.title, "Task title", 160), notes: input.notes === undefined || input.notes === "" ? undefined : boundedRequiredString(input.notes, "Task notes", 2000), status: enumValue(input.status, implementationStatuses, "implementation status") as ImplementationStatus, implementationHorizon: enumValue(input.implementationHorizon, implementationHorizons, "implementation horizon") as ImplementationHorizon, ownerRole: enumValue(input.ownerRole, responsibilityRoles, "responsibility owner role") as ResponsibilityRole, ownerName: boundedRequiredString(input.ownerName, "Responsibility owner name", 120), evidenceRefs, created: existing?.created ?? stamp, updated: stamp };
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
  const revisionStatus = enumValue(input.revisionStatus, documentRevisionStatuses, "document revision status") as DocumentRevisionStatus;
  if (revisionStatus === "VERIFIED" && !evidenceRef) throw new Error("A document cannot be verified without evidence.");
  if (revisionStatus === "SUPERSEDED" && input.isCurrent) throw new Error("A superseded document cannot be current.");
  const discrepancy = input.discrepancy === undefined || input.discrepancy === "" ? undefined : boundedRequiredString(input.discrepancy, "Discrepancy", 1000);
  if (revisionStatus === "VERIFIED" && (input.blocker || discrepancy)) throw new WorkflowConflictError("Resolve blockers and discrepancies before verification.");
  const successorOfDocumentId = input.successorOfDocumentId === undefined || input.successorOfDocumentId === "" ? undefined : boundedRequiredString(input.successorOfDocumentId, "Predecessor document ID", 160);
  const currentForRequirement = state.caseDocuments.find((item) => item.caseId === caseId && item.caseRevisionNumber === revisionNumber && item.serviceType === serviceType && item.assetType === assetType && (item.floorLabel ?? "") === (floorLabel ?? "") && item.isCurrent);
  const isManualSuccessor = assetType === "MANUAL_UTILITY_SHEET" && !input.isCurrent && Boolean(successorOfDocumentId)
    && Boolean(currentForRequirement && currentForRequirement.id === successorOfDocumentId && currentForRequirement.revisionStatus === "VERIFIED" && currentForRequirement.founderApprovalStatus === "APPROVED");
  if (!input.isCurrent && !(isManualSuccessor || (existing && !existing.isCurrent && existing.successorOfDocumentId === successorOfDocumentId))) throw new WorkflowConflictError("A non-current manual sheet must be an explicit successor of the exact approved current version.");
  if (assetType === "MANUAL_UTILITY_SHEET" && currentForRequirement?.founderApprovalStatus === "APPROVED" && currentForRequirement.id !== existing?.id && input.isCurrent) throw new WorkflowConflictError("Create a successor draft; only Founder approval may replace the approved current version.");
  const requiredChange = input.requiredChange === undefined || input.requiredChange === "" ? undefined : boundedRequiredString(input.requiredChange, "Required change", 2000);
  const issueOpen = Boolean(input.blocker) || revisionStatus === "CHANGES_REQUIRED";
  if (issueOpen && (!discrepancy || !requiredChange)) throw new WorkflowConflictError("A review issue requires both the discrepancy and required correction.");
  const issueHistory = [...(existing?.issueHistory ?? [])];
  if (revisionStatus === "VERIFIED" && issueHistory.some((item) => item.status === "OPEN")) throw new WorkflowConflictError("Resolve the recorded review issue before verification.");
  if (issueOpen) {
    const latestOpen = issueHistory.find((item) => item.status === "OPEN");
    if (!latestOpen || latestOpen.discrepancy !== discrepancy || latestOpen.requiredChange !== requiredChange || latestOpen.ownerRole !== input.ownerRole || latestOpen.ownerName !== input.ownerName) {
      issueHistory.unshift({ id: nextId("document-issue"), status: "OPEN", discrepancy: discrepancy!, requiredChange: requiredChange!, ownerRole: input.ownerRole as ResponsibilityRole, ownerName: boundedRequiredString(input.ownerName, "Responsibility owner name", 120), openedAt: audit(input.actor).at, openedByActorUserId: input.actor.id });
    }
  }
  const organisationId = caseRecord.organisationId ?? input.actor.organisationId ?? "local-demo-organisation";
  await assertCaseFileEvidenceScope(evidenceRef, { organisationId, caseId, caseRevisionNumber: revisionNumber, serviceType, floorLabel });
  const stamp = audit(input.actor);
  const next = { id: existing?.id ?? nextId("document"), caseId, caseRevisionNumber: revisionNumber, serviceType, assetType, floorLabel, versionLabel, documentDate: optionalDate(input.documentDate, "Document date"), isCurrent: input.isCurrent as boolean, successorOfDocumentId, evidenceRef, discrepancy, blocker: input.blocker as boolean, reviewObservation: input.reviewObservation === undefined || input.reviewObservation === "" ? undefined : boundedRequiredString(input.reviewObservation, "Review observation", 2000), requiredChange, preferredAlternative: input.preferredAlternative === undefined || input.preferredAlternative === "" ? undefined : boundedRequiredString(input.preferredAlternative, "Preferred alternative", 1000), acceptableAlternative: input.acceptableAlternative === undefined || input.acceptableAlternative === "" ? undefined : boundedRequiredString(input.acceptableAlternative, "Acceptable alternative", 1000), ownerRole: enumValue(input.ownerRole, responsibilityRoles, "responsibility owner role") as ResponsibilityRole, ownerName: boundedRequiredString(input.ownerName, "Responsibility owner name", 120), revisionStatus, issueHistory, ...(assetType === "MANUAL_UTILITY_SHEET" ? { founderApprovalStatus: existing?.founderApprovalStatus ?? "PENDING" as const, founderApprovedAt: existing?.founderApprovedAt, founderApprovedByActorUserId: existing?.founderApprovedByActorUserId } : {}), idempotencyKey, version: (existing?.version ?? 0) + 1, received: existing?.received ?? stamp, verified: revisionStatus === "VERIFIED" ? (existing?.verified ?? stamp) : undefined, updated: stamp };
  if (next.isCurrent) for (const item of state.caseDocuments) if (item.caseId === caseId && item.caseRevisionNumber === revisionNumber && item.serviceType === serviceType && item.id !== next.id && item.assetType === assetType && (item.floorLabel ?? "") === (floorLabel ?? "") && item.isCurrent) { item.isCurrent = false; item.revisionStatus = "SUPERSEDED"; item.version += 1; item.updated = stamp; }
  if (existing) Object.assign(existing, next); else state.caseDocuments.unshift(next);
  caseRecord.recordVersion = (caseRecord.recordVersion ?? 0) + 1;
  appendTimeline(caseRecord.clientId, existing ? "Case document review updated" : "Case document received", `${input.actor.fullName} recorded ${assetType} ${versionLabel} as ${revisionStatus}.`, "Documents", input.actor);
  return next;
}

export function resolveCaseDocumentIssue(input: Record<string, unknown> & { actor: AppUser }) {
  const { state, caseRecord, caseId, serviceType, revisionNumber } = assessmentContext(input.caseId);
  assertExpectedRecordVersion(caseRecord, input.expectedRecordVersion);
  const recordId = boundedRequiredString(input.recordId, "Document ID", 160);
  const document = state.caseDocuments.find((item) => item.id === recordId && item.caseId === caseId && item.caseRevisionNumber === revisionNumber && item.serviceType === serviceType);
  if (!document) throw new Error("Document version not found on this case revision.");
  const idempotencyKey = boundedRequiredString(input.idempotencyKey, "Idempotency key", 120);
  const replay = document.issueHistory?.find((item) => item.resolutionIdempotencyKey === idempotencyKey);
  if (replay) return { document, issue: replay };
  const issue = document.issueHistory?.find((item) => item.status === "OPEN");
  if (!issue) throw new WorkflowConflictError("This document version has no open review issue to resolve.");
  const resolutionNote = boundedRequiredString(input.resolutionNote, "Resolution note", 1000);
  const stamp = audit(input.actor);
  issue.status = "RESOLVED"; issue.resolvedAt = stamp.at; issue.resolvedByActorUserId = input.actor.id; issue.resolutionNote = resolutionNote; issue.resolutionIdempotencyKey = idempotencyKey;
  document.blocker = false; document.discrepancy = undefined; document.requiredChange = undefined; document.revisionStatus = "UNDER_REVIEW";
  document.version += 1; document.updated = stamp; caseRecord.recordVersion = (caseRecord.recordVersion ?? 0) + 1;
  appendTimeline(caseRecord.clientId, "Case document issue resolved", `${input.actor.fullName} resolved the recorded review issue for ${document.assetType} ${document.versionLabel}.`, "Documents", input.actor);
  return { document, issue };
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
  const { state, caseRecord, caseId, serviceType, revisionNumber } = assessmentContext(input.caseId, undefined, true);
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
  const organisationId = caseRecord.organisationId ?? input.actor.organisationId ?? "local-demo-organisation";
  await assertCaseFileEvidenceRefs(evidenceRefs, { organisationId, caseId, caseRevisionNumber: revisionNumber, serviceType });
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
  const successorProject = successor.projectId ? state.projects.find((item) => item.id === successor.projectId) : undefined;
  if (successorProject) {
    successorProject.activeCaseId = successor.id;
    successorProject.status = "IN_PROGRESS";
    successorProject.completedAt = undefined;
  }
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
  return `${prefix}_${crypto.randomUUID()}`;
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

function mergeLeadRecord(existing: InboundLeadRecord, incoming: ParsedInboundLeadRow, importedAt: string, actor?: AppUser, organisationId?: string) {
  existing.fullName = incoming.fullName || existing.fullName;
  existing.email = normalizeLeadEmail(incoming.email || existing.email);
  existing.phone = incoming.phone || existing.phone;
  existing.city = incoming.city || existing.city;
  existing.serviceInterest = incoming.serviceInterest ?? existing.serviceInterest;
  existing.source = incoming.source || existing.source;
  existing.statusLabel = incoming.statusLabel || existing.statusLabel;
  existing.utmSource = incoming.utmSource || existing.utmSource;
  existing.utmMedium = incoming.utmMedium || existing.utmMedium;
  existing.utmCampaign = incoming.utmCampaign || existing.utmCampaign;
  existing.utmTerm = incoming.utmTerm || existing.utmTerm;
  existing.utmContent = incoming.utmContent || existing.utmContent;
  existing.message = incoming.message || existing.message;
  existing.notes = incoming.notes || existing.notes;
  existing.firstSeenAt = existing.firstSeenAt || incoming.csvCreatedDate || importedAt.slice(0, 10);
  const lastSeenCandidates = [existing.lastSeenAt, incoming.csvCreatedDate].filter(Boolean).sort();
  existing.lastSeenAt = lastSeenCandidates[lastSeenCandidates.length - 1] ?? existing.lastSeenAt;
  existing.submissionCount = Math.max(existing.submissionCount, incoming.sourceProfile?.sourceSubmissionCount ?? existing.submissionCount + 1);
  existing.duplicateCount += 1;
  existing.isReturningLead = true;
  existing.sourceSystem = incoming.sourceProfile ? "LOVABLE_CSV_IMPORT" : existing.sourceSystem ?? "CSV_IMPORT";
  existing.sourceRecordType = incoming.sourceProfile ? "APPLICATION" : existing.sourceRecordType;
  existing.sourceRecordId ??= incoming.sourceRecordId;
  existing.externalClientCode ??= incoming.externalClientCode;
  existing.sourceProfile = incoming.sourceProfile ?? existing.sourceProfile;
  existing.syncStatus = "APPLIED";
  existing.organisationId = organisationId || existing.organisationId;
  existing.createdByActorUserId ??= actor?.id;
  existing.updatedByActorUserId = actor?.id ?? existing.updatedByActorUserId;
  existing.recordVersion = (existing.recordVersion ?? 0) + 1;
  return existing;
}

function upsertClientShellFromInboundLead(lead: InboundLeadRecord, actor?: AppUser, organisationId?: string, preserveCanonical = false) {
  const state = getAppState();
  const existingClient = state.clients.find((client) => client.id === lead.uniqueClientId);
  const stage = lead.status === "QUALIFIED" ? "QUALIFIED" : lead.status === "DISQUALIFIED" ? "DISQUALIFIED" : lead.score >= 80 ? "QUALIFIED" : lead.score >= 60 ? "QUALIFYING" : "NEW";
  const setterId = actor?.role === "SETTER" ? actor.id : existingClient?.assignedSetterId ?? "";

  if (existingClient) {
    if (organisationId && existingClient.organisationId && existingClient.organisationId !== organisationId) throw new WorkflowConflictError("Client not found in this organisation.");
    existingClient.displayName = preserveCanonical ? existingClient.displayName || lead.fullName : lead.fullName || existingClient.displayName;
    existingClient.email = preserveCanonical ? existingClient.email || lead.email : lead.email || existingClient.email;
    existingClient.phone = preserveCanonical ? existingClient.phone || lead.phone : lead.phone || existingClient.phone;
    existingClient.city = preserveCanonical ? existingClient.city || lead.city : lead.city || existingClient.city;
    existingClient.source = preserveCanonical ? existingClient.source || lead.source : lead.source || existingClient.source;
    if (!preserveCanonical) { existingClient.assignedSetterId = setterId; existingClient.stage = stage; }
    existingClient.organisationId = organisationId || existingClient.organisationId;
    existingClient.createdByActorUserId ??= actor?.id;
    existingClient.updatedByActorUserId = actor?.id ?? existingClient.updatedByActorUserId;
    existingClient.recordVersion = (existingClient.recordVersion ?? 0) + 1;
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
    stage: preserveCanonical ? "NEW" : stage,
    pipelineStage: "NEW",
    organisationId: organisationId || lead.organisationId,
    createdByActorUserId: actor?.id,
    updatedByActorUserId: actor?.id,
    recordVersion: 1
  };
  state.clients.unshift(client);
  return client;
}

export function importInboundLeads(preview: LeadImportPreview, actor: AppUser, organisationId: string) {
  if (!preview.canImport || preview.batchErrors.length || preview.counts.invalid) throw new Error("The whole CSV batch must pass validation before import.");
  const state = getAppState();
  const importedAt = nowIso();
  const created: InboundLeadRecord[] = [];
  const updated: InboundLeadRecord[] = [];
  const createdClients: ClientRecord[] = [];
  let linkedExisting = 0;
  let unchanged = 0;

  for (const [index, previewRow] of preview.rows.entries()) {
    if (!previewRow.parsed || previewRow.disposition === "INVALID" || previewRow.disposition === "REVIEW_REQUIRED") continue;
    const row = previewRow.parsed;
    const identityKey = buildInboundLeadIdentity(row);
    const uniqueClientId = previewRow.targetClientId!;
    const existing = state.optInLeads.find((item) => item.organisationId === organisationId
      && ((row.sourceRecordId && item.sourceRecordId === row.sourceRecordId)
        || (row.externalClientCode && item.externalClientCode === row.externalClientCode)
        || (!row.sourceRecordId && !row.externalClientCode
          && (item.identityKey === identityKey || item.uniqueClientId === uniqueClientId || item.convertedClientId === uniqueClientId))));

    if (existing) {
      if (row.sourceProfile?.sourceRowHash && existing.sourceProfile?.sourceRowHash === row.sourceProfile.sourceRowHash) {
        unchanged += 1;
        linkedExisting += 1;
        continue;
      }
      const merged = mergeLeadRecord(existing, row, importedAt, actor, organisationId);
      updated.push(merged);
      linkedExisting += 1;
      appendTimeline(
        merged.uniqueClientId,
        "CSV lead matched",
        "A repeat CSV lead was linked to this permanent client after exact identity validation.",
        "Lead",
        actor
      );
      continue;
    }

    const lead = { ...toInboundLeadRecord(row, index), uniqueClientId, identityKey, importedAt,
      organisationId, createdByActorUserId: actor.id, updatedByActorUserId: actor.id, recordVersion: 1 };
    created.push(lead);
    state.optInLeads.push(lead);
    const clientAlreadyExisted = state.clients.some((client) => client.id === uniqueClientId);
    const client = upsertClientShellFromInboundLead(lead, actor, organisationId, true);
    if (clientAlreadyExisted) linkedExisting += 1; else createdClients.push(client);
    appendTimeline(
      lead.uniqueClientId,
      clientAlreadyExisted ? "CSV lead linked" : "CSV lead imported",
      clientAlreadyExisted ? "A validated CSV lead was linked to this permanent client." : "A validated CSV lead created this permanent client record.",
      "Lead",
      actor
    );
  }

  const byIdentity = new Map<string, InboundLeadRecord>();
  for (const lead of state.optInLeads) {
    const sourceKey = lead.sourceRecordId ? `source:${lead.sourceSystem ?? "CSV"}:${lead.sourceRecordId}` : `identity:${lead.identityKey}`;
    byIdentity.set(`${lead.organisationId ?? "legacy"}:${sourceKey}`, lead);
  }

  state.optInLeads = [...byIdentity.values()].sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt));
  return { created, updated, createdClients, linkedExisting, unchanged, reviewRequired: preview.counts.reviewRequired, leads: state.optInLeads };
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

  const clientId = inboundLead.uniqueClientId || nextId("client");
  const client = upsertClientShellFromInboundLead(inboundLead, actor);

  const qualification: LeadQualificationRecord = {
    id: nextId("lead"),
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

export function createCommercialProposal(clientId: string, amountInr?: number, actor?: AppUser, idempotencyKey?: string, expectedRecordVersion?: number) {
  const state = getAppState();
  const client = state.clients.find((item) => item.id === clientId);
  if (!client) throw new Error("Client not found.");
  if (expectedRecordVersion !== undefined && expectedRecordVersion !== (client.recordVersion ?? 0)) {
    throw new WorkflowConflictError("The client changed before the proposal was created. Refresh and review the latest record.");
  }
  if (idempotencyKey) {
    const replay = state.commercialProposals.find((item) => item.clientId === clientId && item.idempotencyKey === idempotencyKey);
    if (replay) return replay;
  }
  const explicitAmount = amountInr ?? state.commercialPolicy.defaultProposalAmountInr;
  if (!Number.isSafeInteger(explicitAmount) || explicitAmount <= 0) throw new Error("Proposal amount must be a positive whole INR amount.");
  if (explicitAmount < state.commercialPolicy.minimumAdvanceInr) throw new Error("Proposal amount cannot be lower than the current minimum advance.");
  const capturedAt = nowIso();
  const proposal: CommercialProposalRecord = {
    id: nextId("proposal"),
    clientId,
    amountInr: explicitAmount,
    minAdvanceInr: state.commercialPolicy.minimumAdvanceInr,
    status: "PENDING_APPROVAL",
    policyVersion: state.commercialPolicy.version,
    termsSnapshot: {
      totalFeeInr: explicitAmount,
      minimumAdvanceInr: state.commercialPolicy.minimumAdvanceInr,
      currency: "INR",
      policyVersion: state.commercialPolicy.version,
      capturedAt
    },
    createdAt: capturedAt,
    createdByActorUserId: actor?.id,
    idempotencyKey
  };

  state.commercialProposals.unshift(proposal);
  appendTimeline(clientId, "Commercial proposal drafted", `Proposal prepared at ${formatMoney(explicitAmount)} under commercial policy v${state.commercialPolicy.version}.`, "Commercial", actor ?? "ADMIN");
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

export function approveCommercialProposal(proposalId: string, reviewer: AppUser, expectedRecordVersion?: number) {
  const state = getAppState();
  const proposal = state.commercialProposals.find((item) => item.id === proposalId);
  if (!proposal) {
    throw new Error("Proposal not found.");
  }
  if (expectedRecordVersion !== undefined && expectedRecordVersion !== (proposal.recordVersion ?? 0)) {
    throw new WorkflowConflictError("The proposal changed before approval. Refresh and review the exact commercial terms.");
  }
  if (reviewer.role !== "SUPER_ADMIN") {
    throw new Error("Only a Super-Admin can approve the commercial proposal.");
  }
  if (proposal.status === "APPROVED" && proposal.reviewerId === reviewer.id) return proposal;

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
  idempotencyKey?: string;
  expectedRecordVersion?: number;
  allowSameActorVerification?: boolean;
}) {
  const state = getAppState();
  const proposal = state.commercialProposals.find((item) => item.id === input.proposalId);
  if (!proposal) {
    throw new Error("Proposal not found.");
  }
  if (input.expectedRecordVersion !== undefined && input.expectedRecordVersion !== (proposal.recordVersion ?? 0)) {
    throw new WorkflowConflictError("The proposal changed before advance confirmation. Refresh and review the latest terms.");
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
  if (!input.allowSameActorVerification && proof.uploadedById === input.actor.id) throw new WorkflowConflictError("The person who uploaded payment proof cannot verify the same proof.");
  if (input.idempotencyKey) {
    const replay = state.advanceVerifications.find((item) => item.proposalId === input.proposalId && item.idempotencyKey === input.idempotencyKey);
    if (replay) {
      if (replay.proofAssetId !== proof.id || replay.amountInr !== input.amountInr) throw new WorkflowConflictError("This advance confirmation key was already used with different evidence or terms.");
      const replayPayment = state.payments.find((item) => item.id === replay.paymentId);
      if (!replayPayment) throw new WorkflowConflictError("The confirmed advance is missing its payment record.");
      return { payment: replayPayment, verification: replay, caseRecord: replay.caseId ? state.vastuCases.find((item) => item.id === replay.caseId) : undefined };
    }
  }
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
  payment.idempotencyKey = input.idempotencyKey;
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
    status: "VERIFIED",
    idempotencyKey: input.idempotencyKey
  };

  state.advanceVerifications.unshift(verification);

  let caseRecord = state.vastuCases.find((item) => item.clientId === input.clientId && item.proposalId === input.proposalId);
  if (!caseRecord) {
    caseRecord = createVastuCase(input.clientId, input.proposalId, input.actor);
    verification.caseId = caseRecord.id;
    verification.status = "CASE_OPENED";
    appendTimeline(input.clientId, "Advance verified and case opened", `Scoped receipt checked. Case ${caseRecord.caseNumber} opened automatically.`, "Payments", input.actor);
  } else {
    verification.caseId = caseRecord.id;
    verification.status = "CASE_OPENED";
    appendTimeline(input.clientId, "Advance verified", `Scoped receipt checked for case ${caseRecord.caseNumber}.`, "Payments", input.actor);
  }

  return { payment, verification, caseRecord };
}

export function createVastuCase(clientId: string, proposalId: string, actor: AppUser, expectedRecordVersion?: number, architectureVersion?: "V1") {
  const state = getAppState();
  const proposal = state.commercialProposals.find((item) => item.id === proposalId);
  if (!proposal) {
    throw new Error("Proposal not found.");
  }
  if (expectedRecordVersion !== undefined && expectedRecordVersion !== (proposal.recordVersion ?? 0)) {
    throw new WorkflowConflictError("The proposal changed before case creation. Refresh and review the confirmed advance.");
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
  const projectId = nextId("project");
  const nextCase = {
    id: nextId("case"),
    caseNumber,
    clientId,
    proposalId,
    projectId,
    status: "CASE_CREATED",
    reportStatus: "DRAFT",
    orientationLocked: false,
    balanceApproved: false,
    fullPaymentApproved: false,
    ...(architectureVersion ? { evaluationArchitectureVersion: architectureVersion } : {})
  } satisfies (typeof state.vastuCases)[number];

  state.vastuCases.unshift(nextCase);
  state.projects.unshift({
    id: projectId,
    clientId,
    activeCaseId: nextCase.id,
    propertyName: "Property project",
    status: "IN_PROGRESS",
    createdAt: nowIso()
  });
  const primaryFloor: FloorWorkspaceRecord = {
    id: nextId("floor"),
    caseId: nextCase.id,
    projectId,
    floorLabel: "Ground floor",
    status: "DRAFT",
    locked: false,
    evidenceUploads: [],
    ...(architectureVersion ? { evaluationArchitectureVersion: architectureVersion } : {})
  };

  state.floorWorkspaces.unshift(primaryFloor);
  appendTimeline(clientId, "Case created", `Case ${caseNumber} opened after scoped advance proof approval.`, "Case", actor);
  return nextCase;
}

export function createVastuCaseV1(clientId: string, proposalId: string, actor: AppUser, expectedRecordVersion?: number) {
  return createVastuCase(clientId, proposalId, actor, expectedRecordVersion, "V1");
}

export function upsertCasePropertyContextV1(input: {
  clientId: string; caseId: string; projectId?: string; propertyContext: import("@/lib/domain").PropertyContext;
  actor: AppUser; idempotencyKey: string; expectedRecordVersion?: number; organisationId?: string;
}) {
  const state = getAppState();
  const architecture = resolveEvaluationArchitecture({ state, caseId: input.caseId });
  if (architecture.caseVersion !== "V1") throw new WorkflowConflictError("V1 property context is only available for an explicitly versioned V1 case.");
  const caseRecord = state.vastuCases.find((item) => item.id === input.caseId);
  if (!caseRecord || caseRecord.clientId !== input.clientId) throw new WorkflowConflictError("Case and client ownership could not be verified.");
  if (input.projectId && caseRecord.projectId !== input.projectId) throw new WorkflowConflictError("Project does not belong to the selected case.");
  const propertyErrors = validateClientIntake({ service: input.propertyContext.serviceInterest, propertyType: input.propertyContext.propertyType, propertyStatus: input.propertyContext.propertyStatus, cityCountry: input.propertyContext.cityCountry, floorCount: input.propertyContext.floorCount?.toString(), locationLink: input.propertyContext.locationLink, latitude: input.propertyContext.latitude?.toString(), longitude: input.propertyContext.longitude?.toString() });
  const firstPropertyError = Object.values(propertyErrors)[0];
  if (firstPropertyError) throw new Error(firstPropertyError);
  const current = state.casePropertyContexts
    .filter((item) => item.caseId === input.caseId && item.clientId === input.clientId && item.status === "CURRENT")
    .sort((a, b) => b.version - a.version)[0];
  if (current && current.recordVersion !== (input.expectedRecordVersion ?? 0)) throw new WorkflowConflictError("Case property context changed. Refresh before saving.");
  if (current && deterministicContentHash(current.propertyContext) === deterministicContentHash(input.propertyContext)) return current;
  return saveCasePropertyContext({ state, clientId: input.clientId, caseId: input.caseId, projectId: input.projectId, propertyContext: input.propertyContext, actorId: input.actor.id, organisationId: input.organisationId, idempotencyKey: input.idempotencyKey, expectedVersion: input.expectedRecordVersion });
}

/** V1 client-owned intake fields; deliberately leaves propertyContext untouched. */
export function upsertClientIntakeProfileV1(input: Record<string, unknown> & { actor: AppUser }) {
  const state = getAppState();
  const clientId = boundedRequiredString(input.clientId, "Client ID");
  const client = state.clients.find((item) => item.id === clientId);
  if (!client) throw new Error("Client not found.");
  const caseId = boundedRequiredString(input.caseId, "Case ID");
  const caseRecord = state.vastuCases.find((item) => item.id === caseId && item.clientId === clientId);
  if (!caseRecord || (input.projectId && caseRecord.projectId !== input.projectId)) throw new WorkflowConflictError("Intake context does not match the selected case, project and client.");
  if (resolveEvaluationArchitecture({ state, caseId }).caseVersion !== "V1") throw new WorkflowConflictError("V1 client intake is only available for an explicitly versioned V1 case.");
  const idempotencyKey = boundedRequiredString(input.idempotencyKey, "Idempotency key", 120);
  const existing = state.clientIntakeProfiles.find((item) => item.clientId === clientId);
  if (existing?.idempotencyKey === idempotencyKey) return existing;
  assertExpectedRecordVersion(client, input.expectedRecordVersion);
  const contact = intakeObject(input.contactPreference, "Contact preference", ["whatsapp", "preferredLanguage", "preferredContactWindow"]);
  const whatsapp = contact?.whatsapp ? String(contact.whatsapp).replace(/[\s()-]/g, "") : undefined;
  if (whatsapp && !/^\+[1-9]\d{7,14}$/.test(whatsapp)) throw new Error("WhatsApp number must use valid international E.164 format.");
  const business = intakeObject(input.businessContext, "Business context", ["company", "industry", "designation", "vision"]);
  const needsInput = intakeObject(input.needs, "Needs", ["mainChallenge", "desiredOutcome", "urgency"]);
  const needs = needsInput ? { mainChallenge: optionalIntakeString(needsInput.mainChallenge, "Main challenge", 1000), desiredOutcome: optionalIntakeString(needsInput.desiredOutcome, "Desired outcome", 1000), urgency: optionalIntakeString(needsInput.urgency, "Urgency", 120) } : undefined;
  const needsErrors = validateClientIntake({ challenge: needs?.mainChallenge, outcome: needs?.desiredOutcome });
  if (needsErrors.challenge || needsErrors.outcome) throw new Error(needsErrors.challenge ?? needsErrors.outcome);
  const consent = intakeObject(input.consent, "Consent", ["version", "contact", "accuracy", "confidentiality"]);
  if (!consent || consent.version !== "uchit-intake/v1") throw new Error("Consent version must be uchit-intake/v1.");
  const stamp = audit(input.actor);
  const profile = { clientId, version: (existing?.version ?? 0) + 1, idempotencyKey, contactPreference: contact ? { whatsapp, preferredLanguage: optionalIntakeString(contact.preferredLanguage, "Preferred language", 80), preferredContactWindow: optionalIntakeString(contact.preferredContactWindow, "Preferred contact window", 120) } : existing?.contactPreference, businessContext: business ? { company: optionalIntakeString(business.company, "Company", 160), industry: optionalIntakeString(business.industry, "Industry", 120), designation: optionalIntakeString(business.designation, "Designation", 120), vision: optionalIntakeString(business.vision, "Business vision", 1000) } : existing?.businessContext, decisionMakerStatus: input.decisionMakerStatus ? enumValue(input.decisionMakerStatus, decisionMakerStatuses, "decision-maker status") as DecisionMakerStatus : existing?.decisionMakerStatus, otherDecisionMakers: optionalIntakeString(input.otherDecisionMakers, "Other decision makers", 500) ?? existing?.otherDecisionMakers, propertyContext: existing?.propertyContext, needs, consent: { version: "uchit-intake/v1" as const, contact: consent.contact as boolean | undefined, accuracy: consent.accuracy as boolean | undefined, confidentiality: consent.confidentiality as boolean | undefined, confirmedAt: existing?.consent.confirmedAt ?? stamp.at }, created: existing?.created ?? stamp, updated: stamp };
  if (existing) Object.assign(existing, profile); else state.clientIntakeProfiles.unshift(profile);
  client.recordVersion = (client.recordVersion ?? 0) + 1;
  return profile;
}

/** Composite V1 save: property truth and client-intake needs commit through one action snapshot. */
export function saveClientIntakeV1(input: Record<string, unknown> & { actor: AppUser; propertyContext: import("@/lib/domain").PropertyContext }) {
  const state = getAppState();
  const clientId = boundedRequiredString(input.clientId, "Client ID");
  const caseId = boundedRequiredString(input.caseId, "Case ID");
  const idempotencyKey = boundedRequiredString(input.idempotencyKey, "Idempotency key", 120);
  const currentContext = state.casePropertyContexts
    .filter((item) => item.caseId === caseId && item.clientId === clientId && item.status === "CURRENT")
    .sort((a, b) => b.version - a.version)[0];
  const existingProfile = state.clientIntakeProfiles.find((item) => item.clientId === clientId);
  const comparableProfile = (item: typeof existingProfile) => item ? {
    contactPreference: item.contactPreference, businessContext: item.businessContext,
    decisionMakerStatus: item.decisionMakerStatus, otherDecisionMakers: item.otherDecisionMakers,
    needs: item.needs, consent: { version: item.consent.version, contact: item.consent.contact, accuracy: item.consent.accuracy, confidentiality: item.consent.confidentiality }
  } : undefined;
  const incomingProfile = {
    contactPreference: input.contactPreference, businessContext: input.businessContext,
    decisionMakerStatus: input.decisionMakerStatus, otherDecisionMakers: input.otherDecisionMakers,
    needs: input.needs, consent: input.consent
  };
  if (currentContext?.idempotencyKey === idempotencyKey && deterministicContentHash(currentContext.propertyContext) !== deterministicContentHash(input.propertyContext)) throw new WorkflowConflictError("The V1 intake idempotency key was reused with a different property context.");
  if (existingProfile?.idempotencyKey === idempotencyKey && deterministicContentHash(comparableProfile(existingProfile)) !== deterministicContentHash(incomingProfile)) throw new WorkflowConflictError("The V1 intake idempotency key was reused with a different client-intake body.");
  const propertyContext = upsertCasePropertyContextV1({
    clientId, caseId, projectId: typeof input.projectId === "string" ? input.projectId : undefined,
    propertyContext: input.propertyContext, actor: input.actor, idempotencyKey,
    expectedRecordVersion: input.propertyContextExpectedRecordVersion as number | undefined,
    organisationId: input.organisationId as string | undefined
  });
  const profile = upsertClientIntakeProfileV1({ ...input, actor: input.actor, expectedRecordVersion: input.clientExpectedRecordVersion });
  return { propertyContext, profile };
}

export function addFloorWorkspace(caseId: string, floorLabel: string, actor: AppUser, expectedRecordVersion?: number, idempotencyKey?: string) {
  const state = getAppState();
  const caseRecord = state.vastuCases.find((item) => item.id === caseId);
  if (!caseRecord) {
    throw new Error("Case not found.");
  }

  assertExpectedRecordVersion(caseRecord, expectedRecordVersion);
  const stableKey = boundedRequiredString(idempotencyKey, "Idempotency key", 160);
  const retry = state.floorWorkspaces.find((workspace) => workspace.caseId === caseId && workspace.idempotencyKey === stableKey);
  if (retry) return retry;

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

  let projectId = caseRecord.projectId;
  if (!projectId) {
    const project = {
      id: nextId("project"),
      clientId: caseRecord.clientId,
      activeCaseId: caseRecord.id,
      propertyName: "Property project",
      status: "IN_PROGRESS" as const,
      createdAt: nowIso()
    };
    state.projects.unshift(project);
    projectId = project.id;
    caseRecord.projectId = projectId;
  }

  const workspace: FloorWorkspaceRecord = {
    id: nextId("floor"),
    caseId,
    projectId,
    floorLabel: normalizedLabel,
    status: "DRAFT",
    locked: false,
    evidenceUploads: [],
    idempotencyKey: stableKey,
    ...(caseRecord.evaluationArchitectureVersion ? { evaluationArchitectureVersion: caseRecord.evaluationArchitectureVersion } : {})
  };

  state.floorWorkspaces.unshift(workspace);
  caseRecord.recordVersion = (caseRecord.recordVersion ?? 0) + 1;
  caseRecord.status = caseRecord.orientationLocked ? caseRecord.status : "FLOOR_WORKSPACE_ACTIVE";
  appendTimeline(caseRecord.clientId, "Floor workspace created", `${normalizedLabel} added to the case workspace.`, "Workspace", actor.role);
  return workspace;
}

export function addFloorEvidence(floorId: string, fileName: string, actor: AppUser, expectedRecordVersion?: number, idempotencyKey?: string, requestHash?: string) {
  const state = getAppState();
  const workspace = state.floorWorkspaces.find((item) => item.id === floorId);
  if (!workspace) {
    throw new Error("Floor workspace not found.");
  }

  const caseRecord = state.vastuCases.find((item) => item.id === workspace.caseId);
  if (!caseRecord) {
    throw new Error("Case not found.");
  }

  const stableKey = boundedRequiredString(idempotencyKey, "Idempotency key", 160);
  const hash = boundedRequiredString(requestHash, "Request hash", 256);
  if (workspace.evidenceIdempotencyKey === stableKey) {
    if (workspace.evidenceRequestHash !== hash) throw new WorkflowConflictError("This floor-evidence key was already used with different content.");
    return workspace;
  }
  assertExpectedRecordVersion(caseRecord, expectedRecordVersion);
  const normalizedFileName = String(fileName ?? "").trim();
  if (!normalizedFileName) {
    throw new Error("Evidence file name is required.");
  }

  if (!workspace.evidenceUploads.includes(normalizedFileName)) {
    workspace.evidenceUploads.push(normalizedFileName);
  }

  workspace.evidenceIdempotencyKey = stableKey;
  workspace.evidenceRequestHash = hash;
  caseRecord.recordVersion = (caseRecord.recordVersion ?? 0) + 1;
  appendTimeline(caseRecord.clientId, "Evidence added", `${normalizedFileName} attached to ${workspace.floorLabel}.`, "Workspace", actor.role);
  return workspace;
}

export function markFloorWorkspaceReady(floorId: string, actor: AppUser, expectedRecordVersion?: number, idempotencyKey?: string, requestHash?: string) {
  const state = getAppState();
  const workspace = state.floorWorkspaces.find((item) => item.id === floorId);
  if (!workspace) {
    throw new Error("Floor workspace not found.");
  }

  const caseRecord = state.vastuCases.find((item) => item.id === workspace.caseId);
  if (!caseRecord) {
    throw new Error("Case not found.");
  }

  const stableKey = boundedRequiredString(idempotencyKey, "Idempotency key", 160);
  const hash = boundedRequiredString(requestHash, "Request hash", 256);
  if (workspace.readyIdempotencyKey === stableKey) {
    if (workspace.readyRequestHash !== hash) throw new WorkflowConflictError("This floor-ready key was already used with different content.");
    return workspace;
  }
  if (workspace.readyIdempotencyKey) throw new WorkflowConflictError("Floor readiness has already been recorded for this floor revision.");
  if (!Number.isInteger(expectedRecordVersion) || (caseRecord.recordVersion ?? 0) !== expectedRecordVersion) throw new PreconditionRequiredError("The latest case record version is required. Refresh and try again.");

  // `locked` is the authoritative Floor Setup completion marker consumed by the
  // Founder scorecard. Previously this action only wrote READY_FOR_REVIEW,
  // leaving the UI to report success while Steps 03–04 stayed blocked.
  workspace.locked = true;
  workspace.status = "LOCKED";
  workspace.readyIdempotencyKey = stableKey;
  workspace.readyRequestHash = hash;
  caseRecord.recordVersion = (caseRecord.recordVersion ?? 0) + 1;
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
  if (caseRecord.stageAVerdictStatus !== "PRESENTED" || !caseRecord.verdictPresentedAt) {
    throw new WorkflowConflictError("Balance confirmation is blocked until the exact Stage A verdict version has been presented and recorded.");
  }
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
  idempotencyKey?: string;
  expectedRecordVersion?: number;
  allowSameActorVerification?: boolean;
}) {
  const state = getAppState();
  const caseRecord = state.vastuCases.find((item) => item.id === input.caseId);
  if (!caseRecord) {
    throw new Error("Case not found.");
  }
  if (input.expectedRecordVersion !== undefined && input.expectedRecordVersion !== (caseRecord.recordVersion ?? 0)) {
    throw new WorkflowConflictError("The case changed before balance confirmation. Refresh and review the latest state.");
  }

  const proof = await readPaymentProofForVerification(input.proofId, {
    key: "balance-proof",
    clientId: input.clientId,
    caseId: input.caseId
  });
  if (!proof?.id) throw new Error("Choose an uploaded balance proof for this client and active case.");
  if (!input.allowSameActorVerification && proof.uploadedById === input.actor.id) throw new WorkflowConflictError("The person who uploaded payment proof cannot verify the same proof.");
  if (input.idempotencyKey) {
    const replay = state.payments.find((item) => item.caseId === input.caseId && item.type === "BALANCE" && item.idempotencyKey === input.idempotencyKey);
    if (replay) {
      if (replay.proofAssetId !== proof.id || replay.amountInr !== input.amountInr) throw new WorkflowConflictError("This balance confirmation key was already used with different evidence or terms.");
      return { payment: replay, caseRecord };
    }
  }
  const existingPayment = state.payments.find((item) => item.clientId === input.clientId && item.caseId === input.caseId && item.type === "BALANCE" && item.status === "APPROVED");
  if (existingPayment?.proofAssetId === proof.id) return { payment: existingPayment, caseRecord };
  if (existingPayment) throw new WorkflowConflictError("This case already has a different verified balance proof.");

  const payment = approveBalancePayment(input.clientId, input.caseId, input.amountInr, input.actor);
  payment.proofAssetId = proof.id;
  payment.referenceScreenshotUrl = proof.url;
  payment.referenceScreenshotFileName = proof.fileName;
  payment.verifiedBy = input.actor.fullName;
  payment.verifiedAt = nowIso();
  payment.idempotencyKey = input.idempotencyKey;
  payment.verificationNote = "Scoped balance receipt uploaded and checked before unlocking the final report flow.";

  appendTimeline(
    input.clientId,
    "Balance proof verified",
    `${formatMoney(input.amountInr)} balance verified from ${proof.fileName}. Final report flow is now unlocked.`,
    "Payments",
    input.actor
  );

  for (const floor of state.floorWorkspaces.filter((item) => item.caseId === caseRecord.id)) {
    ensureStageBReservation({ state, caseId: caseRecord.id, floorId: floor.id, actor: input.actor });
  }

  return { payment, caseRecord };
}

export async function generatePreviewReport(caseId: string, floorIdValue: unknown, actor: AppUser, expectedRecordVersion?: number, idempotencyKey?: unknown) {
  const { state, caseRecord, floor } = evaluationFloorContext(caseId, floorIdValue);
  assertExpectedRecordVersion(caseRecord, expectedRecordVersion);
  const stableKey = boundedRequiredString(idempotencyKey, "Idempotency key", 160);
  if (caseRecord.status === "VERDICT_RELEASED") {
    throw new Error("Cannot generate a preview for a released verdict.");
  }
  if (!state.evaluationSnapshots.some((item) => item.caseId === caseId && item.floorId === floor.id) || !state.shaktiSnapshots.some((item) => item.caseId === caseId && item.floorId === floor.id)) {
    throw new WorkflowConflictError("Stage A preview requires completed Utility and Shakti evaluation snapshots for this floor.");
  }
  if (caseRecord.organisationId && !(state.utilityVerdicts ?? []).some((item) => item.caseId === caseId && item.floorId === floor.id && item.status === "APPROVED" && state.evaluationSnapshots.some((evaluation) => evaluation.id === item.utilityEvaluationSnapshotId && evaluation.caseId === caseId && evaluation.floorId === floor.id))) {
    throw new WorkflowConflictError("Stage A preview requires at least one approved Utility bar-graph verdict for this exact floor.");
  }
  const existingPreview = state.reportVersions.find((item) => item.caseId === caseId && item.floorId === floor.id && item.isPreview && item.artifact?.immutable);
  if (existingPreview?.idempotencyKey === stableKey) return existingPreview;
  if (existingPreview) throw new WorkflowConflictError("An immutable preview already exists for this floor. Use formal rectification for a new version.");

  const report: ReportVersionRecord = {
      id: nextId("report"),
      organisationId: caseRecord.organisationId,
      caseId,
      floorId: floor.id,
      versionLabel: `${floor.floorLabel} · Stage-A Preview`,
      isPreview: true,
      status: "PAYMENT_BLOCKED",
      watermarkText: "Preview only. Balance pending.",
      idempotencyKey: stableKey,
      approvals: []
    } satisfies ReportVersionRecord;
  const { createArtifactManifest, PREVIEW_WATERMARK } = await import("@/lib/report-artifacts");
  report.watermarkText = PREVIEW_WATERMARK;
  report.artifact = await createArtifactManifest(state, report, actor);
  state.reportVersions.unshift(report);
  floor.reportStatus = "PAYMENT_BLOCKED";
  floor.stageAVerdictStatus = "READY";
  floor.stageAVerdictVersion = report.versionLabel;
  floor.recordVersion = (floor.recordVersion ?? 0) + 1;
  const allFloorsReady = state.floorWorkspaces.filter((item) => item.caseId === caseId).every((item) => item.stageAVerdictStatus === "READY" || item.stageAVerdictStatus === "PRESENTED");
  caseRecord.reportStatus = allFloorsReady ? "PAYMENT_BLOCKED" : caseRecord.reportStatus;
  caseRecord.status = allFloorsReady ? "STAGE_A_READY" : caseRecord.status;
  caseRecord.stageAVerdictStatus = allFloorsReady ? "READY" : caseRecord.stageAVerdictStatus;
  caseRecord.recordVersion = (caseRecord.recordVersion ?? 0) + 1;

  appendTimeline(caseRecord.clientId, "Stage-A floor preview generated", `${floor.floorLabel} watermarked preview is ready for Founder review.`, "Reports", actor);
  return report;
}

export function recordStageAVerdictPresentation(input: { caseId: string; floorId: unknown; note: unknown; actor: AppUser; idempotencyKey: unknown; expectedRecordVersion?: number }) {
  const state = getAppState();
  const caseRecord = state.vastuCases.find((item) => item.id === input.caseId);
  if (!caseRecord) throw new Error("Case not found.");
  const floorId = boundedRequiredString(input.floorId, "Floor ID", 160);
  const floor = state.floorWorkspaces.find((item) => item.id === floorId && item.caseId === input.caseId && item.projectId === caseRecord.projectId);
  if (!floor) throw new WorkflowConflictError("Stage A presentation floor does not belong to the active project and case.");
  if (input.expectedRecordVersion !== undefined && input.expectedRecordVersion !== (caseRecord.recordVersion ?? 0)) {
    throw new WorkflowConflictError("The case changed before verdict presentation was recorded. Refresh and review the latest Stage A version.");
  }
  const key = boundedRequiredString(input.idempotencyKey, "Idempotency key", 160);
  if (floor.verdictPresentationIdempotencyKey === key && floor.stageAVerdictStatus === "PRESENTED") return caseRecord;
  if (floor.stageAVerdictStatus === "PRESENTED") throw new WorkflowConflictError("A different Stage A presentation is already recorded for this floor revision.");
  const note = boundedRequiredString(input.note, "Presentation note", 500);
  if (note.length < 20) throw new Error("Presentation note must contain at least 20 characters.");
  const preview = state.reportVersions.find((item) => item.caseId === input.caseId && item.floorId === floor.id && item.isPreview && item.artifact?.immutable);
  if (!preview || !preview.watermarkText) throw new WorkflowConflictError("Present the immutable watermarked Stage A preview before recording the verdict presentation.");
  floor.stageAVerdictStatus = "PRESENTED";
  floor.stageAVerdictVersion = preview.versionLabel;
  floor.verdictPresentedAt = nowIso();
  floor.verdictPresentedByActorUserId = input.actor.id;
  floor.verdictPresentationIdempotencyKey = key;
  floor.recordVersion = (floor.recordVersion ?? 0) + 1;
  const allFloorsPresented = state.floorWorkspaces.filter((item) => item.caseId === input.caseId).every((item) => item.stageAVerdictStatus === "PRESENTED");
  caseRecord.stageAVerdictStatus = allFloorsPresented ? "PRESENTED" : "READY";
  caseRecord.stageAVerdictVersion = allFloorsPresented ? `All ${state.floorWorkspaces.filter((item) => item.caseId === input.caseId).length} floor verdicts presented` : caseRecord.stageAVerdictVersion;
  caseRecord.verdictPresentedAt = allFloorsPresented ? nowIso() : caseRecord.verdictPresentedAt;
  caseRecord.verdictPresentedByActorUserId = allFloorsPresented ? input.actor.id : caseRecord.verdictPresentedByActorUserId;
  caseRecord.verdictPresentationNote = allFloorsPresented ? note : caseRecord.verdictPresentationNote;
  caseRecord.verdictPresentationIdempotencyKey = allFloorsPresented ? key : caseRecord.verdictPresentationIdempotencyKey;
  caseRecord.status = allFloorsPresented ? "BALANCE_PENDING" : "STAGE_A_READY";
  caseRecord.recordVersion = (caseRecord.recordVersion ?? 0) + 1;
  appendTimeline(caseRecord.clientId, "Stage A floor verdict presented", `${preview.versionLabel} was presented by ${input.actor.fullName}. ${note}`, "Reports", input.actor);
  return caseRecord;
}

export async function prepareFinalReport(caseId: string, floorIdValue: unknown, actor: AppUser, expectedRecordVersion?: number, idempotencyKey?: unknown) {
  const state = getAppState();
  const caseRecord = state.vastuCases.find((item) => item.id === caseId);
  if (!caseRecord) {
    throw new Error("Case not found.");
  }
  if (!caseRecord.balanceApproved || !caseRecord.fullPaymentApproved) {
    throw new Error("Final report can only be prepared after the balance is approved.");
  }
  assertExpectedRecordVersion(caseRecord, expectedRecordVersion);
  const floorId = boundedRequiredString(floorIdValue, "Floor ID", 160);
  const stableKey = boundedRequiredString(idempotencyKey, "Idempotency key", 160);
  const floor = state.floorWorkspaces.find((item) => item.id === floorId && item.caseId === caseId && item.projectId === caseRecord.projectId);
  const nativeV1StageB = state.stageBRemediations.find((item) => item.caseId === caseId && item.floorId === floor?.id && item.architectureVersion === "V1" && item.state === "PAGE_FINALISED");
  if (!floor || (floor.stageAVerdictStatus !== "PRESENTED" && !nativeV1StageB)) throw new WorkflowConflictError("Prepare the official report only after this floor's immutable Stage A preview has been presented or its certified native V1 Stage-B sequence has been finalized.");
  const balancePayment = state.payments.find((item) => item.caseId === caseId && item.type === "BALANCE" && item.status === "APPROVED");
  if (!balancePayment?.proofAssetId) throw new WorkflowConflictError("Final report preparation requires exact scoped and confirmed balance proof.");

  const existing = state.reportVersions.find((item) => item.caseId === caseId && item.floorId === floor.id && !item.isPreview);
  if (existing?.idempotencyKey === stableKey) return existing;
  if (existing?.artifact?.immutable) throw new Error("This floor report version is immutable. Create a new revision through formal rectification instead of changing it.");
  const report: ReportVersionRecord = {
      id: nextId("report"),
      organisationId: caseRecord.organisationId,
      caseId,
      floorId: floor.id,
      versionLabel: `${floor.floorLabel} · Official Verdict Report`,
      isPreview: false,
      status: "READY_FOR_APPROVAL",
      idempotencyKey: stableKey,
      approvals: []
    } satisfies ReportVersionRecord;
  const { createArtifactManifest } = await import("@/lib/report-artifacts");
  report.artifact = await createArtifactManifest(state, report, actor);
  state.reportVersions.unshift(report);

  floor.reportStatus = "READY_FOR_APPROVAL";
  floor.recordVersion = (floor.recordVersion ?? 0) + 1;
  caseRecord.reportStatus = "READY_FOR_APPROVAL";
  caseRecord.status = "REPORT_APPROVAL_PENDING";
  caseRecord.recordVersion = (caseRecord.recordVersion ?? 0) + 1;
  appendTimeline(caseRecord.clientId, "Final floor report prepared", `${floor.floorLabel} official verdict report prepared by ${actor.fullName}.`, "Reports", actor);
  return report;
}

function evaluationFloorContext(caseId: string, floorIdValue: unknown, regenerationTarget?: "UTILITY_EVALUATION" | "SHAKTI_EVALUATION") {
  const state = getAppState();
  const floorId = boundedRequiredString(floorIdValue, "Floor ID", 160);
  const ignoredTargets = regenerationTarget ? ["UTILITY_EVALUATION", "SHAKTI_EVALUATION", "FINDING", "DRAFT_REPORT"] : undefined;
  const regenerationBlockers = regenerationTarget ? getCaseEvaluationBlockers(state, caseId, floorId, { ignoreRegenerationTargetTypes: ignoredTargets }) : [];
  if (regenerationBlockers.length) throw new WorkflowConflictError(`Evaluation regeneration is blocked. ${regenerationBlockers.join(" ")}`);
  const { caseRecord, floors } = regenerationTarget
    ? { caseRecord: state.vastuCases.find((item) => item.id === caseId)!, floors: state.floorWorkspaces.filter((item) => item.caseId === caseId && item.id === floorId) }
    : assertCaseReadyForEvaluation(state, caseId, floorId);
  const floor = floors[0];
  if (!floor || floor.id !== floorId || floor.projectId !== caseRecord.projectId) throw new WorkflowConflictError("Evaluation floor does not belong to the active project and case.");
  const plan = state.planVersions.find((item) => item.caseId === caseId && item.floorId === floorId && item.status === "CURRENT");
  const orientation = state.orientationVersions.find((item) => item.caseId === caseId && item.status === "LOCKED");
  const markedEvidence = state.spatialEvidenceVersions.find((item) => item.caseId === caseId && item.floorId === floorId && item.planVersionId === plan?.id && item.kind === "HAND_MARKED_PLAN" && item.status === "CURRENT" && item.fullColour);
  if (!plan || !orientation || !markedEvidence) throw new WorkflowConflictError("Current plan, locked orientation, and full-colour marked evidence are required for this floor evaluation.");
  return { state, caseRecord, floor, plan, orientation, markedEvidence };
}

export function createEvaluationSnapshot(caseId: string, floorIdValue: unknown, snapshotName: unknown = "Residential tab evaluation", zoneCodes: unknown = undefined, actor: AppUser, expectedRecordVersion?: number, idempotencyKey?: unknown, utilityInputs?: unknown) {
  const { state, caseRecord, floor, plan, orientation } = evaluationFloorContext(caseId, floorIdValue, "UTILITY_EVALUATION");
  assertExpectedRecordVersion(caseRecord, expectedRecordVersion);
  const stableKey = boundedRequiredString(idempotencyKey, "Idempotency key", 160);
  if (!actor.organisationId) throw new WorkflowConflictError("Utility evaluation is blocked until an organisation-scoped methodology version is active.");
  const genericMethodology = getMethodologyReadiness(state, actor.organisationId, "UTILITY");
  if (!genericMethodology.ready) throw new WorkflowConflictError(`Utility evaluation is ${genericMethodology.status}: ${genericMethodology.reason}`);
  const methodology = getUtilityMasterMethodologyBinding(state, actor.organisationId);
  if (!methodology.ready || !methodology.version) throw new WorkflowConflictError(`Utility evaluation is ${methodology.status}: ${methodology.reason}. Blocked — Methodology Input Required.`);
  if (typeof snapshotName !== "string" || !snapshotName.trim()) throw new Error("Snapshot name must be a non-blank string.");
  const cleanSnapshotName = boundedRequiredString(snapshotName, "Snapshot name", MAX_SNAPSHOT_NAME_LENGTH);
  if (zoneCodes !== undefined && !Array.isArray(zoneCodes)) throw new Error("Zone codes must be a list.");
  const rawInputs = utilityInputs ?? (Array.isArray(zoneCodes) ? zoneCodes.map((zoneCode) => {
    if (typeof zoneCode !== "string" || !zoneCode.includes("|")) throw new Error(`Unknown zone code: ${String(zoneCode)}. Use UtilityMaster utilityName|directionCode inputs.`);
    const [utilityName, directionCode] = zoneCode.split("|");
    return { utilityName, directionCode };
  }) : undefined);
  if (!Array.isArray(rawInputs) || rawInputs.length === 0 || rawInputs.length > 64) throw new Error("Choose one to 64 UtilityMaster utility and direction inputs.");
  const inputKeys = new Set<string>();
  const selectedInputs = rawInputs.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Each UtilityMaster input must be an object.");
    const value = item as Record<string, unknown>;
    if (Object.keys(value).some((key) => !["utilityName", "directionCode"].includes(key))) throw new Error("Unsupported UtilityMaster input field.");
    const utilityName = boundedRequiredString(value.utilityName, "Utility name", 120);
    const directionCode = boundedRequiredString(value.directionCode, "Direction code", 40);
    const key = `${utilityName}\u0000${directionCode}`;
    if (inputKeys.has(key)) throw new Error("UtilityMaster inputs must not contain duplicates.");
    inputKeys.add(key);
    return { utilityName, directionCode };
  });
  const resolved = selectedInputs.map((input) => ({ input, result: resolveUtilityMasterRows(input.utilityName, input.directionCode) }));
  // REVIEW_REQUIRED and BLOCKED_METHOD_INPUT are terminal safety states here; never guess a source row.
  const unresolved = resolved.find((item) => item.result.status !== "APPROVED");
  if (unresolved) throw new WorkflowConflictError(`${unresolved.result.status}: ${unresolved.result.reason}`);
  const sourceRows = resolved.flatMap((item) => item.result.rows);
  const sourceRuleRefs = sourceRows.map((row) => utilityMasterRuleId(row));
  const caseInputs = {
    caseId: caseRecord.id,
    caseStatus: caseRecord.status,
    orientationLocked: caseRecord.orientationLocked,
    floors: [{ id: floor.id, floorLabel: floor.floorLabel, status: floor.status, locked: floor.locked }]
  };
  const generatedMatrix = sourceRows.map((row) => ({
    code: `${row.utilityName}|${row.directionCode}`,
    verdict: row.outcome,
    utilityName: row.utilityName,
    directionCode: row.directionCode,
    attributeText: row.attributeText,
    sourceRowNumber: row.rowNumber,
    ruleId: utilityMasterRuleId(row),
    status: "APPROVED" as const
  }));
  const sourceContentHash = UTILITY_MASTER_WORKBOOK_HASH;
  const inputHash = deterministicContentHash({ caseInputs, floorId: floor.id, planVersionId: plan.id, orientationVersionId: orientation.id, snapshotName: cleanSnapshotName, selectedInputs, sourceContentHash, sourceVersion: UTILITY_MASTER_SOURCE_VERSION, methodologyVersionId: methodology.version.id, methodologyContentHash: methodology.version.contentHash });
  const existingSnapshot = state.evaluationSnapshots.find((item) => item.caseId === caseId && item.floorId === floor.id && item.planVersionId === plan.id && item.orientationVersionId === orientation.id);
  if (existingSnapshot) {
    if (existingSnapshot.provenance?.inputHash === inputHash) return existingSnapshot;
    const replacementRequired = state.dependencyInvalidations.some((item) => item.caseId === caseId && item.floorId === floor.id && item.targetType === "UTILITY_EVALUATION" && item.targetId === existingSnapshot.id && item.status === "REPLACEMENT_REQUIRED");
    if (!replacementRequired) throw new WorkflowConflictError("A different Utility evaluation already exists for this case. Start formal rectification before creating another snapshot.");
  }
  const historicalSnapshots = state.evaluationSnapshots.filter((item) => item.caseId === caseId && item.floorId === floor.id);
  if (historicalSnapshots.length && !historicalSnapshots.some((snapshot) => state.dependencyInvalidations.some((item) => item.caseId === caseId && item.floorId === floor.id && item.targetType === "UTILITY_EVALUATION" && item.targetId === snapshot.id && item.status === "REPLACEMENT_REQUIRED"))) {
    throw new WorkflowConflictError("Require a replacement on the affected Utility evaluation before generating a new version.");
  }
  const snapshot: EvaluationSnapshotRecord = {
    id: nextId("eval"),
    caseId,
    floorId: floor.id,
    planVersionId: plan.id,
    orientationVersionId: orientation.id,
    idempotencyKey: stableKey,
    snapshotName: cleanSnapshotName,
    sourceVersion: `${methodology.version.label} · ${UTILITY_MASTER_SOURCE_VERSION}`,
    generatedMatrix,
    provenance: {
      inputHash,
      outputHash: deterministicContentHash(generatedMatrix),
      sourceContentHash,
      ruleSetFormatVersion: UTILITY_RULESET_FORMAT_VERSION,
      algorithmVersion: UTILITY_EVALUATION_ALGORITHM_VERSION,
      methodologyVersionId: methodology.version.id,
      methodologyContentHash: methodology.version.contentHash,
      caseInputs,
      selectedRuleIds: sourceRuleRefs,
      sourceRuleRefs,
      sourceWorkbookHash: UTILITY_MASTER_WORKBOOK_HASH,
      sourceWorkbookVersion: UTILITY_MASTER_SOURCE_VERSION,
      explainabilityStatus: "APPROVED"
    }
  };

  state.evaluationSnapshots.unshift(snapshot);
  caseRecord.recordVersion = (caseRecord.recordVersion ?? 0) + 1;
  appendTimeline(caseRecord.clientId, "Utility evaluation snapshot generated", `${cleanSnapshotName} captured from the master rule table by ${actor.fullName}.`, "Evaluation", actor);
  return snapshot;
}

export function createUtilityVerdict(input: {
  caseId: string; floorId: unknown; utilityEvaluationSnapshotId: unknown; element: unknown; directionSet: unknown; bars: unknown;
  redLine: unknown; balanceLine: unknown; blueLine: unknown; actor: AppUser; expectedRecordVersion?: unknown; idempotencyKey?: unknown;
}) {
  if (input.actor.role !== "SUPER_ADMIN" || (input.actor.organisationId && input.actor.organisationCapability !== "organisation_owner")) throw new WorkflowConflictError("Only the Founder organisation owner can frame Utility verdicts.");
  const { state, caseRecord, floor, plan, orientation } = evaluationFloorContext(input.caseId, input.floorId, "UTILITY_EVALUATION");
  assertExpectedRecordVersion(caseRecord, input.expectedRecordVersion);
  const stableKey = boundedRequiredString(input.idempotencyKey, "Idempotency key", 160);
  const snapshotId = boundedRequiredString(input.utilityEvaluationSnapshotId, "Utility evaluation snapshot ID", 160);
  const snapshot = state.evaluationSnapshots.find((item) => item.id === snapshotId && item.caseId === caseRecord.id && item.floorId === floor.id && item.planVersionId === plan.id && item.orientationVersionId === orientation.id);
  if (!snapshot) throw new WorkflowConflictError("The Utility evaluation snapshot must belong to this exact case, floor, current plan, and locked orientation.");
  if (snapshot.provenance?.explainabilityStatus !== "APPROVED" || snapshot.provenance.sourceWorkbookHash !== UTILITY_MASTER_WORKBOOK_HASH) throw new WorkflowConflictError("Only an approved UtilityMaster evaluation can produce a Utility verdict.");
  const graph = calculateUtilityGraphVerdict({
    element: input.element as string,
    directionSet: input.directionSet as string[],
    bars: input.bars as Array<{ directionCode: string; value: number }>,
    lines: { extension: input.redLine as number, balance: input.balanceLine as number, exhaustion: input.blueLine as number }
  });
  const sourceEntries = snapshot.generatedMatrix.filter((entry) => entry.status === "APPROVED" && entry.directionCode && graph.frozenInput.directionSet.includes(entry.directionCode));
  if (sourceEntries.length === 0 || sourceEntries.some((entry) => !entry.ruleId)) throw new WorkflowConflictError("Every Utility verdict direction must bind to an approved UtilityMaster source rule.");
  const sourceRuleIds = sourceEntries.flatMap((entry) => entry.ruleId ? [entry.ruleId] : []);
  const sourceRowNumbers = sourceEntries.flatMap((entry) => entry.sourceRowNumber === undefined ? [] : [entry.sourceRowNumber]);
  const inputHash = deterministicContentHash({ graphInputHash: graph.inputHash, snapshotId, snapshotInputHash: snapshot.provenance.inputHash, methodologyVersionId: snapshot.provenance.methodologyVersionId, methodologyContentHash: snapshot.provenance.methodologyContentHash, sourceRuleIds });
  const existing = state.utilityVerdicts.find((item) => item.caseId === caseRecord.id && item.floorId === floor.id && item.utilityEvaluationSnapshotId === snapshot.id && item.element === graph.frozenInput.element);
  if (existing) {
    if (existing.inputHash === inputHash) return existing;
    throw new WorkflowConflictError("A different Utility verdict already exists for this element. Start formal rectification before replacing it.");
  }
  const historical = state.utilityVerdicts.filter((item) => item.caseId === caseRecord.id && item.floorId === floor.id && item.element === graph.frozenInput.element);
  if (historical.length && !historical.some((item) => state.dependencyInvalidations.some((invalidation) => invalidation.targetType === "UTILITY_VERDICT" && invalidation.targetId === item.id && ["REPLACEMENT_REQUIRED", "REGENERATED", "READY_FOR_REVIEW"].includes(invalidation.status)))) {
    throw new WorkflowConflictError("A prior Utility verdict exists for this element. Resolve its regeneration record before creating a replacement.");
  }
  const verdict: UtilityGraphVerdictRecord = {
    id: nextId("utility-verdict"), organisationId: caseRecord.organisationId ?? input.actor.organisationId, createdByActorUserId: input.actor.id, updatedByActorUserId: input.actor.id, recordVersion: 0,
    utilityEvaluationSnapshotId: snapshot.id, caseId: caseRecord.id, floorId: floor.id, planVersionId: plan.id, orientationVersionId: orientation.id,
    element: graph.frozenInput.element, directionSet: graph.frozenInput.directionSet, bars: graph.frozenInput.bars,
    lines: { extension: graph.frozenInput.lines.extension, balance: graph.frozenInput.lines.balance, exhaustion: graph.frozenInput.lines.exhaustion },
    ...(graph.verdict ? { verdict: graph.verdict, solutionFraming: graph.solutionFraming } : {}), status: graph.status,
    triggeredDirections: graph.triggeredDirections, matchedConditions: graph.matchedConditions, explanation: graph.explanation,
    sourceRuleIds, sourceRowNumbers, methodologyVersionId: snapshot.provenance.methodologyVersionId!, methodologyContentHash: snapshot.provenance.methodologyContentHash!,
    utilityWorkbookHash: UTILITY_MASTER_WORKBOOK_HASH, utilityWorkbookVersion: UTILITY_MASTER_SOURCE_VERSION,
    inputHash, outputHash: deterministicContentHash({ graphOutputHash: graph.outputHash, inputHash }), idempotencyKey: stableKey, createdAt: nowIso()
  };
  state.utilityVerdicts.unshift(verdict);
  caseRecord.recordVersion = (caseRecord.recordVersion ?? 0) + 1;
  appendTimeline(caseRecord.clientId, "Utility bar-graph verdict framed", `${graph.frozenInput.element} evaluated with frozen UtilityMaster source ${UTILITY_MASTER_SOURCE_VERSION}; status ${graph.status}.`, "Evaluation", input.actor);
  return verdict;
}

export function recordShaktiSnapshot(caseId: string, floorIdValue: unknown, values: number[], actor: AppUser, expectedRecordVersion?: number, idempotencyKey?: unknown) {
  const { state, caseRecord, floor, plan, orientation } = evaluationFloorContext(caseId, floorIdValue, "SHAKTI_EVALUATION");
  assertExpectedRecordVersion(caseRecord, expectedRecordVersion);
  const stableKey = boundedRequiredString(idempotencyKey, "Idempotency key", 160);
  if (!actor.organisationId) throw new WorkflowConflictError("Shakti evaluation is blocked until an organisation-scoped methodology version is active.");
  const methodology = getMethodologyReadiness(state, actor.organisationId, "SHAKTI_ELEMENT");
  // Blocked — Methodology Input Required is the explicit Founder safety state.
  if (!methodology.ready || !methodology.version) throw new WorkflowConflictError(`Shakti evaluation is Blocked — Methodology Input Required. ${methodology.reason}`);

  const inputValues = validateShaktiInputs(values);
  const ranking = rankShakti(inputValues);
  const caseInputs = {
    caseId: caseRecord.id,
    caseStatus: caseRecord.status,
    orientationLocked: caseRecord.orientationLocked,
    floors: [{ id: floor.id, floorLabel: floor.floorLabel, status: floor.status, locked: floor.locked }]
  };
  const output = { elementAverages: ranking.averages, rankedVerdicts: ranking.ranked, tieBreakUsed: ranking.tieBreakUsed };
  const inputHash = deterministicContentHash({ caseInputs, floorId: floor.id, planVersionId: plan.id, orientationVersionId: orientation.id, inputValues, methodologyVersionId: methodology.version.id, methodologyContentHash: methodology.version.contentHash });
  const existingSnapshot = state.shaktiSnapshots.find((item) => item.caseId === caseId && item.floorId === floor.id && item.planVersionId === plan.id && item.orientationVersionId === orientation.id);
  if (existingSnapshot) {
    if (existingSnapshot.provenance?.inputHash === inputHash) return existingSnapshot;
    const replacementRequired = state.dependencyInvalidations.some((item) => item.caseId === caseId && item.floorId === floor.id && item.targetType === "SHAKTI_EVALUATION" && item.targetId === existingSnapshot.id && item.status === "REPLACEMENT_REQUIRED");
    if (!replacementRequired) throw new WorkflowConflictError("A different Shakti evaluation already exists for this case. Start formal rectification before creating another snapshot.");
  }
  const historicalSnapshots = state.shaktiSnapshots.filter((item) => item.caseId === caseId && item.floorId === floor.id);
  if (historicalSnapshots.length && !historicalSnapshots.some((snapshot) => state.dependencyInvalidations.some((item) => item.caseId === caseId && item.floorId === floor.id && item.targetType === "SHAKTI_EVALUATION" && item.targetId === snapshot.id && item.status === "REPLACEMENT_REQUIRED"))) {
    throw new WorkflowConflictError("Require a replacement on the affected Shakti evaluation before generating a new version.");
  }
  const snapshot: ShaktiSnapshotRecord = {
    id: nextId("shakti"),
    caseId,
    floorId: floor.id,
    planVersionId: plan.id,
    orientationVersionId: orientation.id,
    idempotencyKey: stableKey,
    inputValues,
    elementAverages: ranking.averages,
    rankedVerdicts: ranking.ranked,
    tieBreakUsed: ranking.tieBreakUsed,
    provenance: {
      inputHash,
      outputHash: deterministicContentHash(output),
      algorithmVersion: SHAKTI_ALGORITHM_VERSION,
      methodologyVersionId: methodology.version.id,
      methodologyContentHash: methodology.version.contentHash,
      mappingVersion: SHAKTI_MAPPING_VERSION,
      roundingVersion: SHAKTI_ROUNDING_VERSION,
      caseInputs
    }
  };

  state.shaktiSnapshots.unshift(snapshot);
  caseRecord.recordVersion = (caseRecord.recordVersion ?? 0) + 1;
  appendTimeline(caseRecord.clientId, "Shakti snapshot generated", `Computed from ${values.length} input values by ${actor.fullName}.`, "Evaluation", actor);
  return snapshot;
}

export type ReportApprovalExecutionPolicy = { mode: "FOUNDER" | "TEAM"; creatorMayApprove: boolean };
const TEAM_REPORT_APPROVAL_POLICY: ReportApprovalExecutionPolicy = { mode: "TEAM", creatorMayApprove: false };

export function approveReport(reportId: string, actor: AppUser, comment = "Reviewed and approved", policy = TEAM_REPORT_APPROVAL_POLICY, expectedRecordVersion?: number, idempotencyKey?: unknown) {
  const state = getAppState();
  const report = state.reportVersions.find((item) => item.id === reportId);
  if (!report) {
    throw new Error("Report not found.");
  }
  const caseRecord = state.vastuCases.find((item) => item.id === report.caseId);
  if (!caseRecord) {
    throw new Error("Case not found.");
  }
  if (expectedRecordVersion !== undefined && expectedRecordVersion !== (report.recordVersion ?? 0)) {
    throw new WorkflowConflictError("The report changed before approval. Refresh and review the exact report version.");
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
  if (!policy.creatorMayApprove && report.artifact.createdBy.id === actor.id) throw new Error("The report creator cannot approve their own report.");
  const cleanComment = comment.trim();
  if (cleanComment.length < 3) throw new Error("Approval comment must explain the review decision.");

  if (policy.mode === "FOUNDER") {
    const evidence = report.approvalEvidence ?? [];
    const checkpoint = evidence.some((item) => item.checkpoint === "FOUNDER_REVIEWED") ? "FOUNDER_APPROVED" : "FOUNDER_REVIEWED";
    const stableKey = typeof idempotencyKey === "string" && idempotencyKey.trim() ? idempotencyKey.trim() : `founder:${report.id}:${checkpoint}:${actor.id}`;
    if (state.stageAFloorApprovalCheckpoints.some((item) => item.reportId === report.id && item.idempotencyKey === stableKey)) return report;
    if (evidence.some((item) => item.checkpoint === checkpoint)) throw new WorkflowConflictError("This Founder checkpoint is already recorded for the report version.");
    recordStageAFloorCheckpoint(state, report, checkpoint, actor, cleanComment, stableKey);
    report.approvals = Array.from(new Set([...(report.approvals ?? []), actor.id]));
    report.approvalEvidence = [...evidence, { actorId: actor.id, actorName: actor.fullName, actorRole: actor.role, approvedAt: nowIso(), comment: cleanComment, artifactHash: report.artifact.contentHash, checkpoint }];
    const founderApproved = checkpoint === "FOUNDER_APPROVED";
    report.status = founderApproved ? "APPROVED" : "READY_FOR_APPROVAL";
    const floor = report.floorId ? state.floorWorkspaces.find((item) => item.id === report.floorId && item.caseId === report.caseId) : undefined;
    if (floor) {
      floor.reportStatus = report.status;
      floor.recordVersion = (floor.recordVersion ?? 0) + 1;
    }
    const caseFloors = state.floorWorkspaces.filter((item) => item.caseId === report.caseId);
    const allFloorsApproved = floor ? caseFloors.length > 0 && caseFloors.every((item) => item.reportStatus === "APPROVED" || item.reportStatus === "RELEASED") : founderApproved;
    caseRecord.reportStatus = allFloorsApproved ? "APPROVED" : "READY_FOR_APPROVAL";
    caseRecord.status = allFloorsApproved ? "REPORT_APPROVED" : "REPORT_APPROVAL_PENDING";
    report.recordVersion = (report.recordVersion ?? 0) + 1;
    caseRecord.recordVersion = (caseRecord.recordVersion ?? 0) + 1;
    appendTimeline(caseRecord.clientId, founderApproved ? "Founder approval recorded" : "Founder review recorded", `${actor.fullName} recorded ${checkpoint.toLowerCase().replaceAll("_", " ")} for the immutable report version.`, "Reports", actor);
    return report;
  }

  if (report.approvalEvidence?.some((item) => item.actorId === actor.id) || report.approvals.includes(actor.id)) throw new Error("This person has already approved this report version.");

  report.approvals = Array.from(new Set([...(report.approvals ?? []), actor.id]));
  report.approvalEvidence = [...(report.approvalEvidence ?? []), { actorId: actor.id, actorName: actor.fullName, actorRole: actor.role, approvedAt: nowIso(), comment: cleanComment, artifactHash: report.artifact.contentHash }];
  report.status = report.approvals.length >= 2 ? "APPROVED" : "READY_FOR_APPROVAL";
  caseRecord.reportStatus = report.status;
  caseRecord.status = (report.approvals ?? []).length >= 2 ? "REPORT_APPROVED" : "REPORT_APPROVAL_PENDING";
  report.recordVersion = (report.recordVersion ?? 0) + 1;
  caseRecord.recordVersion = (caseRecord.recordVersion ?? 0) + 1;

  appendTimeline(caseRecord.clientId, "Report approved", `${actor.fullName} signed off the report version.`, "Reports", actor);
  return report;
}

export function releaseVerdict(reportId: string, actor: AppUser, policy = TEAM_REPORT_APPROVAL_POLICY, expectedRecordVersion?: number, idempotencyKey?: unknown, pdfReleaseAuthorized = false) {
  const state = getAppState();
  const report = state.reportVersions.find((item) => item.id === reportId);
  if (!report) {
    throw new Error("Report not found.");
  }
  const caseRecord = state.vastuCases.find((item) => item.id === report.caseId);
  if (!caseRecord) {
    throw new Error("Case not found.");
  }
  if ((report.artifact?.templateVersion === "uchit-verdict/v3" || report.artifact?.templateVersion === "uchit-verdict/v4" || report.artifact?.templateVersion === "uchit-verdict/v5") && !pdfReleaseAuthorized) {
    throw new WorkflowConflictError("Founder Edition v3/v4/v5 release must use the protected PDF verification and atomic release workflow.");
  }
  if (expectedRecordVersion !== undefined && expectedRecordVersion !== (report.recordVersion ?? 0)) {
    throw new WorkflowConflictError("The report changed before release. Refresh and review the exact approved version.");
  }
  if (!caseRecord.balanceApproved || !caseRecord.fullPaymentApproved) {
    throw new Error("Verdict release is blocked until the balance is approved.");
  }
  const balancePayment = state.payments.find((item) => item.caseId === caseRecord.id && item.type === "BALANCE" && item.status === "APPROVED");
  if (!balancePayment?.proofAssetId) throw new WorkflowConflictError("Verdict release requires exact scoped balance proof.");
  if (report.status !== "APPROVED") {
    throw new Error("Verdict release requires an approved report.");
  }
  if (policy.mode === "FOUNDER") {
    const evidence = report.approvalEvidence ?? [];
    for (const checkpoint of ["FOUNDER_REVIEWED", "FOUNDER_APPROVED"] as const) {
      const approval = evidence.find((item) => item.checkpoint === checkpoint);
      if (!approval || approval.artifactHash !== report.artifact?.contentHash) throw new Error(`Verdict release requires ${checkpoint.toLowerCase().replaceAll("_", " ")} on this immutable artifact.`);
    }
    const stableKey = typeof idempotencyKey === "string" && idempotencyKey.trim() ? idempotencyKey.trim() : `founder:${report.id}:RELEASED:${actor.id}`;
    if (state.stageAFloorApprovalCheckpoints.some((item) => item.reportId === report.id && item.idempotencyKey === stableKey)) return report;
    if (evidence.some((item) => item.checkpoint === "RELEASED")) throw new WorkflowConflictError("This report version has already been released.");
    const blockers = getStageAFloorReviewBlockers(state, report);
    if (blockers.length) throw new WorkflowConflictError(`Release is blocked. ${blockers.join(" ")}`);
    recordStageAFloorCheckpoint(state, report, "RELEASED", actor, "Released after Founder approval and full payment clearance.", stableKey);
    report.approvalEvidence = [...evidence, { actorId: actor.id, actorName: actor.fullName, actorRole: actor.role, approvedAt: nowIso(), comment: "Released after Founder approval and full payment clearance.", artifactHash: report.artifact!.contentHash, checkpoint: "RELEASED" }];
  } else if ((report.approvals ?? []).length < 2) {
    throw new Error("Verdict release requires two report approvals.");
  }
  if (!report.artifact?.immutable || (report.approvalEvidence?.length ?? 0) < 2) throw new Error("Verdict release requires evidenced approval checkpoints on an immutable artifact.");
  if (policy.mode === "TEAM" && new Set(report.approvalEvidence?.map((item) => item.actorId)).size < 2) throw new Error("Verdict release requires two distinct approvers.");
  if (report.approvalEvidence?.some((item) => (!policy.creatorMayApprove && item.actorId === report.artifact?.createdBy.id) || item.artifactHash !== report.artifact?.contentHash)) throw new Error("Approval evidence does not match the immutable artifact.");

  report.status = "RELEASED";
  const floor = report.floorId ? state.floorWorkspaces.find((item) => item.id === report.floorId && item.caseId === report.caseId) : undefined;
  if (floor) {
    floor.reportStatus = "RELEASED";
    floor.recordVersion = (floor.recordVersion ?? 0) + 1;
  }
  const caseFloors = state.floorWorkspaces.filter((item) => item.caseId === report.caseId);
  const allFloorsReleased = floor ? caseFloors.length > 0 && caseFloors.every((item) => item.reportStatus === "RELEASED") : true;
  caseRecord.status = allFloorsReleased ? "VERDICT_RELEASED" : "REPORT_APPROVAL_PENDING";
  caseRecord.reportStatus = allFloorsReleased ? "RELEASED" : "READY_FOR_APPROVAL";
  report.recordVersion = (report.recordVersion ?? 0) + 1;
  caseRecord.recordVersion = (caseRecord.recordVersion ?? 0) + 1;
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
