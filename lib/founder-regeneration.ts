import type {
  AppUser,
  DependencyInvalidationRecord,
  MethodologyModule,
  RegenerationResolutionRecord,
  ReportVersionRecord,
  StageAFloorApprovalCheckpointRecord,
  StageAFloorReviewSnapshotRecord
} from "./domain.ts";
import { deterministicContentHash } from "./evaluation-provenance.ts";
import { getApprovedEntranceZoneCatalog } from "./entrance-zone-catalog.ts";
import { getMethodologyReadiness } from "./methodology-readiness.ts";
import { getActiveCaseForClient } from "./service-framework.ts";
import { resolveEvaluationArchitecture } from "./evaluation-architecture.ts";
import { resolveV1FloorWorkflowReadiness } from "./founder-v1-readiness.ts";
import { buildStageBRenderManifest } from "./stage-b-remediation.ts";
import type { AppState } from "./store.ts";
import { getAppState } from "./store.ts";

export const openRegenerationStatuses = ["NEEDS_REGENERATION", "REPLACEMENT_REQUIRED", "REGENERATED"] as const;
export const dependencyLifecycle = ["VALID", "NEEDS_REGENERATION", "REPLACEMENT_REQUIRED", "REGENERATED", "READY_FOR_REVIEW"] as const;
export type FounderFloorQueueCategory = "NEEDS_REGENERATION" | "REVIEW_REQUIRED" | "BLOCKED_METHOD_INPUT" | "MISSING_EVIDENCE" | "PENDING_FOUNDER_VERIFICATION" | "READY_FOR_APPROVAL" | "RELEASED";

export class FounderRegenerationError extends Error {
  readonly statusCode: 400 | 403 | 404 | 409 | 428 | 503;
  constructor(message: string, statusCode: 400 | 403 | 404 | 409 | 428 | 503 = 400) {
    super(message); this.name = "FounderRegenerationError"; this.statusCode = statusCode;
  }
}

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
function text(value: unknown, label: string, max = 500) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max || /[\u0000-\u001f\u007f<>]/.test(value)) {
    throw new FounderRegenerationError(`${label} is required and must be safe text up to ${max} characters.`);
  }
  return value.trim();
}
function founderActor(actor: AppUser) {
  if (actor.role !== "SUPER_ADMIN" || (actor.organisationId && actor.organisationCapability !== "organisation_owner")) {
    throw new FounderRegenerationError("Only the active organisation owner can perform Founder verification.", 403);
  }
}
function ownedContext(state: AppState, caseIdValue: unknown, floorIdValue: unknown, actor?: AppUser) {
  const caseId = text(caseIdValue, "Case ID", 160); const floorId = text(floorIdValue, "Floor ID", 160);
  const caseRecord = state.vastuCases.find((item) => item.id === caseId);
  if (!caseRecord) throw new FounderRegenerationError("Case not found.", 404);
  if (getActiveCaseForClient(state, caseRecord.clientId)?.id !== caseRecord.id) throw new FounderRegenerationError("Use the active case revision for regeneration and review.", 409);
  if (actor?.organisationId && caseRecord.organisationId && actor.organisationId !== caseRecord.organisationId) throw new FounderRegenerationError("Floor not found.", 404);
  const project = caseRecord.projectId ? state.projects.find((item) => item.id === caseRecord.projectId && item.activeCaseId === caseRecord.id) : undefined;
  const floor = project ? state.floorWorkspaces.find((item) => item.id === floorId && item.caseId === caseRecord.id && item.projectId === project.id) : undefined;
  if (!project || !floor) throw new FounderRegenerationError("Floor not found in the active project and case revision.", 404);
  return { caseRecord, project, floor };
}

type InvalidationCause = {
  projectId: string; caseId: string; floorId?: string; causeType: NonNullable<DependencyInvalidationRecord["causeType"]>;
  sourceVersionId: string; reason: string; actor?: AppUser;
  targetTypes?: DependencyInvalidationRecord["targetType"][];
};

/** Appends immutable causes. Existing historical targets remain untouched. */
export function appendFloorInvalidations(input: InvalidationCause) {
  const state = getAppState();
  const include = (type: DependencyInvalidationRecord["targetType"]) => !input.targetTypes || input.targetTypes.includes(type);
  const targets: Array<{ targetType: DependencyInvalidationRecord["targetType"]; targetId: string; floorId: string }> = [];
  if (include("OPENING_MAPPING")) targets.push(...state.openingMappings.filter((item) => item.projectId === input.projectId && item.caseId === input.caseId && (!input.floorId || item.floorId === input.floorId)).map((item) => ({ targetType: "OPENING_MAPPING" as const, targetId: item.id, floorId: item.floorId })));
  if (include("SPACE_MAPPING")) targets.push(...state.spaceMappings.filter((item) => item.projectId === input.projectId && item.caseId === input.caseId && (!input.floorId || item.floorId === input.floorId)).map((item) => ({ targetType: "SPACE_MAPPING" as const, targetId: item.id, floorId: item.floorId })));
  if (include("UTILITY_EVALUATION")) targets.push(...state.evaluationSnapshots.filter((item) => item.caseId === input.caseId && item.floorId && (!input.floorId || item.floorId === input.floorId)).map((item) => ({ targetType: "UTILITY_EVALUATION" as const, targetId: item.id, floorId: item.floorId! })));
  if (include("UTILITY_VERDICT")) targets.push(...(state.utilityVerdicts ?? []).filter((item) => item.caseId === input.caseId && (!input.floorId || item.floorId === input.floorId)).map((item) => ({ targetType: "UTILITY_VERDICT" as const, targetId: item.id, floorId: item.floorId })));
  if (include("SHAKTI_EVALUATION")) targets.push(...state.shaktiSnapshots.filter((item) => item.caseId === input.caseId && item.floorId && (!input.floorId || item.floorId === input.floorId)).map((item) => ({ targetType: "SHAKTI_EVALUATION" as const, targetId: item.id, floorId: item.floorId! })));
  if (include("FINDING")) targets.push(...state.assessmentObservations.filter((item) => item.caseId === input.caseId && item.floorId && (!input.floorId || item.floorId === input.floorId)).map((item) => ({ targetType: "FINDING" as const, targetId: item.id, floorId: item.floorId! })));
  if (include("DRAFT_REPORT")) targets.push(...state.reportVersions.filter((item) => item.caseId === input.caseId && item.floorId && (!input.floorId || item.floorId === input.floorId) && item.status !== "RELEASED").map((item) => ({ targetType: "DRAFT_REPORT" as const, targetId: item.id, floorId: item.floorId! })));
  const created: DependencyInvalidationRecord[] = [];
  for (const target of targets) {
    if (state.dependencyInvalidations.some((item) => item.targetType === target.targetType && item.targetId === target.targetId && item.sourceVersionId === input.sourceVersionId)) continue;
    const record: DependencyInvalidationRecord = {
      id: id("invalidation"), organisationId: input.actor?.organisationId, createdByActorUserId: input.actor?.id,
      projectId: input.projectId, caseId: input.caseId, floorId: target.floorId, targetType: target.targetType, targetId: target.targetId,
      causeType: input.causeType, sourceVersionId: input.sourceVersionId,
      ...(input.causeType === "ORIENTATION" ? { causedByOrientationVersionId: input.sourceVersionId } : {}),
      dependencyLinks: [input.sourceVersionId, target.targetId], status: "NEEDS_REGENERATION", reason: input.reason,
      createdAt: now(), recordVersion: 0
    };
    state.dependencyInvalidations.unshift(record); created.push(record);
  }
  if (input.causeType !== "SITE_ANALYSIS") {
    const reason = input.reason;
    for (const analysis of state.siteAnalyses.filter((item) => item.caseId === input.caseId && (!input.floorId || item.floorId === input.floorId))) {
      if (analysis.status === "FOUNDER_APPROVED" && input.causeType === "EVALUATION") analysis.needsRegeneration = true;
      else if (analysis.status !== "FOUNDER_APPROVED") analysis.needsRegeneration = true;
      analysis.regenerationReason = reason;
    }
    for (const findings of state.postSiteFindings.filter((item) => item.caseId === input.caseId && (!input.floorId || item.floorId === input.floorId))) {
      findings.needsRegeneration = true;
      findings.regenerationReason = reason;
    }
  }
  return created;
}

/** Explicit Founder request to create a successor evaluation without mutating the current snapshot. */
export function requestEvaluationReplacement(input: {
  caseId: unknown; floorId: unknown; targetType: unknown; snapshotId: unknown; reason: unknown;
  idempotencyKey: unknown; expectedRecordVersion: unknown; actor: AppUser;
}) {
  founderActor(input.actor);
  const state = getAppState();
  const { caseRecord, project, floor } = ownedContext(state, input.caseId, input.floorId, input.actor);
  if (!Number.isInteger(input.expectedRecordVersion) || Number(input.expectedRecordVersion) < 0) throw new FounderRegenerationError("The latest Case record version is required.", 428);
  if ((caseRecord.recordVersion ?? 0) !== input.expectedRecordVersion) throw new FounderRegenerationError("The Case changed. Reload the exact evaluation lineage before requesting a successor.", 409);
  const targetType = text(input.targetType, "Evaluation type", 40);
  if (targetType !== "UTILITY_EVALUATION" && targetType !== "SHAKTI_EVALUATION") throw new FounderRegenerationError("Choose Utility or Shakti evaluation for replacement.");
  const snapshotId = text(input.snapshotId, "Snapshot ID", 200);
  const reason = text(input.reason, "Replacement reason", 500);
  if (reason.length < 20) throw new FounderRegenerationError("Replacement reason must be at least 20 characters.");
  const stableKey = text(input.idempotencyKey, "Idempotency key", 160);
  const requestHash = deterministicContentHash({ caseId: caseRecord.id, floorId: floor.id, targetType, snapshotId, reason });
  const replay = state.dependencyInvalidations.filter((item) => item.requestIdempotencyKey === stableKey);
  if (replay.length) {
    if (replay.some((item) => item.requestHash !== requestHash)) throw new FounderRegenerationError("This idempotency key was already used with a different replacement request.", 409);
    return { invalidations: replay, replayed: true };
  }
  const currentPlan = state.planVersions.find((item) => item.caseId === caseRecord.id && item.floorId === floor.id && item.status === "CURRENT");
  const currentOrientation = state.orientationVersions.find((item) => item.caseId === caseRecord.id && item.status === "LOCKED");
  const snapshots = targetType === "UTILITY_EVALUATION" ? state.evaluationSnapshots : state.shaktiSnapshots;
  const currentSnapshot = snapshots.find((item) => item.caseId === caseRecord.id && item.floorId === floor.id && item.planVersionId === currentPlan?.id && item.orientationVersionId === currentOrientation?.id);
  if (!currentPlan || !currentOrientation || !currentSnapshot || currentSnapshot.id !== snapshotId) throw new FounderRegenerationError("The successor request must bind the exact current evaluation snapshot, plan and locked orientation.", 409);
  if (state.dependencyInvalidations.some((item) => item.targetType === targetType && item.targetId === snapshotId && openRegenerationStatuses.includes(item.status as typeof openRegenerationStatuses[number]))) throw new FounderRegenerationError("A successor workflow is already open for this evaluation.", 409);
  const targets: Array<{ targetType: DependencyInvalidationRecord["targetType"]; targetId: string }> = [{ targetType, targetId: snapshotId }];
  if (targetType === "UTILITY_EVALUATION") targets.push(...(state.utilityVerdicts ?? []).filter((item) => item.caseId === caseRecord.id && item.floorId === floor.id).map((item) => ({ targetType: "UTILITY_VERDICT" as const, targetId: item.id })));
  targets.push(...state.assessmentObservations.filter((item) => item.caseId === caseRecord.id && item.floorId === floor.id).map((item) => ({ targetType: "FINDING" as const, targetId: item.id })));
  targets.push(...state.reportVersions.filter((item) => item.caseId === caseRecord.id && item.floorId === floor.id && item.status !== "RELEASED").map((item) => ({ targetType: "DRAFT_REPORT" as const, targetId: item.id })));
  const occurredAt = now();
  const invalidations = targets.map((target): DependencyInvalidationRecord => ({
    id: id("invalidation"), organisationId: caseRecord.organisationId ?? input.actor.organisationId,
    createdByActorUserId: input.actor.id, updatedByActorUserId: input.actor.id, recordVersion: 0,
    projectId: project.id, caseId: caseRecord.id, floorId: floor.id, targetType: target.targetType, targetId: target.targetId,
    causeType: "EVALUATION", sourceVersionId: snapshotId, dependencyLinks: [snapshotId, target.targetId],
    status: "REPLACEMENT_REQUIRED", reason, createdAt: occurredAt, updatedAt: occurredAt,
    requestIdempotencyKey: stableKey, requestHash
  }));
  state.dependencyInvalidations.unshift(...invalidations);
  caseRecord.recordVersion = (caseRecord.recordVersion ?? 0) + 1;
  state.timelineEvents.unshift({ id: id("event"), organisationId: caseRecord.organisationId ?? input.actor.organisationId, createdByActorUserId: input.actor.id, recordVersion: 1,
    clientId: caseRecord.clientId, category: "Evaluation", headline: `${targetType === "UTILITY_EVALUATION" ? "Utility" : "Shakti"} successor requested`,
    details: `A successor evaluation was requested for ${floor.floorLabel}; the prior immutable snapshot remains in history.`, happenedAt: occurredAt,
    actorRole: input.actor.role, actorId: input.actor.id, actorName: input.actor.fullName });
  return { invalidations, replayed: false };
}

function replacementFor(state: AppState, invalidation: DependencyInvalidationRecord, replacementIdValue: unknown) {
  const replacementId = text(replacementIdValue, "Replacement version ID", 200);
  if (replacementId === invalidation.targetId) throw new FounderRegenerationError("A blocker requires a new valid replacement version; the invalidated version cannot clear itself.", 409);
  const currentPlan = state.planVersions.find((item) => item.projectId === invalidation.projectId && item.caseId === invalidation.caseId && item.floorId === invalidation.floorId && item.status === "CURRENT");
  const currentOrientation = state.orientationVersions.find((item) => item.projectId === invalidation.projectId && item.caseId === invalidation.caseId && item.status === "LOCKED");
  if (!currentPlan || !currentOrientation) throw new FounderRegenerationError("A current plan and locked orientation are required before a replacement can be accepted.", 409);
  if (invalidation.targetType === "OPENING_MAPPING") {
    const value = state.openingMappings.find((item) => item.id === replacementId && item.projectId === invalidation.projectId && item.caseId === invalidation.caseId && item.floorId === invalidation.floorId && item.planVersionId === currentPlan.id && item.orientationVersionId === currentOrientation.id && item.verified);
    if (!value) throw new FounderRegenerationError("Replacement opening mapping must belong to the exact floor, current plan, and locked orientation.", 404); return value;
  }
  if (invalidation.targetType === "SPACE_MAPPING") {
    const value = state.spaceMappings.find((item) => item.id === replacementId && item.projectId === invalidation.projectId && item.caseId === invalidation.caseId && item.floorId === invalidation.floorId && item.planVersionId === currentPlan.id && item.orientationVersionId === currentOrientation.id && item.verified);
    if (!value) throw new FounderRegenerationError("Replacement space mapping must belong to the exact floor, current plan, and locked orientation.", 404); return value;
  }
  if (invalidation.targetType === "UTILITY_EVALUATION") {
    const value = state.evaluationSnapshots.find((item) => item.id === replacementId && item.caseId === invalidation.caseId && item.floorId === invalidation.floorId && item.planVersionId === currentPlan.id && item.orientationVersionId === currentOrientation.id && item.provenance?.methodologyVersionId);
    if (!value) throw new FounderRegenerationError("Replacement Utility evaluation must be methodology-pinned to the exact current floor lineage.", 404); return value;
  }
  if (invalidation.targetType === "UTILITY_VERDICT") {
    const value = (state.utilityVerdicts ?? []).find((item) => item.id === replacementId && item.caseId === invalidation.caseId && item.floorId === invalidation.floorId && item.planVersionId === currentPlan.id && item.orientationVersionId === currentOrientation.id && item.status === "APPROVED");
    if (!value) throw new FounderRegenerationError("Replacement Utility verdict must be approved and bound to the exact current Utility evaluation lineage.", 404); return value;
  }
  if (invalidation.targetType === "SHAKTI_EVALUATION") {
    const value = state.shaktiSnapshots.find((item) => item.id === replacementId && item.caseId === invalidation.caseId && item.floorId === invalidation.floorId && item.planVersionId === currentPlan.id && item.orientationVersionId === currentOrientation.id && item.provenance?.methodologyVersionId);
    if (!value) throw new FounderRegenerationError("Replacement Shakti evaluation must be methodology-pinned to the exact current floor lineage.", 404); return value;
  }
  if (invalidation.targetType === "FINDING") {
    const value = state.assessmentObservations.find((item) => item.id === replacementId && item.caseId === invalidation.caseId && item.floorId === invalidation.floorId);
    if (!value) throw new FounderRegenerationError("Replacement finding must belong to the exact active case and floor.", 404); return value;
  }
  const value = state.reportVersions.find((item) => item.id === replacementId && item.caseId === invalidation.caseId && item.floorId === invalidation.floorId && (item.artifact?.templateVersion === "uchit-verdict/v3" || item.artifact?.templateVersion === "uchit-verdict/v4" || item.artifact?.templateVersion === "uchit-verdict/v5") && item.artifact.immutable);
  if (!value) throw new FounderRegenerationError("Replacement report must be an immutable one-floor v3/v4/v5 report for the exact active case and floor.", 404);
  return value;
}

export function transitionFloorRegeneration(input: { invalidationId: unknown; toStatus: unknown; replacementVersionId?: unknown; reason: unknown; idempotencyKey: unknown; expectedRecordVersion: unknown; actor: AppUser }) {
  founderActor(input.actor); const state = getAppState(); const invalidationId = text(input.invalidationId, "Invalidation ID", 200);
  const stableKey = text(input.idempotencyKey, "Idempotency key", 160);
  const retry = state.regenerationResolutions.find((item) => item.invalidationId === invalidationId && item.idempotencyKey === stableKey);
  if (retry) return { invalidation: state.dependencyInvalidations.find((item) => item.id === invalidationId)!, resolution: retry };
  const invalidation = state.dependencyInvalidations.find((item) => item.id === invalidationId);
  if (!invalidation || !invalidation.floorId) throw new FounderRegenerationError("Floor regeneration record not found.", 404);
  const { caseRecord } = ownedContext(state, invalidation.caseId, invalidation.floorId, input.actor);
  if (!Number.isInteger(input.expectedRecordVersion) || Number(input.expectedRecordVersion) < 0) throw new FounderRegenerationError("The latest regeneration record version is required.", 428);
  if ((invalidation.recordVersion ?? 0) !== input.expectedRecordVersion) throw new FounderRegenerationError("The regeneration record changed. Refresh before continuing.", 409);
  const toStatus = text(input.toStatus, "Regeneration status", 40) as DependencyInvalidationRecord["status"];
  const allowed: Record<DependencyInvalidationRecord["status"], DependencyInvalidationRecord["status"] | undefined> = {
    NEEDS_REGENERATION: "REPLACEMENT_REQUIRED", REPLACEMENT_REQUIRED: "REGENERATED", REGENERATED: "READY_FOR_REVIEW", READY_FOR_REVIEW: undefined
  };
  if (allowed[invalidation.status] !== toStatus) throw new FounderRegenerationError(`Regeneration must move from ${invalidation.status} to ${allowed[invalidation.status] ?? "no further state"}.`, 409);
  const reason = text(input.reason, "Regeneration reason", 500); if (reason.length < 20) throw new FounderRegenerationError("Regeneration reason must be at least 20 characters.");
  let replacementVersionId = invalidation.replacementVersionId;
  if (toStatus === "REGENERATED") { replacementFor(state, invalidation, input.replacementVersionId); replacementVersionId = text(input.replacementVersionId, "Replacement version ID", 200); }
  if (toStatus === "READY_FOR_REVIEW") {
    if (!replacementVersionId) throw new FounderRegenerationError("Record a valid replacement before review readiness.", 409);
    replacementFor(state, invalidation, replacementVersionId);
  }
  const occurredAt = now(); const fromStatus = invalidation.status;
  const resolution: RegenerationResolutionRecord = {
    id: id("regeneration-resolution"), organisationId: caseRecord.organisationId ?? input.actor.organisationId,
    createdByActorUserId: input.actor.id, updatedByActorUserId: input.actor.id, recordVersion: 1,
    invalidationId: invalidation.id, projectId: invalidation.projectId, caseId: invalidation.caseId, floorId: invalidation.floorId,
    fromStatus, toStatus, sourceVersionId: invalidation.sourceVersionId ?? invalidation.causedByOrientationVersionId ?? invalidation.targetId,
    replacementVersionId, dependencyLinks: [...new Set([...(invalidation.dependencyLinks ?? []), ...(replacementVersionId ? [replacementVersionId] : [])])],
    actorUserId: input.actor.id, actorDisplayName: input.actor.fullName, actorRole: input.actor.role,
    reason, idempotencyKey: stableKey, occurredAt
  };
  state.regenerationResolutions.unshift(resolution);
  invalidation.status = toStatus; invalidation.replacementVersionId = replacementVersionId; invalidation.dependencyLinks = [...resolution.dependencyLinks];
  invalidation.updatedAt = occurredAt; invalidation.updatedByActorUserId = input.actor.id; invalidation.resolutionIdempotencyKey = stableKey;
  invalidation.recordVersion = (invalidation.recordVersion ?? 0) + 1; caseRecord.recordVersion = (caseRecord.recordVersion ?? 0) + 1;
  return { invalidation, resolution };
}

function getV1StageAFloorReviewBlockers(state: AppState, report: ReportVersionRecord) {
  const blockers: string[] = [];
  const caseRecord = state.vastuCases.find((item) => item.id === report.caseId);
  const floor = report.floorId ? state.floorWorkspaces.find((item) => item.id === report.floorId && item.caseId === report.caseId && item.projectId === caseRecord?.projectId) : undefined;
  const project = caseRecord?.projectId ? state.projects.find((item) => item.id === caseRecord.projectId && item.activeCaseId === caseRecord.id) : undefined;
  if (!caseRecord || !floor || !project) return ["The report is not bound to one valid active V1 project floor."];
  if (getActiveCaseForClient(state, caseRecord.clientId)?.id !== caseRecord.id) blockers.push("Founder review is allowed only on the active case revision.");
  if (!state.casePropertyContexts.some((item) => item.caseId === caseRecord.id && item.projectId === project.id)) blockers.push("V1 Founder review requires the exact Case Property Context.");
  const readiness = resolveV1FloorWorkflowReadiness(state, caseRecord.id, floor.id);
  if (!readiness.directionalEvaluationComplete || !readiness.directionalStageAPresented) blockers.push("V1 Founder review requires finalized Directional Input/Evaluation/Report Card and a presented native Directional Stage A.");
  const directionalInput = state.directionalInputVersions.find((item) => item.caseId === caseRecord.id && item.floorId === floor.id && item.status === "FINALIZED");
  const directionalEvaluation = state.directionalEvaluationSnapshots.find((item) => item.caseId === caseRecord.id && item.floorId === floor.id && item.status === "COMPLETE");
  const reportCard = state.directionalReportCardSnapshots.find((item) => item.caseId === caseRecord.id && item.floorId === floor.id && item.status === "FINALIZED");
  const presentation = state.directionalStageAPresentations.find((item) => item.caseId === caseRecord.id && item.floorId === floor.id && item.status === "PRESENTED");
  const remediation = state.stageBRemediations.find((item) => item.caseId === caseRecord.id && item.floorId === floor.id && item.architectureVersion === "V1" && item.state === "PAGE_FINALISED");
  if (!directionalInput || !directionalEvaluation || !reportCard || !presentation) blockers.push("Finalized native Directional Stage A authorities are required for V1 Founder review.");
  if (!remediation) blockers.push("A finalized native V1 Stage-B remediation is required for the final report.");
  const artifact = report.artifact;
  if (!(artifact?.templateVersion === "uchit-verdict/v5") || artifact.floorId !== floor.id) blockers.push("V1 Founder review requires an exact immutable v5 floor report artifact.");
  if (!artifact?.stageBRenderManifest || artifact.stageBRenderManifest.integrityStatus !== "PASS" || artifact.remediationReportIntegrity?.status !== "PASS") blockers.push("V1 Founder review requires Stage-B and report-wide integrity PASS.");
  if (artifact?.sectionARenderManifest && artifact.sectionARenderManifest.integrityStatus !== "PASS") blockers.push("V1 Founder review requires Section A integrity PASS.");
  if (artifact?.sectionCRenderManifest && artifact.sectionCRenderManifest.integrityStatus !== "PASS") blockers.push("V1 Founder review requires Section C integrity PASS.");
  if (remediation && artifact?.stageBRenderManifest) {
    try {
      const canonicalManifest = buildStageBRenderManifest(state, remediation.id);
      if (artifact.stageBRenderManifest.reportSourceId !== canonicalManifest.reportSourceId || artifact.stageBRenderManifest.reportSourceHash !== canonicalManifest.reportSourceHash
        || artifact.stageBRenderManifest.integrityRunId !== canonicalManifest.integrityRunId || artifact.stageBRenderManifest.integrityScopeHash !== canonicalManifest.integrityScopeHash) blockers.push("V1 Founder review requires canonical Stage-B report-source provenance.");
    } catch { blockers.push("V1 Founder review requires a canonical Stage-B render manifest."); }
  }
  return [...new Set(blockers)];
}

export function getStageAFloorReviewBlockers(state: AppState, report: ReportVersionRecord) {
  const architecture = resolveEvaluationArchitecture({ state, caseId: report.caseId, floorId: report.floorId });
  if (architecture.caseVersion === "V1" || architecture.floorVersion === "V1") {
    if (architecture.caseVersion !== "V1" || architecture.floorVersion !== "V1") return ["V1 Founder review requires an exact V1 case and floor."];
    return getV1StageAFloorReviewBlockers(state, report);
  }
  const blockers: string[] = []; const caseRecord = state.vastuCases.find((item) => item.id === report.caseId);
  const floor = report.floorId ? state.floorWorkspaces.find((item) => item.id === report.floorId && item.caseId === report.caseId && item.projectId === caseRecord?.projectId) : undefined;
  if (!caseRecord || !floor || !caseRecord.projectId) return ["The report is not bound to one valid active project floor."];
  if (getActiveCaseForClient(state, caseRecord.clientId)?.id !== caseRecord.id) blockers.push("Founder review is allowed only on the active case revision.");
  if (!(report.artifact?.templateVersion === "uchit-verdict/v3" || report.artifact?.templateVersion === "uchit-verdict/v4" || report.artifact?.templateVersion === "uchit-verdict/v5") || report.artifact.floorId !== floor.id) blockers.push("Founder review requires an exact one-floor v3/v4/v5 report artifact.");
  const plan = state.planVersions.find((item) => item.id === report.artifact?.planVersionId && item.projectId === caseRecord.projectId && item.caseId === caseRecord.id && item.floorId === floor.id && item.status === "CURRENT");
  if (!plan) blockers.push("The report must bind the current plan version for this floor.");
  const evidence = state.spatialEvidenceVersions.find((item) => item.id === report.artifact?.handMarkedEvidenceVersionId && item.projectId === caseRecord.projectId && item.caseId === caseRecord.id && item.floorId === floor.id && item.planVersionId === plan?.id && item.kind === "HAND_MARKED_PLAN" && item.status === "CURRENT" && item.fullColour);
  if (!evidence) blockers.push("Current full-colour hand-marked evidence must be bound to this floor report.");
  const manualUtilitySheet = (state.caseDocuments ?? []).find((item) => item.id === report.artifact?.manualUtilitySheetDocumentId
    && item.caseId === caseRecord.id && item.floorLabel === floor.floorLabel && item.assetType === "MANUAL_UTILITY_SHEET"
    && item.isCurrent && item.revisionStatus === "VERIFIED" && item.verified && !item.blocker && !item.discrepancy && item.founderApprovalStatus === "APPROVED");
  if (!manualUtilitySheet) blockers.push("Founder-approved original manual utility sheet is required for this floor.");
  const marked32DEvidence = state.spatialEvidenceVersions.find((item) => item.projectId === caseRecord.projectId && item.caseId === caseRecord.id && item.floorId === floor.id
    && item.planVersionId === plan?.id && item.kind === "HAND_MARKED_PLAN" && item.classification === "MARKED_32D_CHAKRA_V1" && item.has32SectorChakra === true && item.status === "CURRENT" && item.fullColour);
  if (!marked32DEvidence) blockers.push("Founder-confirmed 32-sector chakra evidence is required for this floor.");
  const marked16DEvidence = state.spatialEvidenceVersions.find((item) => item.projectId === caseRecord.projectId && item.caseId === caseRecord.id && item.floorId === floor.id
    && item.planVersionId === plan?.id && item.kind === "HAND_MARKED_PLAN" && item.classification === "MARKED_16D_MAPPING_V1" && item.has16DirectionMapping === true && item.status === "CURRENT" && item.fullColour);
  if (!marked16DEvidence) blockers.push("Founder-confirmed 16-direction marked mapping is required for this floor.");
  const orientation = state.orientationVersions.find((item) => item.id === report.artifact?.orientationVersionId && item.projectId === caseRecord.projectId && item.caseId === caseRecord.id && item.status === "LOCKED");
  if (!orientation) blockers.push("The report must bind the current locked orientation version.");
  const propertyMainGate = (state.entranceZoneVersions ?? []).find((item) => item.projectId === caseRecord.projectId && item.caseId === caseRecord.id && item.scope === "PROPERTY_MAIN_GATE" && item.status === "CURRENT");
  const floorGate = (state.entranceZoneVersions ?? []).find((item) => item.projectId === caseRecord.projectId && item.caseId === caseRecord.id && item.floorId === floor.id && item.scope === "FLOOR_PRIMARY_ENTRANCE" && item.status === "CURRENT");
  const openings = state.openingMappings.filter((item) => item.projectId === caseRecord.projectId && item.caseId === caseRecord.id && item.floorId === floor.id && item.planVersionId === plan?.id && item.orientationVersionId === orientation?.id);
  const spaces = state.spaceMappings.filter((item) => item.projectId === caseRecord.projectId && item.caseId === caseRecord.id && item.floorId === floor.id && item.planVersionId === plan?.id && item.orientationVersionId === orientation?.id);
  if (!propertyMainGate && !floorGate) blockers.push("At least one current property or floor entrance zone is required.");
  if (!spaces.length || spaces.some((item) => !item.verified)) blockers.push("Verified 16-direction property mappings are required for this floor.");
  const mappings = [...openings, ...spaces];
  if (mappings.some((item) => item.methodologyStatus === "REVIEW_REQUIRED")) blockers.push("A spatial mapping is Review Required.");
  if (mappings.some((item) => item.methodologyStatus === "BLOCKED_METHOD_INPUT")) blockers.push("A spatial mapping is Blocked — Methodology Input Required.");
  if (mappings.some((item) => item.methodologyStatus === "NEEDS_REGENERATION")) blockers.push("A spatial mapping Needs Regeneration.");
  if (mappings.some((item) => item.methodologyStatus !== "APPROVED" || !item.methodologyVersionId)) blockers.push("Every spatial mapping must be Approved and methodology-version pinned.");
  const evaluation = state.evaluationSnapshots.find((item) => item.id === report.artifact?.evaluationSnapshotId && item.caseId === caseRecord.id && item.floorId === floor.id && item.planVersionId === plan?.id && item.orientationVersionId === orientation?.id && item.provenance?.methodologyVersionId);
  const shakti = state.shaktiSnapshots.find((item) => item.id === report.artifact?.shaktiSnapshotId && item.caseId === caseRecord.id && item.floorId === floor.id && item.planVersionId === plan?.id && item.orientationVersionId === orientation?.id && item.provenance?.methodologyVersionId);
  if (!evaluation) blockers.push("A valid methodology-pinned Utility evaluation is required.");
  if (!shakti) blockers.push("A valid methodology-pinned Shakti Element evaluation is required.");
  if (!state.assessmentObservations.some((item) => item.caseId === caseRecord.id && item.floorId === floor.id)) blockers.push("At least one verified floor finding is required.");
  if (!state.recommendations.some((item) => item.caseId === caseRecord.id && item.floorId === floor.id)) blockers.push("At least one floor recommendation is required for report composition.");
  if (state.dependencyInvalidations.some((item) => item.caseId === caseRecord.id && item.floorId === floor.id && openRegenerationStatuses.includes(item.status as typeof openRegenerationStatuses[number]))) blockers.push("Open regeneration blockers must reach Ready for Review.");
  if (caseRecord.organisationId) {
    for (const module of ["DIRECTION_32", "DIRECTION_16", "SITE_ENVIRONMENT", "UTILITY", "SHAKTI_ELEMENT"] as MethodologyModule[]) {
      if (module === "DIRECTION_32") {
        const catalog = getApprovedEntranceZoneCatalog(state, caseRecord.organisationId);
        if (!catalog.ready) blockers.push(`DIRECTION 32 is ${catalog.status.replaceAll("_", " ")}: ${catalog.reason}`);
        continue;
      }
      const readiness = getMethodologyReadiness(state, caseRecord.organisationId, module);
      if (!readiness.ready) blockers.push(`${module.replaceAll("_", " ")} is ${readiness.status.replaceAll("_", " ")}: ${readiness.reason}`);
    }
  } else blockers.push("Organisation-scoped methodology is required.");
  return [...new Set(blockers)];
}

function marked32DEvidenceId(state: AppState, caseId: string, floorId: string, planVersionId: string) {
  return state.spatialEvidenceVersions.find((item) => item.caseId === caseId && item.floorId === floorId && item.planVersionId === planVersionId
    && item.kind === "HAND_MARKED_PLAN" && item.classification === "MARKED_32D_CHAKRA_V1" && item.has32SectorChakra === true && item.status === "CURRENT" && item.fullColour)?.id;
}

function marked16DEvidenceId(state: AppState, caseId: string, floorId: string, planVersionId: string) {
  return state.spatialEvidenceVersions.find((item) => item.caseId === caseId && item.floorId === floorId && item.planVersionId === planVersionId
    && item.kind === "HAND_MARKED_PLAN" && item.classification === "MARKED_16D_MAPPING_V1" && item.has16DirectionMapping === true && item.status === "CURRENT" && item.fullColour)?.id;
}

function reviewBinding(state: AppState, report: ReportVersionRecord) {
  const architecture = resolveEvaluationArchitecture({ state, caseId: report.caseId, floorId: report.floorId });
  if (architecture.caseVersion === "V1" || architecture.floorVersion === "V1") {
    if (architecture.caseVersion !== "V1" || architecture.floorVersion !== "V1") throw new FounderRegenerationError("V1 Founder review requires an exact V1 case and floor.", 409);
    const caseRecord = state.vastuCases.find((item) => item.id === report.caseId);
    const floor = state.floorWorkspaces.find((item) => item.id === report.floorId && item.caseId === report.caseId && item.projectId === caseRecord?.projectId);
    const project = caseRecord?.projectId ? state.projects.find((item) => item.id === caseRecord.projectId && item.activeCaseId === caseRecord.id) : undefined;
    if (!caseRecord || !floor || !project || !state.casePropertyContexts.some((item) => item.caseId === caseRecord.id && item.projectId === project.id)) throw new FounderRegenerationError("V1 Founder review requires the exact case, active project, floor, and Case Property Context.", 409);
    const readiness = resolveV1FloorWorkflowReadiness(state, caseRecord.id, floor.id);
    if (!readiness.directionalEvaluationComplete || !readiness.directionalStageAPresented) throw new FounderRegenerationError("V1 Founder review requires finalized Directional Input/Evaluation/Report Card and a presented native Directional Stage A.", 409);
    const directionalInput = state.directionalInputVersions.find((item) => item.caseId === caseRecord.id && item.floorId === floor.id && item.status === "FINALIZED");
    const directionalEvaluation = state.directionalEvaluationSnapshots.find((item) => item.caseId === caseRecord.id && item.floorId === floor.id && item.status === "COMPLETE");
    const reportCard = state.directionalReportCardSnapshots.find((item) => item.caseId === caseRecord.id && item.floorId === floor.id && item.status === "FINALIZED");
    const presentation = state.directionalStageAPresentations.find((item) => item.caseId === caseRecord.id && item.floorId === floor.id && item.status === "PRESENTED");
    const remediation = state.stageBRemediations.find((item) => item.caseId === caseRecord.id && item.floorId === floor.id && item.architectureVersion === "V1" && item.state === "PAGE_FINALISED");
    if (!directionalInput || !directionalEvaluation || !directionalEvaluation.sourceD8SnapshotId || !reportCard || !presentation || !remediation || !report.artifact?.stageBRenderManifest || report.artifact.stageBRenderManifest.integrityStatus !== "PASS" || report.artifact.remediationReportIntegrity?.status !== "PASS") throw new FounderRegenerationError("V1 Founder review requires the finalized native Directional Stage A and PASS final-report integrity authorities.", 409);
    const canonicalManifest = buildStageBRenderManifest(state, remediation.id);
    const manifest = report.artifact.stageBRenderManifest;
    if (manifest.reportSourceId !== canonicalManifest.reportSourceId || manifest.reportSourceHash !== canonicalManifest.reportSourceHash || manifest.integrityRunId !== canonicalManifest.integrityRunId || manifest.integrityScopeHash !== canonicalManifest.integrityScopeHash) throw new FounderRegenerationError("V1 Founder review requires canonical Stage-B report-source provenance.", 409);
    return { organisationId: caseRecord.organisationId, projectId: project.id, caseId: caseRecord.id, floorId: floor.id,
      reportId: report.id, reportVersion: report.versionLabel, planVersionId: report.artifact.planVersionId!,
      evidenceVersionIds: [directionalInput.id, directionalEvaluation.id, reportCard.id, presentation.id],
      orientationVersionId: directionalEvaluation.sourceD8SnapshotId, mappingVersionIds: [directionalInput.id],
      evaluationVersionIds: [directionalEvaluation.id, reportCard.id], methodologyVersionIds: [directionalInput.methodologyVersionId, directionalInput.methodologyContentHash].filter((item): item is string => Boolean(item)),
      reportArtifactHash: report.artifact.contentHash };
  }
  const blockers = getStageAFloorReviewBlockers(state, report); if (blockers.length) throw new FounderRegenerationError(`Founder review is blocked. ${blockers.join(" ")}`, 409);
  const caseRecord = state.vastuCases.find((item) => item.id === report.caseId)!; const floor = state.floorWorkspaces.find((item) => item.id === report.floorId)!;
  const planVersionId = report.artifact!.planVersionId!; const orientationVersionId = report.artifact!.orientationVersionId!;
  const entranceZoneVersionIds = (state.entranceZoneVersions ?? []).filter((item) => item.caseId === report.caseId && item.status === "CURRENT" && (item.scope === "PROPERTY_MAIN_GATE" || item.floorId === floor.id)).map((item) => item.id);
  const mappingVersionIds = [...entranceZoneVersionIds, ...[...state.openingMappings, ...state.spaceMappings].filter((item) => item.caseId === report.caseId && item.floorId === floor.id && item.planVersionId === planVersionId && item.orientationVersionId === orientationVersionId).map((item) => item.id)].sort();
  const evaluationVersionIds = [report.artifact!.evaluationSnapshotId!, report.artifact!.shaktiSnapshotId!].sort();
  const methodologyVersionIds = [...new Set([
    ...state.openingMappings.filter((item) => mappingVersionIds.includes(item.id)).flatMap((item) => item.methodologyVersionId ? [item.methodologyVersionId] : []),
    ...(state.entranceZoneVersions ?? []).filter((item) => mappingVersionIds.includes(item.id)).map((item) => item.methodologyVersionId),
    ...state.spaceMappings.filter((item) => mappingVersionIds.includes(item.id)).flatMap((item) => item.methodologyVersionId ? [item.methodologyVersionId] : []),
    ...state.evaluationSnapshots.filter((item) => evaluationVersionIds.includes(item.id)).flatMap((item) => item.provenance?.methodologyVersionId ? [item.provenance.methodologyVersionId] : []),
    ...state.shaktiSnapshots.filter((item) => evaluationVersionIds.includes(item.id)).flatMap((item) => item.provenance?.methodologyVersionId ? [item.provenance.methodologyVersionId] : [])
  ])].sort();
  return { organisationId: caseRecord.organisationId, projectId: caseRecord.projectId!, caseId: caseRecord.id, floorId: floor.id,
    reportId: report.id, reportVersion: report.versionLabel, planVersionId, evidenceVersionIds: [report.artifact!.handMarkedEvidenceVersionId!, marked32DEvidenceId(state, report.caseId, floor.id, planVersionId)!, marked16DEvidenceId(state, report.caseId, floor.id, planVersionId)!, state.orientationVersions.find((item) => item.id === orientationVersionId)!.googleEarthEvidenceVersionId].sort(),
    orientationVersionId, mappingVersionIds, evaluationVersionIds, methodologyVersionIds, reportArtifactHash: report.artifact!.contentHash };
}

export function recordStageAFloorCheckpoint(state: AppState, report: ReportVersionRecord, checkpoint: StageAFloorApprovalCheckpointRecord["checkpoint"], actor: AppUser, reasonValue: unknown, idempotencyKeyValue: unknown) {
  founderActor(actor); const reason = text(reasonValue, "Founder checkpoint reason", 500); if (reason.length < 3) throw new FounderRegenerationError("Founder checkpoint reason must explain the decision.");
  const stableKey = text(idempotencyKeyValue, "Idempotency key", 160);
  const retry = state.stageAFloorApprovalCheckpoints.find((item) => item.reportId === report.id && item.idempotencyKey === stableKey);
  if (retry) return { review: state.stageAFloorReviews.find((item) => item.id === retry.reviewSnapshotId)!, checkpoint: retry };
  const binding = reviewBinding(state, report); let review = state.stageAFloorReviews.find((item) => item.reportId === report.id);
  const snapshotHash = deterministicContentHash(binding);
  if (review && (review.snapshotHash !== snapshotHash || review.reportArtifactHash !== report.artifact?.contentHash)) throw new FounderRegenerationError("The immutable floor review snapshot no longer matches this report version.", 409);
  if (!review) {
    if (checkpoint !== "FOUNDER_REVIEWED") throw new FounderRegenerationError("Founder review must be recorded before approval or release.", 409);
    review = { id: id("stage-a-review"), ...binding, snapshotHash, reviewerActorUserId: actor.id, reviewerDisplayName: actor.fullName,
      status: "DRAFT", reason, createdAt: now(), idempotencyKey: stableKey, createdByActorUserId: actor.id, updatedByActorUserId: actor.id, recordVersion: 1 };
    state.stageAFloorReviews.unshift(review);
  }
  const reviewSnapshot = review;
  if (!reviewSnapshot) throw new FounderRegenerationError("Founder review snapshot could not be created.", 409);
  const prior = state.stageAFloorApprovalCheckpoints.filter((item) => item.reviewSnapshotId === reviewSnapshot.id);
  const requiredPrior = checkpoint === "FOUNDER_APPROVED" ? "FOUNDER_REVIEWED" : checkpoint === "RELEASED" ? "FOUNDER_APPROVED" : undefined;
  if (requiredPrior && !prior.some((item) => item.checkpoint === requiredPrior)) throw new FounderRegenerationError(`${requiredPrior.replaceAll("_", " ")} is required first.`, 409);
  if (prior.some((item) => item.checkpoint === checkpoint)) throw new FounderRegenerationError(`The ${checkpoint.replaceAll("_", " ")} checkpoint already exists for this immutable snapshot.`, 409);
  const entry: StageAFloorApprovalCheckpointRecord = { id: id("stage-a-checkpoint"), organisationId: binding.organisationId,
    createdByActorUserId: actor.id, updatedByActorUserId: actor.id, recordVersion: 1, reviewSnapshotId: reviewSnapshot.id,
    projectId: binding.projectId, caseId: binding.caseId, floorId: binding.floorId, reportId: report.id, checkpoint,
    snapshotHash: reviewSnapshot.snapshotHash, reportArtifactHash: binding.reportArtifactHash, actorUserId: actor.id, actorDisplayName: actor.fullName,
    actorRole: actor.role, reason, idempotencyKey: stableKey, occurredAt: now() };
  state.stageAFloorApprovalCheckpoints.unshift(entry); return { review, checkpoint: entry };
}

export function projectFounderFloorQueues(state: AppState, caseId?: string) {
  const cases = state.vastuCases.filter((item) => !caseId || item.id === caseId);
  return cases.flatMap((caseRecord) => state.floorWorkspaces.filter((floor) => floor.caseId === caseRecord.id && floor.projectId === caseRecord.projectId).map((floor) => {
    const invalidations = state.dependencyInvalidations.filter((item) => item.caseId === caseRecord.id && item.floorId === floor.id && openRegenerationStatuses.includes(item.status as typeof openRegenerationStatuses[number]));
    const plan = state.planVersions.find((item) => item.caseId === caseRecord.id && item.floorId === floor.id && item.status === "CURRENT");
    const evidence = state.spatialEvidenceVersions.find((item) => item.caseId === caseRecord.id && item.floorId === floor.id && item.planVersionId === plan?.id
      && item.kind === "HAND_MARKED_PLAN" && item.classification === "MARKED_32D_CHAKRA_V1" && item.has32SectorChakra === true && item.status === "CURRENT" && item.fullColour);
    const evidence16 = state.spatialEvidenceVersions.find((item) => item.caseId === caseRecord.id && item.floorId === floor.id && item.planVersionId === plan?.id
      && item.kind === "HAND_MARKED_PLAN" && item.classification === "MARKED_16D_MAPPING_V1" && item.has16DirectionMapping === true && item.status === "CURRENT" && item.fullColour);
    const propertyMainGate = (state.entranceZoneVersions ?? []).find((item) => item.caseId === caseRecord.id && item.scope === "PROPERTY_MAIN_GATE" && item.status === "CURRENT");
    const floorGate = (state.entranceZoneVersions ?? []).find((item) => item.caseId === caseRecord.id && item.floorId === floor.id && item.scope === "FLOOR_PRIMARY_ENTRANCE" && item.status === "CURRENT");
    const mappings = state.spaceMappings.filter((item) => item.caseId === caseRecord.id && item.floorId === floor.id && item.planVersionId === plan?.id);
    const report = state.reportVersions.find((item) => item.caseId === caseRecord.id && item.floorId === floor.id && !item.isPreview) ?? state.reportVersions.find((item) => item.caseId === caseRecord.id && item.floorId === floor.id && item.isPreview);
    const checkpoints = report ? state.stageAFloorApprovalCheckpoints.filter((item) => item.reportId === report.id) : [];
    let category: FounderFloorQueueCategory; let blockerReason: string; let nextAction: string;
    if (invalidations.length) { category = "NEEDS_REGENERATION"; blockerReason = invalidations[0].reason; nextAction = invalidations[0].status === "NEEDS_REGENERATION" ? "Require a replacement version" : invalidations[0].status === "REPLACEMENT_REQUIRED" ? "Create and bind the valid replacement" : "Verify the replacement and mark Ready for Review"; }
    else if (mappings.some((item) => item.methodologyStatus === "REVIEW_REQUIRED")) { category = "REVIEW_REQUIRED"; blockerReason = "A mapping requires Methodology Owner review."; nextAction = "Resolve the mapping through an approved methodology version"; }
    else if (mappings.some((item) => item.methodologyStatus === "BLOCKED_METHOD_INPUT")) { category = "BLOCKED_METHOD_INPUT"; blockerReason = "Approved direction methodology input is missing."; nextAction = "Complete the methodology definition without guessing"; }
    else if (!plan || !evidence || !evidence16 || (!propertyMainGate && !floorGate)) { category = "MISSING_EVIDENCE"; blockerReason = !plan ? "A current digital plan is missing." : !evidence ? "Founder-confirmed 32-sector chakra evidence is missing." : !evidence16 ? "Founder-confirmed 16-direction marked mapping is missing." : "At least one applicable property or floor entrance zone is missing."; nextAction = "Complete this floor in Spatial Setup"; }
    else if (report?.status === "RELEASED" && checkpoints.some((item) => item.checkpoint === "RELEASED")) { category = "RELEASED"; blockerReason = "This floor report version is immutable and released."; nextAction = "Keep the released version in history"; }
    else if (checkpoints.some((item) => item.checkpoint === "FOUNDER_REVIEWED")) { category = "READY_FOR_APPROVAL"; blockerReason = checkpoints.some((item) => item.checkpoint === "FOUNDER_APPROVED") ? "Founder approval is recorded; release gates remain." : "Founder review is recorded on the immutable snapshot."; nextAction = checkpoints.some((item) => item.checkpoint === "FOUNDER_APPROVED") ? "Release only after all downstream gates pass" : "Record Founder approval on the same report version"; }
    else { category = "PENDING_FOUNDER_VERIFICATION"; blockerReason = report ? "The floor report awaits Founder verification." : "Complete evaluation and create the exact floor report version."; nextAction = report ? "Review evidence, lineage, findings, and report sections" : "Finish evaluation and generate the watermarked preview"; }
    return { caseId: caseRecord.id, projectId: caseRecord.projectId, floorId: floor.id, floorLabel: floor.floorLabel, category, blockerReason, nextAction,
      invalidations: invalidations.map((item) => ({ id: item.id, targetId: item.targetId, targetType: item.targetType, status: item.status, reason: item.reason, recordVersion: item.recordVersion ?? 0, replacementVersionId: item.replacementVersionId })) };
  }));
}
