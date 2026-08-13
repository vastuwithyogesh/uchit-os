import type {
  AppUser,
  PostSiteFindingsApprovalRecord,
  PostSiteFindingsRecord,
  SiteAnalysisApprovalRecord,
  SiteAnalysisEvidenceType,
  SiteAnalysisRecord,
  SiteAnalysisStatus
} from "@/lib/domain";
import { assertCaseFileEvidenceScope } from "@/lib/case-file-assets.server";
import { appendFloorInvalidations } from "@/lib/founder-regeneration";
import { getActiveCaseForClient } from "@/lib/service-framework";
import { getAppState } from "@/lib/store";
import type { AppState } from "@/lib/store";
import { deterministicContentHash } from "@/lib/evaluation-provenance";
import { ensureStageBReservation } from "@/lib/stage-b-remediation";

export class SiteWorkflowError extends Error {
  readonly statusCode: 400 | 403 | 404 | 409 | 428 | 503;
  constructor(message: string, statusCode: 400 | 403 | 404 | 409 | 428 | 503 = 400) {
    super(message); this.name = "SiteWorkflowError"; this.statusCode = statusCode;
  }
}

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

function safeText(value: unknown, label: string, max = 2000, min = 1) {
  if (typeof value !== "string") throw new SiteWorkflowError(`${label} must be safe text.`);
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max || /[\u0000-\u001f\u007f<>]/.test(trimmed) || /(?:data|blob|javascript|https?):/i.test(trimmed) || /(?:^|[\\/])(?:\.\.?[\\/]|[a-zA-Z]:)/.test(trimmed)) {
    throw new SiteWorkflowError(`${label} must be safe text from ${min} to ${max} characters.`);
  }
  return trimmed;
}

function stableKey(value: unknown) { return safeText(value, "Idempotency key", 160, 8); }

function founderActor(actor: AppUser) {
  if (actor.role !== "SUPER_ADMIN" || (actor.organisationId && actor.organisationCapability !== "organisation_owner")) {
    throw new SiteWorkflowError("Only the active Founder organisation owner can manage Site Analysis.", 403);
  }
}

function context(state: AppState, caseIdValue: unknown, floorIdValue: unknown, actor: AppUser) {
  const caseId = safeText(caseIdValue, "Case ID", 160);
  const floorId = safeText(floorIdValue, "Floor ID", 160);
  const caseRecord = state.vastuCases.find((item) => item.id === caseId);
  if (!caseRecord) throw new SiteWorkflowError("Case not found.", 404);
  if (actor.organisationId && caseRecord.organisationId !== actor.organisationId) throw new SiteWorkflowError("Floor not found.", 404);
  if (getActiveCaseForClient(state, caseRecord.clientId)?.id !== caseRecord.id) throw new SiteWorkflowError("Use the active case revision for Site Analysis.", 409);
  const project = caseRecord.projectId ? state.projects.find((item) => item.id === caseRecord.projectId && item.activeCaseId === caseRecord.id) : undefined;
  const floor = project ? state.floorWorkspaces.find((item) => item.id === floorId && item.caseId === caseRecord.id && item.projectId === project.id) : undefined;
  if (!project || !floor) throw new SiteWorkflowError("Floor not found in the active project and case revision.", 404);
  if (state.reportVersions.some((item) => item.caseId === caseRecord.id && item.floorId === floor.id && item.artifact?.immutable && !item.isPreview)) {
    throw new SiteWorkflowError("Site Analysis is locked by the released floor report. Use formal rectification before changing it.", 409);
  }
  return { caseRecord, project, floor, caseRevisionNumber: caseRecord.revisionNumber ?? 1, floorRevisionNumber: floor.recordVersion ?? 0 };
}

function appendTimeline(state: AppState, clientId: string, actor: AppUser, headline: string, details: string) {
  state.timelineEvents.unshift({
    id: id("event"), clientId, category: "Site Analysis", headline, details,
    happenedAt: now(), actorRole: actor.role, actorId: actor.id, actorName: actor.fullName,
    organisationId: actor.organisationId, createdByActorUserId: actor.id, recordVersion: 0
  });
}

function evidenceList(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12 || value.some((item) => typeof item !== "string")) {
    throw new SiteWorkflowError("At least one protected Site Analysis evidence reference is required.");
  }
  const refs = value.map((item) => safeText(item, "Evidence reference", 200, 8));
  if (new Set(refs).size !== refs.length) throw new SiteWorkflowError("Site Analysis evidence references must be unique.");
  return refs;
}

function observations(input: Record<string, unknown>) {
  return {
    site: safeText(input.site, "Site observation"),
    entrance: safeText(input.entrance, "Entrance observation"),
    surroundings: safeText(input.surroundings, "Surroundings observation"),
    light: safeText(input.light, "Light observation"),
    ventilation: safeText(input.ventilation, "Ventilation observation"),
    airflow: safeText(input.airflow, "Airflow observation"),
    neighbouringEffects: safeText(input.neighbouringEffects, "Neighbouring-effects observation"),
    relevantObservations: safeText(input.relevantObservations, "Relevant observations")
  };
}

function assertTimestamp(value: unknown) {
  const timestamp = safeText(value, "Captured date", 80, 10);
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed) || parsed > Date.now() + 5 * 60 * 1000) throw new SiteWorkflowError("Captured date must be a valid non-future date.");
  return new Date(parsed).toISOString();
}

function hashSitePayload(value: unknown) { return deterministicContentHash(value); }

async function assertEvidenceRefs(refs: string[], scope: { organisationId: string; caseId: string; caseRevisionNumber: number; serviceType: "EXISTING_SPACE" | "NEW_CONSTRUCTION"; floorLabel: string }) {
  for (const ref of refs) await assertCaseFileEvidenceScope(ref, scope);
}

function latestAnalysis(state: AppState, caseId: string, floorId: string) {
  return [...state.siteAnalyses].filter((item) => item.caseId === caseId && item.floorId === floorId).sort((a, b) => b.version - a.version)[0];
}

function latestFindings(state: AppState, caseId: string, floorId: string) {
  return [...state.postSiteFindings].filter((item) => item.caseId === caseId && item.floorId === floorId).sort((a, b) => b.version - a.version)[0];
}

export async function upsertSiteAnalysis(input: {
  caseId: unknown; floorId: unknown; recordId?: unknown; evidenceType: unknown; evidenceRefs: unknown; capturedAt: unknown;
  stageAVerdictReportId: unknown;
  visitMetadata?: unknown; site: unknown; entrance: unknown; surroundings: unknown; light: unknown; ventilation: unknown;
  airflow: unknown; neighbouringEffects: unknown; relevantObservations: unknown; idempotencyKey: unknown;
  expectedRecordVersion: unknown; actor: AppUser;
}) {
  founderActor(input.actor);
  const state = getAppState();
  const { caseRecord, project, floor, caseRevisionNumber, floorRevisionNumber } = context(state, input.caseId, input.floorId, input.actor);
  if (!Number.isInteger(input.expectedRecordVersion) || Number(input.expectedRecordVersion) < 0) throw new SiteWorkflowError("The latest floor record version is required.", 428);
  if ((caseRecord.recordVersion ?? 0) !== Number(input.expectedRecordVersion)) throw new SiteWorkflowError("The case changed. Refresh before saving Site Analysis.", 409);
  const stageAVerdictReportId = safeText(input.stageAVerdictReportId, "Stage A verdict report ID", 160);
  if (floor.stageAVerdictStatus !== "PRESENTED" || !floor.stageAVerdictVersion) {
    throw new SiteWorkflowError("Site Analysis opens only after this floor's Stage A verdict has been presented.", 409);
  }
  const stageAVerdict = state.reportVersions.find((item) => item.id === stageAVerdictReportId
    && item.caseId === caseRecord.id && item.floorId === floor.id && item.isPreview && item.artifact?.immutable
    && item.versionLabel === floor.stageAVerdictVersion);
  if (!stageAVerdict) throw new SiteWorkflowError("Select the exact immutable Stage A preview presented for this floor.", 409);
  const upstreamEvaluationVersionId = stageAVerdict.artifact?.evaluationSnapshotId;
  if (!upstreamEvaluationVersionId || !state.evaluationSnapshots.some((item) => item.id === upstreamEvaluationVersionId
    && item.caseId === caseRecord.id && item.floorId === floor.id && item.planVersionId === stageAVerdict.artifact?.planVersionId
    && item.orientationVersionId === stageAVerdict.artifact?.orientationVersionId)) {
    throw new SiteWorkflowError("The presented Stage A verdict is missing exact floor evaluation lineage.", 409);
  }
  const key = stableKey(input.idempotencyKey);
  const evidenceType = safeText(input.evidenceType, "Evidence type", 40, 4) as SiteAnalysisEvidenceType;
  if (!["VIDEO_ANALYSIS", "PHYSICAL_VISIT"].includes(evidenceType)) throw new SiteWorkflowError("Choose Video Analysis or Physical Visit.");
  const evidenceRefs = evidenceList(input.evidenceRefs);
  const capturedAt = assertTimestamp(input.capturedAt);
  const visitMetadata = input.visitMetadata === undefined ? undefined : safeText(input.visitMetadata, "Visit metadata", 1000);
  const siteObservations = observations(input as unknown as Record<string, unknown>);
  const payload = { projectId: project.id, caseId: caseRecord.id, floorId: floor.id, caseRevisionNumber, floorRevisionNumber,
    stageAVerdictReportId, stageAVerdictVersion: stageAVerdict.versionLabel, upstreamEvaluationVersionId,
    evidenceType, evidenceRefs, capturedAt, visitMetadata: visitMetadata ?? null, observations: siteObservations };
  const contentHash = hashSitePayload(payload);
  const replay = state.siteAnalyses.find((item) => item.caseId === caseRecord.id && item.floorId === floor.id && item.idempotencyKey === key);
  if (replay) {
    if (replay.contentHash !== contentHash) throw new SiteWorkflowError("That idempotency key is already used for different Site Analysis content.", 409);
    return replay;
  }
  const recordId = input.recordId === undefined ? undefined : safeText(input.recordId, "Site Analysis record ID", 160);
  const current = latestAnalysis(state, caseRecord.id, floor.id);
  if (recordId && (!current || current.id !== recordId)) throw new SiteWorkflowError("Edit the latest Site Analysis version for this floor.", 409);
  const organisationId = caseRecord.organisationId ?? input.actor.organisationId;
  if (!organisationId) throw new SiteWorkflowError("Organisation scope is required for Site Analysis.", 409);
  await assertEvidenceRefs(evidenceRefs, { organisationId, caseId: caseRecord.id, caseRevisionNumber, serviceType: caseRecord.serviceType ?? "EXISTING_SPACE", floorLabel: floor.floorLabel });
  const createdAt = now();
  const next: SiteAnalysisRecord = {
    id: id("site-analysis"), organisationId, projectId: project.id, caseId: caseRecord.id, floorId: floor.id,
    caseRevisionNumber, floorRevisionNumber, version: (current?.version ?? 0) + 1, ...(current ? { supersedesId: current.id } : {}),
    stageAVerdictReportId, stageAVerdictVersion: stageAVerdict.versionLabel, upstreamEvaluationVersionId,
    evidenceType, evidenceRefs, capturedAt, ...(visitMetadata ? { visitMetadata } : {}), observations: siteObservations,
    status: "DRAFT", idempotencyKey: key, contentHash, createdAt, createdByActorUserId: input.actor.id, createdByActorName: input.actor.fullName,
    updatedByActorUserId: input.actor.id, recordVersion: 1
  };
  state.siteAnalyses.unshift(next);
  caseRecord.recordVersion = (caseRecord.recordVersion ?? 0) + 1;
  floor.status = "NEEDS_REGENERATION";
  floor.locked = false;
  floor.regenerationReason = "A Site Analysis version changed; dependent draft outputs require Founder review.";
  if (current) appendFloorInvalidations({ projectId: project.id, caseId: caseRecord.id, floorId: floor.id, causeType: "SITE_ANALYSIS", sourceVersionId: next.id, reason: floor.regenerationReason, actor: input.actor });
  appendTimeline(state, caseRecord.clientId, input.actor, current ? "Site Analysis version updated" : "Site Analysis recorded", `${floor.floorLabel} Site Analysis v${next.version} is stored as immutable human-entered evidence.`);
  return next;
}

function siteCheckpoint<T extends "FOUNDER_REVIEWED" | "FOUNDER_APPROVED">(input: {
  recordId: unknown; caseId: unknown; floorId: unknown; checkpoint: T; reason: unknown; idempotencyKey: unknown; expectedRecordVersion: unknown; actor: AppUser;
}) {
  founderActor(input.actor);
  const state = getAppState();
  const { caseRecord, project, floor } = context(state, input.caseId, input.floorId, input.actor);
  const recordId = safeText(input.recordId, "Site Analysis record ID", 160);
  const record = state.siteAnalyses.find((item) => item.id === recordId && item.caseId === caseRecord.id && item.floorId === floor.id);
  if (!record) throw new SiteWorkflowError("Site Analysis version not found in this floor.", 404);
  if (record.needsRegeneration) throw new SiteWorkflowError("This Site Analysis needs regeneration from the latest upstream verdict/evidence before Founder review.", 409);
  if (!Number.isInteger(input.expectedRecordVersion) || Number(input.expectedRecordVersion) < 0) throw new SiteWorkflowError("The latest floor record version is required.", 428);
  if ((caseRecord.recordVersion ?? 0) !== Number(input.expectedRecordVersion)) throw new SiteWorkflowError("The case changed. Refresh before approving Site Analysis.", 409);
  const key = stableKey(input.idempotencyKey);
  const replay = state.siteAnalysisApprovals.find((item) => item.analysisId === record.id && item.idempotencyKey === key);
  if (replay) return { record, approval: replay };
  const reason = safeText(input.reason, "Founder checkpoint reason", 500, 20);
  const expected: SiteAnalysisStatus = input.checkpoint === "FOUNDER_REVIEWED" ? "DRAFT" : "FOUNDER_REVIEWED";
  if (record.status !== expected) throw new SiteWorkflowError(`Site Analysis must be ${expected} before ${input.checkpoint}.`, 409);
  const previousStatus = record.status;
  const currentStatus = input.checkpoint;
  record.status = currentStatus;
  record.updatedByActorUserId = input.actor.id;
  record.recordVersion = (record.recordVersion ?? 0) + 1;
  caseRecord.recordVersion = (caseRecord.recordVersion ?? 0) + 1;
  const approval: SiteAnalysisApprovalRecord = {
    id: id("site-analysis-approval"), organisationId: caseRecord.organisationId ?? input.actor.organisationId,
    analysisId: record.id, projectId: project.id, caseId: caseRecord.id, floorId: floor.id, analysisVersion: record.version,
    checkpoint: input.checkpoint, actorUserId: input.actor.id, actorDisplayName: input.actor.fullName, actorRole: input.actor.role,
    reason, priorStatus: previousStatus, currentStatus, policyVersion: 1, occurredAt: now(), idempotencyKey: key,
    createdByActorUserId: input.actor.id, updatedByActorUserId: input.actor.id, recordVersion: 1
  };
  state.siteAnalysisApprovals.unshift(approval);
  appendTimeline(state, caseRecord.clientId, input.actor, `Site Analysis ${input.checkpoint.toLowerCase().replaceAll("_", " ")}`, `${floor.floorLabel} Site Analysis v${record.version}; prior=${previousStatus}; reason=${reason}`);
  return { record, approval };
}

export function checkpointSiteAnalysis(input: Parameters<typeof siteCheckpoint>[0]) {
  return siteCheckpoint(input);
}

export async function upsertPostSiteFindings(input: {
  caseId: unknown; floorId: unknown; recordId?: unknown; siteAnalysisId: unknown; reportId: unknown; upstreamEvaluationVersionId?: unknown;
  differences: unknown; corrections: unknown; newFindings: unknown; additionalObservations: unknown; idempotencyKey: unknown; expectedRecordVersion: unknown; actor: AppUser;
}) {
  founderActor(input.actor);
  const state = getAppState();
  const { caseRecord, project, floor, caseRevisionNumber, floorRevisionNumber } = context(state, input.caseId, input.floorId, input.actor);
  if (!Number.isInteger(input.expectedRecordVersion) || Number(input.expectedRecordVersion) < 0) throw new SiteWorkflowError("The latest floor record version is required.", 428);
  if ((caseRecord.recordVersion ?? 0) !== Number(input.expectedRecordVersion)) throw new SiteWorkflowError("The case changed. Refresh before saving Post-Site Findings.", 409);
  const siteAnalysisId = safeText(input.siteAnalysisId, "Site Analysis ID", 160);
  const analysis = state.siteAnalyses.find((item) => item.id === siteAnalysisId && item.caseId === caseRecord.id && item.floorId === floor.id && item.status === "FOUNDER_APPROVED");
  if (!analysis) throw new SiteWorkflowError("Post-Site Findings require an approved Site Analysis for this floor.", 409);
  const reportId = safeText(input.reportId, "Upstream report ID", 160);
  const report = state.reportVersions.find((item) => item.id === reportId && item.caseId === caseRecord.id && item.floorId === floor.id);
  if (!report) throw new SiteWorkflowError("The upstream report must belong to this exact floor.", 404);
  if (analysis.stageAVerdictReportId !== report.id) throw new SiteWorkflowError("Post-Site Findings must use the same presented Stage A verdict as the approved Site Analysis.", 409);
  const upstreamEvaluationVersionId = input.upstreamEvaluationVersionId === undefined ? analysis.upstreamEvaluationVersionId : safeText(input.upstreamEvaluationVersionId, "Upstream evaluation version ID", 160);
  if (upstreamEvaluationVersionId !== analysis.upstreamEvaluationVersionId) throw new SiteWorkflowError("Post-Site Findings must retain the approved Site Analysis evaluation lineage.", 409);
  if (upstreamEvaluationVersionId && !state.evaluationSnapshots.some((item) => item.id === upstreamEvaluationVersionId && item.caseId === caseRecord.id && item.floorId === floor.id)) throw new SiteWorkflowError("The upstream evaluation must belong to this exact floor.", 404);
  const values = { differences: safeText(input.differences, "Differences"), corrections: safeText(input.corrections, "Corrections"), newFindings: safeText(input.newFindings, "New findings"), additionalObservations: safeText(input.additionalObservations, "Additional observations") };
  const key = stableKey(input.idempotencyKey);
  const payload = { projectId: project.id, caseId: caseRecord.id, floorId: floor.id, caseRevisionNumber, floorRevisionNumber, siteAnalysisId, upstreamReportId: report.id, upstreamEvaluationVersionId: upstreamEvaluationVersionId ?? null, ...values };
  const contentHash = hashSitePayload(payload);
  const replay = state.postSiteFindings.find((item) => item.caseId === caseRecord.id && item.floorId === floor.id && item.idempotencyKey === key);
  if (replay) {
    if (replay.contentHash !== contentHash) throw new SiteWorkflowError("That idempotency key is already used for different Post-Site Findings content.", 409);
    return replay;
  }
  const recordId = input.recordId === undefined ? undefined : safeText(input.recordId, "Post-Site Findings record ID", 160);
  const current = latestFindings(state, caseRecord.id, floor.id);
  if (recordId && (!current || current.id !== recordId)) throw new SiteWorkflowError("Edit the latest Post-Site Findings version for this floor.", 409);
  const next: PostSiteFindingsRecord = {
    id: id("post-site-findings"), organisationId: caseRecord.organisationId ?? input.actor.organisationId, projectId: project.id, caseId: caseRecord.id, floorId: floor.id,
    caseRevisionNumber, floorRevisionNumber, version: (current?.version ?? 0) + 1, ...(current ? { supersedesId: current.id } : {}), siteAnalysisId,
    upstreamReportId: report.id, ...(upstreamEvaluationVersionId ? { upstreamEvaluationVersionId } : {}), ...values, status: "DRAFT", idempotencyKey: key,
    contentHash, createdAt: now(), createdByActorUserId: input.actor.id, createdByActorName: input.actor.fullName, updatedByActorUserId: input.actor.id, recordVersion: 1
  };
  state.postSiteFindings.unshift(next);
  caseRecord.recordVersion = (caseRecord.recordVersion ?? 0) + 1;
  floor.status = "NEEDS_REGENERATION"; floor.locked = false; floor.regenerationReason = "Post-Site Findings changed; dependent draft outputs require Founder review.";
  if (current) appendFloorInvalidations({ projectId: project.id, caseId: caseRecord.id, floorId: floor.id, causeType: "SITE_ANALYSIS", sourceVersionId: next.id, reason: floor.regenerationReason, actor: input.actor });
  appendTimeline(state, caseRecord.clientId, input.actor, current ? "Post-Site Findings version updated" : "Post-Site Findings recorded", `${floor.floorLabel} Post-Site Findings v${next.version} is stored without rerunning evaluation.`);
  return next;
}

function postSiteCheckpoint(input: {
  recordId: unknown; caseId: unknown; floorId: unknown; checkpoint: "FOUNDER_REVIEWED" | "FOUNDER_APPROVED"; reason: unknown; idempotencyKey: unknown; expectedRecordVersion: unknown; actor: AppUser;
}) {
  founderActor(input.actor);
  const state = getAppState();
  const { caseRecord, project, floor } = context(state, input.caseId, input.floorId, input.actor);
  const recordId = safeText(input.recordId, "Post-Site Findings record ID", 160);
  const record = state.postSiteFindings.find((item) => item.id === recordId && item.caseId === caseRecord.id && item.floorId === floor.id);
  if (!record) throw new SiteWorkflowError("Post-Site Findings version not found in this floor.", 404);
  if (record.needsRegeneration) throw new SiteWorkflowError("These Post-Site Findings need regeneration from the latest upstream verdict/evidence before Founder review.", 409);
  if (!Number.isInteger(input.expectedRecordVersion) || Number(input.expectedRecordVersion) < 0) throw new SiteWorkflowError("The latest floor record version is required.", 428);
  if ((caseRecord.recordVersion ?? 0) !== Number(input.expectedRecordVersion)) throw new SiteWorkflowError("The case changed. Refresh before approving Post-Site Findings.", 409);
  const key = stableKey(input.idempotencyKey);
  const replay = state.postSiteFindingsApprovals.find((item) => item.findingsId === record.id && item.idempotencyKey === key);
  if (replay) return { record, approval: replay };
  const reason = safeText(input.reason, "Founder checkpoint reason", 500, 20);
  const expected = input.checkpoint === "FOUNDER_REVIEWED" ? "DRAFT" : "FOUNDER_REVIEWED";
  if (record.status !== expected) throw new SiteWorkflowError(`Post-Site Findings must be ${expected} before ${input.checkpoint}.`, 409);
  if (input.checkpoint === "FOUNDER_APPROVED") {
    const analysis = state.siteAnalyses.find((item) => item.id === record.siteAnalysisId && item.caseId === caseRecord.id && item.floorId === floor.id && item.status === "FOUNDER_APPROVED");
    if (!analysis) throw new SiteWorkflowError("Post-Site Findings approval requires the linked Site Analysis to be Founder-approved.", 409);
  }
  const priorStatus = record.status;
  record.status = input.checkpoint; record.updatedByActorUserId = input.actor.id; record.recordVersion = (record.recordVersion ?? 0) + 1;
  caseRecord.recordVersion = (caseRecord.recordVersion ?? 0) + 1;
  const approval: PostSiteFindingsApprovalRecord = {
    id: id("post-site-findings-approval"), organisationId: caseRecord.organisationId ?? input.actor.organisationId,
    findingsId: record.id, projectId: project.id, caseId: caseRecord.id, floorId: floor.id, findingsVersion: record.version,
    checkpoint: input.checkpoint, actorUserId: input.actor.id, actorDisplayName: input.actor.fullName, actorRole: input.actor.role,
    reason, priorStatus, currentStatus: input.checkpoint, policyVersion: 1, occurredAt: now(), idempotencyKey: key,
    createdByActorUserId: input.actor.id, updatedByActorUserId: input.actor.id, recordVersion: 1
  };
  state.postSiteFindingsApprovals.unshift(approval);
  appendTimeline(state, caseRecord.clientId, input.actor, `Post-Site Findings ${input.checkpoint.toLowerCase().replaceAll("_", " ")}`, `${floor.floorLabel} Post-Site Findings v${record.version}; evaluation was not rerun.`);
  return { record, approval };
}

export function checkpointPostSiteFindings(input: Parameters<typeof postSiteCheckpoint>[0]) {
  const result = postSiteCheckpoint(input);
  if (input.checkpoint === "FOUNDER_APPROVED") ensureStageBReservation({ state: getAppState(), caseId: result.record.caseId, floorId: result.record.floorId, actor: input.actor });
  return result;
}

export function approveManualUtilitySheet(input: {
  caseId: unknown; floorId: unknown; documentId: unknown; reason: unknown; idempotencyKey: unknown; expectedRecordVersion: unknown; actor: AppUser;
}) {
  founderActor(input.actor);
  const state = getAppState();
  const { caseRecord, project, floor } = context(state, input.caseId, input.floorId, input.actor);
  if (!Number.isInteger(input.expectedRecordVersion) || Number(input.expectedRecordVersion) < 0) throw new SiteWorkflowError("The latest floor record version is required.", 428);
  if ((caseRecord.recordVersion ?? 0) !== Number(input.expectedRecordVersion)) throw new SiteWorkflowError("The case changed. Refresh before approving the manual utility sheet.", 409);
  const documentId = safeText(input.documentId, "Manual utility sheet document ID", 160);
  const document = state.caseDocuments.find((item) => item.id === documentId && item.caseId === caseRecord.id && item.caseRevisionNumber === (caseRecord.revisionNumber ?? 1) && item.assetType === "MANUAL_UTILITY_SHEET" && item.floorLabel === floor.floorLabel && item.isCurrent);
  if (!document) throw new SiteWorkflowError("The manual utility sheet must belong to this current floor and case revision.", 404);
  if (document.revisionStatus !== "VERIFIED" || document.blocker || document.discrepancy) throw new SiteWorkflowError("The manual utility sheet must be verified with no blocker or discrepancy.", 409);
  const key = stableKey(input.idempotencyKey);
  const replay = state.manualSheetApprovals.find((item) => item.documentId === document.id && item.idempotencyKey === key);
  if (replay) return { document, approval: replay };
  const reason = safeText(input.reason, "Founder approval reason", 500, 20);
  const priorStatus = document.founderApprovalStatus ?? "PENDING";
  if (priorStatus === "APPROVED") throw new SiteWorkflowError("This manual utility sheet is already Founder-approved.", 409);
  document.founderApprovalStatus = "APPROVED";
  document.founderApprovedAt = now();
  document.founderApprovedByActorUserId = input.actor.id;
  document.updatedByActorUserId = input.actor.id;
  document.recordVersion = (document.recordVersion ?? 0) + 1;
  caseRecord.recordVersion = (caseRecord.recordVersion ?? 0) + 1;
  const approval = {
    id: id("manual-sheet-approval"), organisationId: caseRecord.organisationId ?? input.actor.organisationId,
    documentId: document.id, projectId: project.id, caseId: caseRecord.id, floorId: floor.id, documentVersion: document.version,
    checkpoint: "FOUNDER_APPROVED" as const, actorUserId: input.actor.id, actorDisplayName: input.actor.fullName, actorRole: input.actor.role,
    reason, priorStatus, currentStatus: "APPROVED" as const, occurredAt: now(), idempotencyKey: key,
    createdByActorUserId: input.actor.id, updatedByActorUserId: input.actor.id, recordVersion: 1
  };
  state.manualSheetApprovals.unshift(approval);
  appendTimeline(state, caseRecord.clientId, input.actor, "Manual utility sheet Founder-approved", `${floor.floorLabel} document ${document.versionLabel} is approved for report inclusion.`);
  return { document, approval };
}
