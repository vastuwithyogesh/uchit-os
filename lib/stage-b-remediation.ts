import type {
  AppUser, CombinedEvaluationReportSnapshotV1, DependencyInvalidationRecord, MasterAppendixRowRecord, PhysicalPlacementRecord,
  PlacementImplementationRowRecord, RemedyEligibilityResolutionRecord, ReportPlacementPageRecord,
  StageBIntegrityRunRecord, StageBRemediationRecord, StageBRemedyType, StageBRenderManifest, RevisedLayoutCandidateRecord,
  StageBRenderProvenance, ReportVersionRecord
} from "./domain.ts";
import { deterministicContentHash } from "./evaluation-provenance.ts";
import type { AppState } from "./store.ts";
import { getAppState } from "./store.ts";
import { completeRemediationReconciliation, liveReportPlacements, reportWideMasterNumber, resequenceReportPlacements, sortReportPlacements } from "./remediation-sequence.ts";
import { resolveRemedySource, type RemedySourceScope } from "./remedy-source.ts";
import { normalizeStageBInputsV1 } from "./stage-b-input-v1.ts";
import { resolveV1FloorWorkflowReadiness } from "./founder-v1-readiness.ts";
import { resolveEvaluationArchitecture } from "./evaluation-architecture.ts";
import { stageBChildMatchesRemediation, stageBRecordLineageFields, resolveStageBReportLineage } from "./stage-b-lineage.ts";
import { resolveCommercialEntitlementForStageB } from "./stage-b-commercial-entitlement.ts";

export const STAGE_B_RESOLVER_VERSION = "stage-b-remedy-resolver/v1" as const;
export const STAGE_B_PRD_SHA256 = "408AF7F5EDC3B9FC62DE61C444D231E6053A85ED882A289F017105F6E923F2CC";
export const STAGE_B_CONTRACT_SHA256 = "E17F142F2823B0D55650270A05360503D8038F6357FE83EF2980F1439B644236";
export const STAGE_B_AUTHORITY_HASH = deterministicContentHash({ prdSha256: STAGE_B_PRD_SHA256, contractSha256: STAGE_B_CONTRACT_SHA256 });

/** The locked elemental action vocabulary is upstream authority. These records
 * formalise the existing resolver contract; they do not choose a remedy asset
 * or placement. */
export const STAGE_B_CANONICAL_REMEDY_MAPPINGS = [
  { action: "SUPPRESS", remedialType: "TATTAV_BALANCER" },
  { action: "GROUND", remedialType: "DISHA_BALANCER" },
  { action: "UPLIFT", remedialType: "TATTAV_ACTIVATION" },
  { action: "PROMOTE", remedialType: "DISHA_ACTIVATION" },
  { action: "BALANCE", remedialType: "EQUALISER" }
] as const;

export const STAGE_B_REMEDY_PAGES = [
  { pageType: "DISHA_BALANCER", ordinal: 8, label: "Disha Balancer" },
  { pageType: "DISHA_ACTIVATION", ordinal: 10, label: "Disha Activation" },
  { pageType: "TATTAV_BALANCER", ordinal: 12, label: "Tattav Balancer" },
  { pageType: "TATTAV_ACTIVATION", ordinal: 14, label: "Tattav Activation" },
  { pageType: "EQUALISER", ordinal: 16, label: "Equaliser" }
] as const satisfies ReadonlyArray<{ pageType: StageBRemedyType; ordinal: number; label: string }>;

const REMEDY_TYPES = new Set<StageBRemedyType>(STAGE_B_REMEDY_PAGES.map((item) => item.pageType));
const SOURCE_FRAMING_TO_REMEDY_TYPE: Readonly<Record<string, StageBRemedyType>> = {
  "Disha Balancer": "DISHA_BALANCER",
  "Disha Activation": "DISHA_ACTIVATION",
  "Tattva Balancer": "TATTAV_BALANCER",
  "Tattva Activation": "TATTAV_ACTIVATION",
  Equaliser: "EQUALISER"
};

export class StageBError extends Error {
  readonly statusCode: 400 | 403 | 404 | 409 | 428 | 503;
  constructor(message: string, statusCode: 400 | 403 | 404 | 409 | 428 | 503 = 400) { super(message); this.name = "StageBError"; this.statusCode = statusCode; }
}

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
function text(value: unknown, label: string, max = 200) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max || /[\u0000-\u001f\u007f<>]/.test(value)) throw new StageBError(`${label} is required and must be safe text up to ${max} characters.`);
  return value.trim();
}
function expected(record: { recordVersion?: number }, value: unknown, label: string) {
  if (!Number.isInteger(value) || Number(value) < 0) throw new StageBError(`The latest ${label} version is required.`, 428);
  if ((record.recordVersion ?? 0) !== Number(value)) throw new StageBError(`The ${label} changed. Refresh and try again.`, 409);
}
function owner(actor: AppUser) {
  if (!actor.organisationId) throw new StageBError("An active organisation is required.", 403);
  return actor.organisationId;
}
function point(value: unknown, label: string) {
  const number = Number(value); if (!Number.isFinite(number) || number < 0 || number > 1) throw new StageBError(`${label} must be normalized between 0 and 1.`); return number;
}
/** Returns the immutable lineage key used by downstream placement records. For V1 this is the
 * Combined Evaluation Report source ID, never a fabricated legacy report record. */
export function stageBReportLineageId(remediation: Pick<StageBRemediationRecord, "reportId" | "reportSourceId">) {
  const value = remediation.reportId ?? remediation.reportSourceId;
  if (!value) throw new StageBError("Stage B report lineage is missing.", 409);
  return value;
}
function remedyType(value: unknown) {
  const valueText = text(value, "Remedial type") as StageBRemedyType;
  if (!REMEDY_TYPES.has(valueText)) throw new StageBError("Remedial type is not one of the five approved Stage B remedy pages.");
  return valueText;
}
function addTimeline(state: AppState, caseId: string, actor: AppUser, headline: string, details: string) {
  const caseRecord = state.vastuCases.find((item) => item.id === caseId); if (!caseRecord) return;
  state.timelineEvents.unshift({ id: id("timeline"), organisationId: caseRecord.organisationId ?? actor.organisationId,
    clientId: caseRecord.clientId, category: "Reports", headline, details, happenedAt: now(), actorRole: actor.role, actorId: actor.id, actorName: actor.fullName });
}
function context(state: AppState, caseIdValue: unknown, floorIdValue: unknown, reportIdValue: unknown, actor: AppUser) {
  const caseId = text(caseIdValue, "Case ID"); const floorId = text(floorIdValue, "Floor ID"); const reportId = text(reportIdValue, "Report ID");
  const caseRecord = state.vastuCases.find((item) => item.id === caseId && (!item.organisationId || item.organisationId === owner(actor)));
  const project = caseRecord?.projectId ? state.projects.find((item) => item.id === caseRecord.projectId && item.activeCaseId === caseRecord.id) : undefined;
  const floor = project ? state.floorWorkspaces.find((item) => item.id === floorId && item.caseId === caseId && item.projectId === project.id) : undefined;
  const report = floor ? state.reportVersions.find((item) => item.id === reportId && item.caseId === caseId && item.floorId === floorId) : undefined;
  if (!caseRecord || !project || !floor || !report) throw new StageBError("Stage B case, floor, or report was not found in the active project scope.", 404);
  return { caseRecord, project, floor, report };
}
function v1Context(state: AppState, caseIdValue: unknown, floorIdValue: unknown, sourceIdValue: unknown, actor: AppUser) {
  const caseId = text(caseIdValue, "Case ID"); const floorId = text(floorIdValue, "Floor ID"); const sourceId = text(sourceIdValue, "Combined Evaluation Report ID");
  const caseRecord = state.vastuCases.find((item) => item.id === caseId && (!item.organisationId || item.organisationId === owner(actor)));
  const project = caseRecord?.projectId ? state.projects.find((item) => item.id === caseRecord.projectId && item.activeCaseId === caseRecord.id) : undefined;
  const floor = project ? state.floorWorkspaces.find((item) => item.id === floorId && item.caseId === caseId && item.projectId === project.id) : undefined;
  const report = state.combinedEvaluationReportSnapshots.find((item) => item.id === sourceId && item.organisationId === owner(actor)
    && item.caseId === caseId && item.projectId === project?.id && item.floorId === floorId && item.architectureVersion === "V1" && item.status === "FINALIZED");
  if (!caseRecord || !project || !floor || !report) throw new StageBError("Finalized V1 Combined Evaluation Report source was not found in the active project scope.", 404);
  return { caseRecord, project, floor, report };
}
function reportKey(scoped: { remediation?: StageBRemediationRecord; report?: { id: string } }) {
  return scoped.remediation?.reportId ?? scoped.remediation?.reportSourceId ?? scoped.report?.id;
}
function remediationContext(state: AppState, remediationIdValue: unknown, actor: AppUser) {
  const remediationId = text(remediationIdValue, "Remediation ID");
  const remediation = state.stageBRemediations.find((item) => item.id === remediationId && item.organisationId === owner(actor));
  if (!remediation) throw new StageBError("Stage B remediation was not found.", 404);
  const isV1 = remediation.reportSourceKind === "V1_COMBINED_EVALUATION_REPORT";
  return { remediation, ...(isV1
    ? v1Context(state, remediation.caseId, remediation.floorId, remediation.reportSourceId, actor)
    : context(state, remediation.caseId, remediation.floorId, remediation.reportId, actor)) };
}
function orderedPages(state: AppState, remediationId: string) {
  return state.reportPlacementPages.filter((item) => item.remediationId === remediationId && item.section === "B" && REMEDY_TYPES.has(item.pageType as StageBRemedyType)).sort((a, b) => a.ordinal - b.ordinal || a.id.localeCompare(b.id));
}
function livePlacements(state: AppState, remediationId: string) {
  const pageIds = new Set(orderedPages(state, remediationId).map((page) => page.id));
  return state.physicalPlacements.filter((item) => item.remediationId === remediationId && item.state !== "DELETED" && pageIds.has(item.pageId));
}
function sortPlacements(state: AppState, remediationId: string, placements = livePlacements(state, remediationId)) {
  return sortReportPlacements(state, remediationId, placements);
}
function resequencePlacements(state: AppState, remediationId: string, actor: AppUser) {
  resequenceReportPlacements(state, remediationId, actor);
  return sortPlacements(state, remediationId);
}
function projectionForPlacement(state: AppState, remediation: StageBRemediationRecord, page: ReportPlacementPageRecord, placement: PhysicalPlacementRecord, actor: AppUser) {
  let row = state.placementImplementationRows.find((item) => item.remediationId === remediation.id && item.placementId === placement.id);
  const rowValues = { ...stageBRecordLineageFields(state, remediation), pageId: page.id, masterNumber: placement.masterNumber!, imageAssetSnapshotId: placement.imageAssetSnapshotId,
    itemNameSnapshot: placement.nameSnapshot, attributePurposeSnapshot: placement.attributePurposeSnapshot, ...(placement.locationReference ? { locationReference: placement.locationReference } : {}) };
  if (row) { Object.assign(row, rowValues); row.updatedByActorUserId = actor.id; row.recordVersion = (row.recordVersion ?? 0) + 1; }
  else { row = { id: id("implementation-row"), organisationId: remediation.organisationId, createdByActorUserId: actor.id, updatedByActorUserId: actor.id, recordVersion: 1,
    remediationId: remediation.id, placementId: placement.id, ...rowValues }; state.placementImplementationRows.unshift(row); }
  let appendix = state.masterAppendixRows.find((item) => item.remediationId === remediation.id && item.placementId === placement.id);
  const appendixValues = { ...stageBRecordLineageFields(state, remediation), caseId: remediation.caseId, floorId: remediation.floorId, sourcePageId: page.id,
    baseLayoutVersionId: placement.baseLayoutVersionId, masterNumber: placement.masterNumber!, imageAssetSnapshotId: placement.imageAssetSnapshotId,
    itemNameSnapshot: placement.nameSnapshot, attributePurposeSnapshot: placement.attributePurposeSnapshot, ...(placement.locationReference ? { locationReference: placement.locationReference } : {}) };
  if (appendix) { Object.assign(appendix, appendixValues); appendix.updatedByActorUserId = actor.id; appendix.recordVersion = (appendix.recordVersion ?? 0) + 1; }
  else { appendix = { id: id("appendix-row"), organisationId: remediation.organisationId, createdByActorUserId: actor.id, updatedByActorUserId: actor.id, recordVersion: 1,
    remediationId: remediation.id, placementId: placement.id, ...appendixValues }; state.masterAppendixRows.unshift(appendix); }
  return { row, appendix };
}
function pageFinalisationHash(state: AppState, remediation: StageBRemediationRecord, page: ReportPlacementPageRecord) {
  const base = state.remediationBaseLayoutVersions.find((item) => item.id === remediation.baseLayoutVersionId);
  const placements = sortPlacements(state, remediation.id, livePlacements(state, remediation.id).filter((item) => item.pageId === page.id));
  const rows = state.placementImplementationRows.filter((item) => item.remediationId === remediation.id && item.pageId === page.id).sort((a, b) => a.masterNumber - b.masterNumber || a.id.localeCompare(b.id));
  const appendix = state.masterAppendixRows.filter((item) => item.remediationId === remediation.id && item.sourcePageId === page.id).sort((a, b) => a.masterNumber - b.masterNumber || a.id.localeCompare(b.id));
  return deterministicContentHash({ pageId: page.id, pageType: page.pageType, ordinal: page.ordinal, baseLayout: base, placements, implementationRows: rows, appendixRows: appendix });
}
function refreshFinalisationHashes(state: AppState, remediation: StageBRemediationRecord, actor: AppUser) {
  for (const page of orderedPages(state, remediation.id).filter((item) => item.state === "FINALISED")) {
    const finalisationHash = pageFinalisationHash(state, remediation, page);
    if (page.finalisationHash !== finalisationHash) { page.finalisationHash = finalisationHash; page.updatedByActorUserId = actor.id; page.recordVersion = (page.recordVersion ?? 0) + 1; }
  }
}

function resolverValidStageBMethodology(state: AppState, organisationId: string) {
  const methodology = state.methodologyVersions.find((item) => item.organisationId === organisationId && item.module === "STAGE_B_REMEDIAL" && item.lifecycleStatus === "ACTIVE" && item.executionAdapterVersion === STAGE_B_RESOLVER_VERSION && item.sourceAssetHash === STAGE_B_AUTHORITY_HASH);
  if (!methodology) return undefined;
  const rules = state.methodologyRules.filter((item) => item.organisationId === organisationId && item.methodologyVersionId === methodology.id && item.decisionStatus === "APPROVED");
  const fixtures = state.methodologyGoldenFixtures.filter((item) => item.organisationId === organisationId && item.methodologyVersionId === methodology.id && item.decisionStatus === "APPROVED");
  const semanticallyComplete = rules.length === STAGE_B_CANONICAL_REMEDY_MAPPINGS.length
    && STAGE_B_CANONICAL_REMEDY_MAPPINGS.every(({ action, remedialType }) => rules.some((rule) => (rule.conditionJson as { action?: string })?.action === action && (rule.outcomeJson as { remedialType?: string })?.remedialType === remedialType));
  return semanticallyComplete && fixtures.length >= 6 ? methodology : undefined;
}

export function ensureStageBReservation(input: { state?: AppState; caseId: string; floorId: string; actor: AppUser; expectedRecordVersion?: unknown; idempotencyKey?: unknown }) {
  const state = input.state ?? getAppState(); const caseRecord = state.vastuCases.find((item) => item.id === input.caseId);
  const project = caseRecord?.projectId ? state.projects.find((item) => item.id === caseRecord.projectId && item.activeCaseId === caseRecord.id) : undefined;
  const floor = project ? state.floorWorkspaces.find((item) => item.id === input.floorId && item.caseId === caseRecord?.id && item.projectId === project.id) : undefined;
  if (!caseRecord || !project || !floor) return null;
  const architecture = resolveEvaluationArchitecture({ state, caseId: caseRecord.id, floorId: floor.id });
  const isV1 = architecture.caseVersion === "V1" && architecture.floorVersion === "V1";
  const commercialEntitlement = resolveCommercialEntitlementForStageB({ state, caseId: caseRecord.id, projectId: project.id, requireFounderContract: isV1 });
  if (!commercialEntitlement.eligible) return null;
  if (isV1) {
    const readiness = resolveV1FloorWorkflowReadiness(state, caseRecord.id, floor.id);
    if (!readiness.directionalStageAPresented || !readiness.elementalComplete || !readiness.elementalReportReady || readiness.remedyHandoff !== "COMPLETE" || !readiness.stageBInputFinalized) return null;
    const currentInput = state.stageBInputsV1.find((item) => item.caseId === caseRecord.id && item.floorId === floor.id && item.status === "FINALIZED");
    const currentCombined = state.combinedEvaluationReportSnapshots.find((item) => item.id === currentInput?.reportSourceId && item.status === "FINALIZED" && item.caseId === caseRecord.id && item.projectId === project.id && item.floorId === floor.id && item.contentHash === currentInput?.reportSourceHash);
    if (!currentInput || !currentCombined) return null;
  } else {
    const findings = state.postSiteFindings.filter((item) => item.caseId === caseRecord.id && item.floorId === floor.id && item.status === "FOUNDER_APPROVED" && !item.needsRegeneration).sort((a, b) => b.version - a.version)[0];
    if (!findings) return null;
  }
  const stageA = state.reportVersions.find((item) => item.caseId === caseRecord.id && item.floorId === floor.id && item.isPreview && item.artifact?.immutable);
  const v1Presentation = isV1 ? (state.directionalStageAPresentations ?? []).find((item) => item.caseId === caseRecord.id && item.floorId === floor.id && item.status === "PRESENTED") : undefined;
  const v1Card = v1Presentation ? state.directionalReportCardSnapshots.find((item) => item.id === v1Presentation.reportCardSnapshotId && item.status === "FINALIZED" && item.cardStatus === "READY") : undefined;
  if (isV1 ? !v1Presentation || !v1Card : !stageA) return null;
  const existing = state.remedialWorkflowReservations.find((item) => item.caseId === caseRecord.id && item.floorId === floor.id);
  const methodology = resolverValidStageBMethodology(state, caseRecord.organisationId ?? owner(input.actor));
  if (existing) {
    if (existing.status === "BLOCKED_METHOD_INPUT" && methodology) {
      if (input.idempotencyKey === undefined) throw new StageBError("A stable readiness retry key is required to reconcile the blocked reservation.", 428);
      expected(existing, input.expectedRecordVersion, "reservation");
      const retryKey = text(input.idempotencyKey, "Readiness retry key", 160);
      if (existing.idempotencyKey === retryKey) return existing;
      existing.status = "READY_FOR_CONFIGURATION";
      existing.methodologyVersionId = methodology.id;
      existing.idempotencyKey = retryKey;
      existing.updatedByActorUserId = input.actor.id;
      existing.recordVersion = (existing.recordVersion ?? 0) + 1;
    }
    return existing;
  }
  const currentInput = isV1 ? state.stageBInputsV1.find((item) => item.caseId === caseRecord.id && item.floorId === floor.id && item.status === "FINALIZED") : undefined;
  const reservation = { id: id("remedial-reservation"), organisationId: caseRecord.organisationId ?? owner(input.actor), createdByActorUserId: input.actor.id,
    updatedByActorUserId: input.actor.id, recordVersion: 1, projectId: project.id, caseId: caseRecord.id, floorId: floor.id,
    ...(isV1 ? { stageASourceKind: "V1_DIRECTIONAL_STAGE_A" as const, stageASourceId: v1Presentation!.id, stageASourceHash: v1Card!.contentHash, reportSourceId: currentInput!.reportSourceId, reportSourceHash: currentInput!.reportSourceHash } : { stageASourceKind: "LEGACY_STAGE_A_REPORT" as const, stageAReportId: stageA!.id }),
    status: methodology ? "READY_FOR_CONFIGURATION" as const : "BLOCKED_METHOD_INPUT" as const, ...(methodology ? { methodologyVersionId: methodology.id } : {}), createdAt: now() };
  state.remedialWorkflowReservations.unshift(reservation); return reservation;
}

export function initialiseStageB(input: { caseId: unknown; floorId: unknown; reportId?: unknown; reportSourceId?: unknown; idempotencyKey: unknown; expectedRecordVersion: unknown; actor: AppUser }) {
  const state = getAppState();
  const architecture = resolveEvaluationArchitecture({ state, caseId: text(input.caseId, "Case ID"), floorId: text(input.floorId, "Floor ID") });
  const isV1 = architecture.caseVersion === "V1" && architecture.floorVersion === "V1";
  const scoped = isV1
    ? v1Context(state, input.caseId, input.floorId, input.reportSourceId ?? input.reportId, input.actor)
    : context(state, input.caseId, input.floorId, input.reportId, input.actor);
  const v1Report = isV1 ? scoped.report as CombinedEvaluationReportSnapshotV1 : undefined;
  const legacyReport = isV1 ? undefined : scoped.report as ReportVersionRecord;
  const sourceId = isV1 ? scoped.report.id : undefined;
  const key = text(input.idempotencyKey, "Idempotency key"); const requestHash = deterministicContentHash({ caseId: scoped.caseRecord.id, floorId: scoped.floor.id, reportSourceKind: isV1 ? "V1_COMBINED_EVALUATION_REPORT" : "LEGACY_REPORT_VERSION", reportSourceId: sourceId ?? scoped.report.id });
  const replay = state.stageBRemediations.find((item) => item.organisationId === owner(input.actor) && item.idempotencyKey === key);
  if (replay) {
    if (replay.requestHash !== requestHash) throw new StageBError("This idempotency key was already used with different Stage B inputs.", 409);
    const pages = orderedPages(state, replay.id); return { remediation: replay, pages, page: pages[0] };
  }
  expected(scoped.caseRecord, input.expectedRecordVersion, "case");
  const reservation = ensureStageBReservation({ state, caseId: scoped.caseRecord.id, floorId: scoped.floor.id, actor: input.actor });
  const stageASourceMatches = Boolean(reservation && (isV1
    ? reservation.stageASourceKind === "V1_DIRECTIONAL_STAGE_A"
    : "stageAReportId" in reservation && reservation.stageAReportId === scoped.report.id));
  if (!stageASourceMatches) throw new StageBError("Stage B requires the authoritative architecture-specific Stage A source, confirmed full balance, and the required protected report context.", 409);
  const planId = legacyReport?.artifact?.planVersionId;
  const plan = isV1
    ? state.planVersions.filter((item) => item.caseId === scoped.caseRecord.id && item.floorId === scoped.floor.id && item.protectedFileRef).sort((a, b) => b.id.localeCompare(a.id))[0]
    : state.planVersions.find((item) => item.id === planId && item.caseId === scoped.caseRecord.id && item.floorId === scoped.floor.id);
  if (!plan || !plan.protectedFileRef) throw new StageBError("The authoritative Existing Layout cannot be derived from Stage A evidence lineage.", 409);
  const remediation: StageBRemediationRecord = { id: id("stage-b"), organisationId: owner(input.actor), createdByActorUserId: input.actor.id, updatedByActorUserId: input.actor.id, recordVersion: 1,
    projectId: scoped.project.id, caseId: scoped.caseRecord.id, floorId: scoped.floor.id,
    ...(isV1 ? { reportSourceKind: "V1_COMBINED_EVALUATION_REPORT" as const, reportSourceId: v1Report!.id, reportSourceHash: v1Report!.contentHash, reportTemplateVersion: v1Report!.reportTemplateVersion, architectureVersion: "V1" as const } : { reportId: legacyReport!.id, reportSourceKind: "LEGACY_REPORT_VERSION" as const, reportSourceId: legacyReport!.id, architectureVersion: "LEGACY" as const }), state: "NOT_STARTED",
    existingLayoutAssetId: plan.protectedFileRef, existingLayoutAssetVersionId: plan.id, existingLayoutSnapshotId: deterministicContentHash(plan), idempotencyKey: key, requestHash, createdAt: now() };
  const pages: ReportPlacementPageRecord[] = STAGE_B_REMEDY_PAGES.map((configuration) => ({ id: id("placement-page"), organisationId: owner(input.actor), createdByActorUserId: input.actor.id, updatedByActorUserId: input.actor.id, recordVersion: 1,
    remediationId: remediation.id, ...stageBRecordLineageFields(state, remediation), caseId: scoped.caseRecord.id, floorId: scoped.floor.id, section: "B", pageType: configuration.pageType, ordinal: configuration.ordinal, state: "DRAFT" }));
  state.stageBRemediations.unshift(remediation); state.reportPlacementPages.unshift(...pages); scoped.caseRecord.recordVersion = (scoped.caseRecord.recordVersion ?? 0) + 1;
  addTimeline(state, scoped.caseRecord.id, input.actor, "Stage B remediation opened", `${scoped.floor.floorLabel} five-page remedy sequence opened from immutable Stage A layout lineage.`);
  return { remediation, pages, page: pages[0] };
}

export function createRevisedLayoutCandidate(input: { remediationId: unknown; purpose: unknown; evidenceRef: unknown; sourceAssetId?: unknown; sourceFileName?: unknown; sourceMimeType?: unknown; sourceSizeBytes?: unknown; checksumSha256?: unknown; label: unknown; idempotencyKey: unknown; expectedRecordVersion: unknown; actor: AppUser }) {
  const state = getAppState(); const scoped = remediationContext(state, input.remediationId, input.actor); const key = text(input.idempotencyKey, "Idempotency key");
  if (input.purpose !== "REVISED_FURNITURE_LAYOUT") throw new StageBError("The candidate purpose must be REVISED_FURNITURE_LAYOUT.", 400);
  const evidenceRef = text(input.evidenceRef, "Protected revised-layout file"); const label = text(input.label, "Revised-layout label", 120);
  if (scoped.remediation.state !== "NOT_STARTED") throw new StageBError("Revised-layout candidates can only be added before Stage B configuration starts.", 409);
  const replay = state.revisedLayoutCandidates.find((item) => item.organisationId === owner(input.actor) && item.idempotencyKey === key);
  if (replay) return { candidate: replay, replayed: true };
  if (state.revisedLayoutCandidates.some((item) => item.organisationId === owner(input.actor) && item.caseId === scoped.caseRecord.id && item.floorId === scoped.floor.id && item.evidenceRef === evidenceRef && item.status !== "WITHDRAWN")) {
    throw new StageBError("This protected file is already a revised-layout candidate for the exact floor.", 409);
  }
  if (evidenceRef === scoped.remediation.existingLayoutAssetId || state.planVersions.some((item) => item.caseId === scoped.caseRecord.id && item.floorId === scoped.floor.id && item.protectedFileRef === evidenceRef)
    || state.spatialEvidenceVersions.some((item) => item.caseId === scoped.caseRecord.id && item.protectedFileRef === evidenceRef)
    || state.siteEvaluationEvidenceVersions.some((item) => item.caseId === scoped.caseRecord.id && item.floorId === scoped.floor.id && item.evidenceRef === evidenceRef)) {
    throw new StageBError("Existing plan or site/spatial evidence cannot be classified as a revised furniture layout.", 409);
  }
  expected(scoped.remediation, input.expectedRecordVersion, "remediation");
  const candidate: RevisedLayoutCandidateRecord = {
    id: id("revised-layout-candidate"), organisationId: owner(input.actor), createdByActorUserId: input.actor.id, updatedByActorUserId: input.actor.id, recordVersion: 1,
    projectId: scoped.project.id, caseId: scoped.caseRecord.id, floorId: scoped.floor.id, evidenceRef,
    ...(input.sourceAssetId === undefined ? {} : { sourceAssetId: text(input.sourceAssetId, "Source asset ID") }),
    ...(input.sourceFileName === undefined ? {} : { sourceFileName: text(input.sourceFileName, "Source filename", 255) }),
    ...(input.sourceMimeType === undefined ? {} : { sourceMimeType: text(input.sourceMimeType, "Source MIME type", 120) }),
    ...(input.sourceSizeBytes === undefined ? {} : { sourceSizeBytes: Number(input.sourceSizeBytes) }),
    checksumSha256: text(input.checksumSha256, "Source checksum", 128), purpose: "REVISED_FURNITURE_LAYOUT", label, version: 1, status: "DRAFT", createdAt: now(), idempotencyKey: key,
    requestHash: deterministicContentHash({ remediationId: scoped.remediation.id, evidenceRef, label, checksumSha256: input.checksumSha256 })
  };
  state.revisedLayoutCandidates.unshift(candidate); scoped.remediation.updatedByActorUserId = input.actor.id; scoped.remediation.recordVersion = (scoped.remediation.recordVersion ?? 0) + 1;
  addTimeline(state, scoped.caseRecord.id, input.actor, "Revised Layout candidate uploaded", `${label} was uploaded as a Draft candidate for ${scoped.floor.floorLabel}; Founder approval is still required.`);
  return { candidate, replayed: false };
}

export function approveRevisedLayoutCandidate(input: { candidateId: unknown; reason: unknown; idempotencyKey: unknown; expectedRecordVersion: unknown; actor: AppUser }) {
  if (input.actor.role !== "SUPER_ADMIN") throw new StageBError("Only the Founder/SUPER_ADMIN can approve a revised-layout candidate.", 403);
  const state = getAppState(); const candidateId = text(input.candidateId, "Candidate ID"); const reason = text(input.reason, "Approval reason", 500); const key = text(input.idempotencyKey, "Idempotency key");
  const candidate = state.revisedLayoutCandidates.find((item) => item.id === candidateId && item.organisationId === owner(input.actor));
  if (!candidate) throw new StageBError("Revised-layout candidate was not found in the active organisation.", 404);
  if (candidate.status === "APPROVED" || candidate.status === "AVAILABLE") return { candidate, replayed: true };
  if (candidate.status !== "DRAFT") throw new StageBError("Only Draft revised-layout candidates can be approved.", 409);
  expected(candidate, input.expectedRecordVersion, "candidate"); candidate.status = "APPROVED"; candidate.approvedAt = now(); candidate.approvedByActorUserId = input.actor.id; candidate.approvalReason = reason; candidate.updatedByActorUserId = input.actor.id; candidate.recordVersion = (candidate.recordVersion ?? 0) + 1;
  const floor = state.floorWorkspaces.find((item) => item.id === candidate.floorId); addTimeline(state, candidate.caseId, input.actor, "Revised Layout candidate approved", `${candidate.label} is approved for ${floor?.floorLabel ?? "the exact floor"} and is now eligible for Founder A2 selection.`);
  return { candidate, replayed: false, idempotencyKey: key };
}

export function selectFinalRevisedLayout(input: { remediationId: unknown; candidateId: unknown; expectedRecordVersion: unknown; idempotencyKey: unknown; actor: AppUser }) {
  const state = getAppState(); const scoped = remediationContext(state, input.remediationId, input.actor);
  const key = text(input.idempotencyKey, "Idempotency key"); const candidateId = text(input.candidateId, "Candidate ID");
  if (orderedPages(state, scoped.remediation.id).some((page) => page.state === "FINALISED") || state.remediationBaseLayoutVersions.some((item) => item.remediationId === scoped.remediation.id && item.state === "LOCKED")) throw new StageBError("The final revised layout cannot change after the first remedy page is finalised.", 409);
  const candidate = state.revisedLayoutCandidates.find((item) => item.id === candidateId && item.organisationId === owner(input.actor) && item.projectId === scoped.project.id && item.caseId === scoped.caseRecord.id && item.floorId === scoped.floor.id && ["APPROVED", "AVAILABLE"].includes(item.status));
  if (!candidate) throw new StageBError("Revised-layout candidate was not found in this floor.", 404);
  const current = state.remediationBaseLayoutVersions.find((item) => item.remediationId === scoped.remediation.id && item.state === "SELECTED");
  if (current?.candidateId === candidate.id) return { remediation: scoped.remediation, baseLayout: current, invalidatedPlacementIds: [] as string[] };
  expected(scoped.remediation, input.expectedRecordVersion, "remediation");
  if (current) current.state = "SUPERSEDED";
  const versionNumber = Math.max(0, ...state.remediationBaseLayoutVersions.filter((item) => item.remediationId === scoped.remediation.id).map((item) => item.versionNumber)) + 1;
  const baseLayout = { id: id("base-layout"), organisationId: owner(input.actor), createdByActorUserId: input.actor.id, updatedByActorUserId: input.actor.id, recordVersion: 1,
    remediationId: scoped.remediation.id, projectId: scoped.project.id, caseId: scoped.caseRecord.id, floorId: scoped.floor.id, candidateId: candidate.id,
    assetId: candidate.evidenceRef, assetVersionId: candidate.id, assetContentHash: candidate.checksumSha256, snapshotId: deterministicContentHash(candidate),
    versionNumber, state: "SELECTED" as const, selectedAt: now(), selectedBy: input.actor.id };
  state.remediationBaseLayoutVersions.unshift(baseLayout);
  const invalidatedPlacementIds: string[] = [];
  for (const placement of liveReportPlacements(state, scoped.remediation.id).filter((item) => item.dependencyReviewState === "CURRENT")) {
    placement.dependencyReviewState = "NEEDS_REVIEW"; placement.updatedByActorUserId = input.actor.id; placement.recordVersion = (placement.recordVersion ?? 0) + 1; invalidatedPlacementIds.push(placement.id);
    const invalidation: DependencyInvalidationRecord = { id: id("invalidation"), organisationId: owner(input.actor), createdByActorUserId: input.actor.id, updatedByActorUserId: input.actor.id, recordVersion: 0,
      projectId: scoped.project.id, caseId: scoped.caseRecord.id, floorId: scoped.floor.id, targetType: placement.placementType === "REMEDY" ? "STAGE_B_PLACEMENT" : "SECTION_A_PLACEMENT", targetId: placement.id,
      causeType: "PLAN", sourceVersionId: baseLayout.id, dependencyLinks: [placement.baseLayoutVersionId, baseLayout.id, placement.id], status: "NEEDS_REGENERATION",
      reason: "Final Revised Layout selection changed; preserve coordinates and explicitly reconcile the physical placement.", createdAt: now() };
    state.dependencyInvalidations.unshift(invalidation);
  }
  for (const composition of state.colourFrameCompositions.filter((item) => item.remediationId === scoped.remediation.id && item.state !== "DELETED" && item.dependencyReviewState === "CURRENT")) {
    composition.dependencyReviewState = "NEEDS_REVIEW"; composition.updatedByActorUserId = input.actor.id; composition.recordVersion = (composition.recordVersion ?? 0) + 1;
    state.dependencyInvalidations.unshift({ id: id("invalidation"), organisationId: owner(input.actor), createdByActorUserId: input.actor.id, updatedByActorUserId: input.actor.id, recordVersion: 0,
      projectId: scoped.project.id, caseId: scoped.caseRecord.id, floorId: scoped.floor.id, targetType: "COLOUR_FRAME_COMPOSITION", targetId: composition.id,
      causeType: "PLAN", sourceVersionId: baseLayout.id, dependencyLinks: [composition.baseLayoutVersionId, baseLayout.id, composition.id], status: "NEEDS_REGENERATION",
      reason: "Final Revised Layout selection changed; preserve the Colour Frame composition and explicitly reconcile it.", createdAt: now() });
  }
  scoped.remediation.finalRevisedLayoutCandidateId = candidate.id; scoped.remediation.finalRevisedLayoutAssetId = candidate.evidenceRef;
  scoped.remediation.finalRevisedLayoutAssetVersionId = candidate.id; scoped.remediation.baseLayoutVersionId = baseLayout.id; scoped.remediation.state = "LAYOUT_SELECTED";
  scoped.remediation.updatedByActorUserId = input.actor.id; scoped.remediation.recordVersion = (scoped.remediation.recordVersion ?? 0) + 1;
  addTimeline(state, scoped.caseRecord.id, input.actor, "Final Revised Layout selected", `${candidate.label} selected for ${scoped.floor.floorLabel}; ${invalidatedPlacementIds.length} placement(s) require review.`);
  return { remediation: scoped.remediation, baseLayout, invalidatedPlacementIds, idempotencyKey: key };
}

export function adaptStageBSourceFraming(value: string) { return SOURCE_FRAMING_TO_REMEDY_TYPE[value]; }

export function resolveEligibleRemedies(input: { remediationId: unknown; verdictId?: unknown; stageBInputId?: unknown; remedialType: unknown; refresh?: unknown; idempotencyKey: unknown; expectedRecordVersion: unknown; actor: AppUser }) {
  const state = getAppState(); const scoped = remediationContext(state, input.remediationId, input.actor);
  const key = text(input.idempotencyKey, "Idempotency key"); const requestedType = remedyType(input.remedialType); const refreshRequested = input.refresh === true || input.refresh === "true";
  const page = orderedPages(state, scoped.remediation.id).find((item) => item.pageType === requestedType);
  if (!page) throw new StageBError("The requested remedy page was not found in this remediation.", 404);
  const methodology = state.methodologyVersions.find((item) => item.organisationId === owner(input.actor) && item.module === "STAGE_B_REMEDIAL" && item.lifecycleStatus === "ACTIVE" && item.executionAdapterVersion === STAGE_B_RESOLVER_VERSION && item.sourceAssetHash === STAGE_B_AUTHORITY_HASH);
  if (!methodology) throw new StageBError("An approved authority-bound Stage B methodology is required.", 409);
  const rules = state.methodologyRules.filter((item) => item.methodologyVersionId === methodology.id && item.decisionStatus === "APPROVED");
  const fixtures = state.methodologyGoldenFixtures.filter((item) => item.methodologyVersionId === methodology.id && item.decisionStatus === "APPROVED");
  if (rules.length < 5 || fixtures.length < 6) throw new StageBError("Stage B methodology requires five approved framing rules and six approved golden fixtures.", 409);
  const stageBInputId = input.stageBInputId === undefined ? undefined : text(input.stageBInputId, "Stage B V1 input ID");
  const legacyVerdictId = input.verdictId === undefined ? undefined : text(input.verdictId, "Verdict ID");
  const v1Input = stageBInputId ? state.stageBInputsV1.find((item) => item.id === stageBInputId && item.organisationId === owner(input.actor) && item.caseId === scoped.caseRecord.id && item.floorId === scoped.floor.id && item.status === "FINALIZED") : undefined;
  if (stageBInputId && !v1Input) throw new StageBError("Finalized V1 Stage B input was not found.", 404);
  const normalizedInputs = v1Input ? normalizeStageBInputsV1(v1Input, requestedType) : [];
  const normalized = normalizedInputs[0];
  const verdict = !v1Input && legacyVerdictId ? state.utilityVerdicts.find((item) => item.id === legacyVerdictId && item.caseId === scoped.caseRecord.id && item.floorId === scoped.floor.id && item.status === "APPROVED" && (scoped.report as ReportVersionRecord).artifact?.utilityVerdictIds?.includes(item.id)) : undefined;
  if (!v1Input && !verdict) throw new StageBError("Approved immutable Stage A verdict input was not found.", 404);
  const mappedType = v1Input ? normalized?.stageBRemedyType : (verdict?.solutionFraming ? adaptStageBSourceFraming(verdict.solutionFraming) : undefined);
  const sourceId = v1Input ? v1Input.id : legacyVerdictId!;
  const sourceHash = v1Input ? v1Input.deterministicOutputHash : verdict!.outputHash;
  const sourceElement = v1Input ? normalized?.element : verdict!.element;
  const sourceDirections = v1Input ? normalized?.directions : [...verdict!.directionSet, ...verdict!.triggeredDirections];
  const requestHash = deterministicContentHash({ remediationId: scoped.remediation.id, sourceKind: v1Input ? "V1_ELEMENTAL" : "LEGACY_UTILITY", sourceId, remedialType: requestedType, methodologyVersionId: methodology.id });
  const replay = state.remedyEligibilityResolutions.filter((item) => item.remediationId === scoped.remediation.id && item.idempotencyKey === key);
  if (replay.length) { if (replay.some((item) => item.requestHash !== requestHash)) throw new StageBError("This idempotency key was used with different remedy-resolution inputs.", 409); return { verdictId: sourceId, methodologyVersionId: methodology.id, eligible: replay }; }
  expected(scoped.remediation, input.expectedRecordVersion, "remediation");
  if (!mappedType || mappedType !== requestedType) return { verdictId: sourceId, methodologyVersionId: methodology.id, eligible: [] as RemedyEligibilityResolutionRecord[] };
  const matchedRule = rules.find((item) => (item.outcomeJson as { remedialType?: string })?.remedialType === mappedType);
  if (!matchedRule) throw new StageBError("The active Stage B methodology has no approved rule for this verdict framing.", 409);
  const eligible: RemedyEligibilityResolutionRecord[] = []; const candidates: RemedyEligibilityResolutionRecord[] = [];
  const sourceScope: RemedySourceScope = { organisationId: owner(input.actor), caseId: scoped.caseRecord.id, floorId: scoped.floor.id,
    remediationId: scoped.remediation.id, pageId: page.id, remedialType: mappedType };
  const addResolution = (remedyId: string, explanationCodes: string[], specificDirection?: string) => {
    const source = resolveRemedySource(state, remedyId, sourceScope); if (!source) return;
    const remedy = source.record;
    const asset = state.mediaAssetVersions.find((item) => item.id === remedy.preferredAssetVersionId && item.assetId === remedy.preferredAssetId && (!item.organisationId || item.organisationId === owner(input.actor)) && ["FOUNDER_APPROVED", "ACTIVE"].includes(item.status)); if (!asset) return;
    const payload = { sourceId, sourceKind: v1Input ? "V1_ELEMENTAL" : "LEGACY_UTILITY", verdictOutputHash: sourceHash, methodologyVersionId: methodology.id, methodologyContentHash: methodology.contentHash, ruleId: matchedRule.id, remedyId: remedy.id, remedyRecordVersion: remedy.recordVersion ?? 0, remedyAssetVersionId: asset.id };
    const resolution: RemedyEligibilityResolutionRecord = { id: id("eligibility"), organisationId: owner(input.actor), createdByActorUserId: input.actor.id, updatedByActorUserId: input.actor.id, recordVersion: 1,
      remediationId: scoped.remediation.id, caseId: scoped.caseRecord.id, floorId: scoped.floor.id, verdictId: sourceId, verdictContentHash: sourceHash,
      ...(v1Input ? { sourceKind: "V1_ELEMENTAL" as const, sourceInputId: v1Input.id, sourceInputHash: v1Input.deterministicOutputHash, ...(specificDirection ? { specificDirection } : {}) } : {}),
      methodologyVersionId: methodology.id, methodologyContentHash: methodology.contentHash, resolverVersion: STAGE_B_RESOLVER_VERSION, remedialType: mappedType,
      remedyId: remedy.id, remedyRecordVersion: remedy.recordVersion ?? 0, remedyAssetVersionId: asset.id, eligibilityRuleIds: [matchedRule.id], explanationCodes,
      resolvedAt: now(), resolutionHash: deterministicContentHash(payload), status: "ELIGIBLE", idempotencyKey: key, requestHash };
    candidates.push(resolution);
  };
  const contexts = v1Input ? normalizedInputs : [{ element: sourceElement, directions: sourceDirections, specificDirection: sourceDirections?.[0] }];
  const resolvedRemedyIds = new Set<string>();
  for (const context of contexts) {
    const contextDirections = new Set(context.directions ?? []);
    for (const remedy of state.remedyRepositoryRecords.filter((item) => item.organisationId === owner(input.actor) && item.status === "APPROVED" && item.remedialType === mappedType && (!item.elements.length || item.elements.some((element) => element.toUpperCase() === context.element?.toUpperCase())) && (!item.directions.length || (context.directions !== undefined && item.directions.some((item) => contextDirections.has(item)))))) {
      if (!resolvedRemedyIds.has(remedy.id)) { addResolution(remedy.id, ["SOLUTION_FRAMING_MATCH", "REPOSITORY_SCOPE_MATCH"], context.directions?.[0]); resolvedRemedyIds.add(remedy.id); }
    }
    for (const remedy of state.caseUsedRemedyRecords.filter((item) => item.organisationId === sourceScope.organisationId && item.caseId === sourceScope.caseId
      && item.floorId === sourceScope.floorId && item.remediationId === sourceScope.remediationId && item.pageId === sourceScope.pageId
      && item.remedialType === sourceScope.remedialType && item.status === "ACTIVE")) {
      if (!resolvedRemedyIds.has(remedy.id)) { addResolution(remedy.id, ["SOLUTION_FRAMING_MATCH", "CASE_USED_EXACT_SCOPE_MATCH"], context.directions?.[0]); resolvedRemedyIds.add(remedy.id); }
    }
  }
  const current = state.remedyEligibilityResolutions.filter((item) => item.remediationId === scoped.remediation.id && item.caseId === scoped.caseRecord.id && item.floorId === scoped.floor.id
    && item.remedialType === mappedType && item.verdictId === sourceId && item.verdictContentHash === sourceHash && item.methodologyVersionId === methodology.id && item.status === "ELIGIBLE");
  const signature = (item: RemedyEligibilityResolutionRecord) => [item.remedyId, item.remedyRecordVersion, item.remedyAssetVersionId, item.specificDirection ?? "", item.sourceInputHash ?? "", item.verdictContentHash, item.methodologyContentHash].join("|");
  const currentSignatures = current.map(signature).sort(); const candidateSignatures = candidates.map(signature).sort();
  const unchanged = currentSignatures.length === candidateSignatures.length && currentSignatures.every((value, index) => value === candidateSignatures[index]);
  if (unchanged) return { verdictId: sourceId, methodologyVersionId: methodology.id, eligible: current };
  if (current.length && !refreshRequested) return { verdictId: sourceId, methodologyVersionId: methodology.id, eligible: current };
  if (current.length) for (const item of current) {
    item.status = "INVALIDATED"; item.invalidatedAt = now(); item.invalidationReason = "Superseded by an explicit governed eligibility refresh.";
    item.updatedByActorUserId = input.actor.id; item.recordVersion = (item.recordVersion ?? 0) + 1;
  }
  for (const candidate of candidates) { state.remedyEligibilityResolutions.unshift(candidate); eligible.push(candidate); }
  return { verdictId: sourceId, methodologyVersionId: methodology.id, eligible };
}

function completeReconciliation(state: AppState, placement: PhysicalPlacementRecord, invalidationIdValue: unknown, baseLayoutVersionId: string, actor: AppUser) {
  const invalidationId = text(invalidationIdValue, "Invalidation ID"); const invalidation = completeRemediationReconciliation({ state, invalidationId,
    targetType: "STAGE_B_PLACEMENT", targetId: placement.id, sourceVersionId: placement.baseLayoutVersionId, replacementVersionId: baseLayoutVersionId, actor,
    reason: "Consultant explicitly reconciled the unchanged normalized coordinates to the newly selected Final Revised Layout." });
  if (!invalidation) throw new StageBError("Open placement regeneration record was not found.", 409);
}

export function upsertRemedyPlacement(input: { remediationId: unknown; pageId: unknown; placementId?: unknown; eligibilityResolutionId: unknown; baseLayoutVersionId: unknown; placementType?: unknown; anchorX: unknown; anchorY: unknown; calloutX: unknown; calloutY: unknown; calloutWidth: unknown; calloutHeight: unknown; locationReference?: unknown; showCircle: unknown; showFrame: unknown; showHighlight: unknown; completePlacement: unknown; reconcileInvalidationId?: unknown; idempotencyKey: unknown; expectedRecordVersion: unknown; actor: AppUser }) {
  const state = getAppState(); const scoped = remediationContext(state, input.remediationId, input.actor);
  const page = state.reportPlacementPages.find((item) => item.id === text(input.pageId, "Page ID") && item.remediationId === scoped.remediation.id && item.organisationId === owner(input.actor)
    && stageBChildMatchesRemediation(state, scoped.remediation, item) && item.caseId === scoped.caseRecord.id && item.floorId === scoped.floor.id && item.section === "B" && REMEDY_TYPES.has(item.pageType as StageBRemedyType) && item.state === "DRAFT");
  if (!page) throw new StageBError("Editable Stage B remedy page was not found in this report and floor.", 404);
  if (input.placementType !== undefined && input.placementType !== "REMEDY") throw new StageBError("Only REMEDY placements participate in this Stage B sequence.");
  const base = state.remediationBaseLayoutVersions.find((item) => item.id === text(input.baseLayoutVersionId, "Base-layout version ID") && item.id === scoped.remediation.baseLayoutVersionId
    && item.remediationId === scoped.remediation.id && item.projectId === scoped.project.id && item.caseId === scoped.caseRecord.id && item.floorId === scoped.floor.id && ["SELECTED", "LOCKED"].includes(item.state));
  if (!base) throw new StageBError("Use the currently selected or first-page-locked Final Revised Layout.", 409);
  const resolution = state.remedyEligibilityResolutions.find((item) => item.id === text(input.eligibilityResolutionId, "Eligibility resolution ID") && item.remediationId === scoped.remediation.id
    && item.caseId === scoped.caseRecord.id && item.floorId === scoped.floor.id && item.remedialType === page.pageType && item.status === "ELIGIBLE");
  if (!resolution) throw new StageBError("Eligible remedy resolution does not belong to this remedy page, report, and floor.", 404);
  const source = resolveRemedySource(state, resolution.remedyId, { organisationId: owner(input.actor), caseId: scoped.caseRecord.id, floorId: scoped.floor.id,
    remediationId: scoped.remediation.id, pageId: page.id, remedialType: page.pageType as StageBRemedyType });
  const remedy = source?.record && (source.record.recordVersion ?? 0) === resolution.remedyRecordVersion ? source.record : undefined;
  const asset = state.mediaAssetVersions.find((item) => item.id === resolution.remedyAssetVersionId && item.assetId === remedy?.preferredAssetId && (!item.organisationId || item.organisationId === owner(input.actor)));
  if (!remedy || !asset) throw new StageBError("Approved page-matched remedy asset snapshot cannot be resolved.", 409);
  const anchorX = point(input.anchorX, "Anchor X"), anchorY = point(input.anchorY, "Anchor Y"), calloutX = point(input.calloutX, "Callout X"), calloutY = point(input.calloutY, "Callout Y"), calloutWidth = point(input.calloutWidth, "Callout width"), calloutHeight = point(input.calloutHeight, "Callout height");
  if (calloutWidth <= 0 || calloutHeight <= 0 || calloutX + calloutWidth > 1 || calloutY + calloutHeight > 1) throw new StageBError("Callout must have positive dimensions and remain inside normalized printable bounds.");
  const key = text(input.idempotencyKey, "Idempotency key"); const requestHash = deterministicContentHash({ pageId: page.id, resolutionId: resolution.id, baseLayoutVersionId: base.id, anchorX, anchorY, calloutX, calloutY, calloutWidth, calloutHeight, locationReference: input.locationReference ?? null, completePlacement: Boolean(input.completePlacement) });
  const replay = state.physicalPlacements.find((item) => item.remediationId === scoped.remediation.id && item.idempotencyKey === key);
  if (replay) { if (replay.requestHash !== requestHash) throw new StageBError("This placement idempotency key was used with different geometry.", 409); return replay; }
  expected(scoped.remediation, input.expectedRecordVersion, "remediation");
  const placementId = input.placementId === undefined ? undefined : text(input.placementId, "Placement ID");
  let placement = placementId ? state.physicalPlacements.find((item) => item.id === placementId && item.remediationId === scoped.remediation.id && item.pageId === page.id
    && item.caseId === scoped.caseRecord.id && item.floorId === scoped.floor.id && stageBChildMatchesRemediation(state, scoped.remediation, item) && item.state !== "DELETED") : undefined;
  if (placementId && !placement) throw new StageBError("Editable placement was not found on this remedy page.", 404);
  if (placement?.dependencyReviewState === "NEEDS_REVIEW") { completeReconciliation(state, placement, input.reconcileInvalidationId, base.id, input.actor); placement.dependencyReviewState = "CURRENT"; }
  const values = { baseLayoutVersionId: base.id, eligibilityResolutionId: resolution.id, remedyId: remedy.id, anchorX, anchorY, anchorLocked: Boolean(input.completePlacement), calloutX, calloutY, calloutWidth, calloutHeight,
    imageAssetId: asset.assetId, imageAssetVersionId: asset.id, imageAssetSnapshotId: deterministicContentHash({ assetId: asset.assetId, versionId: asset.id, checksumSha256: asset.checksumSha256 }),
    nameSnapshot: remedy.name, attributePurposeSnapshot: remedy.attributePurpose, ...(typeof input.locationReference === "string" && input.locationReference.trim() ? { locationReference: input.locationReference.trim().slice(0, 300) } : {}),
    showCircle: Boolean(input.showCircle), showFrame: Boolean(input.showFrame), showHighlight: Boolean(input.showHighlight), state: Boolean(input.completePlacement) ? "LOCKED" as const : "ACTIVE" as const,
    dependencyReviewState: "CURRENT" as const, idempotencyKey: key, requestHash, updatedByActorUserId: input.actor.id };
  if (placement) { Object.assign(placement, values); placement.recordVersion = (placement.recordVersion ?? 0) + 1; }
  else {
    const provisionalNumber = Math.max(0, ...liveReportPlacements(state, scoped.remediation.id).map((item) => item.masterNumber ?? 0)) + 1;
    placement = { id: id("placement"), organisationId: owner(input.actor), createdByActorUserId: input.actor.id, recordVersion: 1, remediationId: scoped.remediation.id,
      caseId: scoped.caseRecord.id, floorId: scoped.floor.id, ...stageBRecordLineageFields(state, scoped.remediation), pageId: page.id, placementType: "REMEDY", masterNumber: provisionalNumber, ...values };
    state.physicalPlacements.unshift(placement);
  }
  page.baseLayoutVersionId = base.id; page.updatedByActorUserId = input.actor.id; page.recordVersion = (page.recordVersion ?? 0) + 1;
  scoped.remediation.state = "EDITING"; scoped.remediation.updatedByActorUserId = input.actor.id; scoped.remediation.recordVersion = (scoped.remediation.recordVersion ?? 0) + 1;
  resequencePlacements(state, scoped.remediation.id, input.actor); refreshFinalisationHashes(state, scoped.remediation, input.actor);
  return placement;
}

export function deleteRemedyPlacement(input: { remediationId: unknown; pageId: unknown; placementId: unknown; idempotencyKey: unknown; expectedRecordVersion: unknown; actor: AppUser }) {
  const state = getAppState(); const scoped = remediationContext(state, input.remediationId, input.actor); const pageId = text(input.pageId, "Page ID"); const placementId = text(input.placementId, "Placement ID");
  const page = state.reportPlacementPages.find((item) => item.id === pageId && item.remediationId === scoped.remediation.id && item.organisationId === owner(input.actor)
    && stageBChildMatchesRemediation(state, scoped.remediation, item) && item.caseId === scoped.caseRecord.id && item.floorId === scoped.floor.id && item.section === "B" && REMEDY_TYPES.has(item.pageType as StageBRemedyType));
  if (!page) throw new StageBError("Stage B remedy page was not found in this report and floor.", 404);
  const placement = state.physicalPlacements.find((item) => item.id === placementId && item.remediationId === scoped.remediation.id && item.pageId === page.id
    && stageBChildMatchesRemediation(state, scoped.remediation, item) && item.caseId === scoped.caseRecord.id && item.floorId === scoped.floor.id && item.placementType === "REMEDY");
  if (!placement) throw new StageBError("Saved remedy placement was not found on this page.", 404);
  const key = text(input.idempotencyKey, "Idempotency key"); const requestHash = deterministicContentHash({ remediationId: scoped.remediation.id, pageId: page.id, placementId: placement.id });
  if (placement.state === "DELETED") {
    if (placement.deletionIdempotencyKey !== key || placement.deletionRequestHash !== requestHash) throw new StageBError("This placement was already deleted by another request.", 409);
    return { deletedPlacementId: placement.id, placements: sortPlacements(state, scoped.remediation.id) };
  }
  if (page.state !== "DRAFT" || scoped.remediation.state === "PAGE_FINALISED") throw new StageBError("A finalised remedy placement cannot be deleted.", 409);
  expected(scoped.remediation, input.expectedRecordVersion, "remediation");
  placement.state = "DELETED"; placement.deletedAt = now(); placement.deletedBy = input.actor.id; placement.deletionIdempotencyKey = key; placement.deletionRequestHash = requestHash;
  placement.updatedByActorUserId = input.actor.id; placement.recordVersion = (placement.recordVersion ?? 0) + 1;
  state.placementImplementationRows = state.placementImplementationRows.filter((item) => item.placementId !== placement.id);
  state.masterAppendixRows = state.masterAppendixRows.filter((item) => item.placementId !== placement.id);
  const placements = resequencePlacements(state, scoped.remediation.id, input.actor); refreshFinalisationHashes(state, scoped.remediation, input.actor);
  page.recordVersion = (page.recordVersion ?? 0) + 1; page.updatedByActorUserId = input.actor.id;
  scoped.remediation.recordVersion = (scoped.remediation.recordVersion ?? 0) + 1; scoped.remediation.updatedByActorUserId = input.actor.id;
  addTimeline(state, scoped.caseRecord.id, input.actor, "Stage B remedy placement deleted", `${page.pageType} placement removed; editable remedy master numbers were resequenced.`);
  return { deletedPlacementId: placement.id, placements };
}

function integritySnapshot(state: AppState, remediation: StageBRemediationRecord) {
  const pages = orderedPages(state, remediation.id); const base = state.remediationBaseLayoutVersions.find((item) => item.id === remediation.baseLayoutVersionId);
  const placements = sortPlacements(state, remediation.id); const placementIds = new Set(placements.map((item) => item.id));
  const rows = state.placementImplementationRows.filter((item) => item.remediationId === remediation.id && placementIds.has(item.placementId)).sort((a, b) => a.masterNumber - b.masterNumber || a.id.localeCompare(b.id));
  const appendix = state.masterAppendixRows.filter((item) => item.remediationId === remediation.id && placementIds.has(item.placementId)).sort((a, b) => a.masterNumber - b.masterNumber || a.id.localeCompare(b.id));
  return { remediation, pages, base, placements, rows, appendix };
}
function integrity(state: AppState, remediation: StageBRemediationRecord, actor: AppUser) {
  const issues: StageBIntegrityRunRecord["issues"] = []; const snapshot = integritySnapshot(state, remediation);
  const { pages, base, placements, rows, appendix } = snapshot;
  if (pages.length !== STAGE_B_REMEDY_PAGES.length) issues.push({ code: "REMEDY_PAGE_COUNT_INVALID", entityType: "PAGE" });
  for (const configuration of STAGE_B_REMEDY_PAGES) {
    const matches = pages.filter((page) => page.pageType === configuration.pageType && page.ordinal === configuration.ordinal && page.section === "B");
    if (matches.length !== 1) issues.push({ code: "REMEDY_PAGE_ORDER_INVALID", entityType: "PAGE", field: configuration.pageType });
  }
  for (const page of pages) {
    if (!stageBChildMatchesRemediation(state, remediation, page) || page.caseId !== remediation.caseId || page.floorId !== remediation.floorId) issues.push({ code: "PAGE_SCOPE_MISMATCH", entityType: "PAGE", entityId: page.id });
    if (page.state !== "FINALISED") issues.push({ code: "PAGE_NOT_FINALISED", entityType: "PAGE", entityId: page.id });
    if (page.baseLayoutVersionId !== base?.id) issues.push({ code: "PAGE_BASE_LAYOUT_MISMATCH", entityType: "PAGE", entityId: page.id });
    if (!page.finalisationHash || page.finalisationHash !== pageFinalisationHash(state, remediation, page)) issues.push({ code: "PAGE_FINALISATION_HASH_MISMATCH", entityType: "PAGE", entityId: page.id });
  }
  if (!base || base.state !== "LOCKED" || base.remediationId !== remediation.id || base.caseId !== remediation.caseId || base.floorId !== remediation.floorId) issues.push({ code: "BASE_LAYOUT_NOT_LOCKED", entityType: "BASE_LAYOUT", entityId: base?.id });
  const masterNumbers = placements.map((item) => item.masterNumber);
  if (new Set(masterNumbers).size !== masterNumbers.length) issues.push({ code: "MASTER_SEQUENCE_DUPLICATE", entityType: "PLACEMENT" });
  if (placements.some((placement) => placement.masterNumber !== reportWideMasterNumber(state, remediation.id, placement.id))) issues.push({ code: "MASTER_SEQUENCE_GAP", entityType: "PLACEMENT" });
  for (const placement of placements) {
    const page = pages.find((item) => item.id === placement.pageId); const resolution = state.remedyEligibilityResolutions.find((item) => item.id === placement.eligibilityResolutionId);
    const remedy = page && placement.remedyId ? resolveRemedySource(state, placement.remedyId, { organisationId: remediation.organisationId!, caseId: remediation.caseId,
      floorId: remediation.floorId, remediationId: remediation.id, pageId: page.id, remedialType: page.pageType as StageBRemedyType })?.record : undefined;
    const asset = state.mediaAssetVersions.find((item) => item.id === placement.imageAssetVersionId && item.assetId === placement.imageAssetId);
    if (placement.organisationId !== remediation.organisationId || placement.remediationId !== remediation.id || !stageBChildMatchesRemediation(state, remediation, placement) || placement.caseId !== remediation.caseId || placement.floorId !== remediation.floorId) issues.push({ code: "PLACEMENT_SCOPE_MISMATCH", entityType: "PLACEMENT", entityId: placement.id });
    if (!page) issues.push({ code: "PLACEMENT_PAGE_MISMATCH", entityType: "PLACEMENT", entityId: placement.id });
    if (placement.placementType !== "REMEDY") issues.push({ code: "PLACEMENT_TYPE_INVALID", entityType: "PLACEMENT", entityId: placement.id });
    if (!page || !resolution || !remedy || resolution.remediationId !== remediation.id || resolution.caseId !== remediation.caseId || resolution.floorId !== remediation.floorId
      || resolution.status !== "ELIGIBLE" || resolution.remedialType !== page.pageType || remedy.id !== resolution.remedyId || remedy.remedialType !== page.pageType
      || (remedy.recordVersion ?? 0) !== resolution.remedyRecordVersion) issues.push({ code: "REMEDY_TYPE_LEAKAGE", entityType: "PLACEMENT", entityId: placement.id });
    if (!resolution || !remedy || !asset || resolution.remedyAssetVersionId !== placement.imageAssetVersionId || remedy.preferredAssetId !== placement.imageAssetId
      || placement.imageAssetSnapshotId !== deterministicContentHash({ assetId: asset?.assetId, versionId: asset?.id, checksumSha256: asset?.checksumSha256 })) issues.push({ code: "REMEDY_ASSET_SNAPSHOT_MISMATCH", entityType: "PLACEMENT", entityId: placement.id });
    if (placement.baseLayoutVersionId !== base?.id) issues.push({ code: "BASE_LAYOUT_VERSION_MISMATCH", entityType: "PLACEMENT", entityId: placement.id });
    if (placement.state !== "LOCKED" || !placement.anchorLocked) issues.push({ code: "PLACEMENT_NOT_LOCKED", entityType: "PLACEMENT", entityId: placement.id });
    if (placement.dependencyReviewState !== "CURRENT") issues.push({ code: "PLACEMENT_NEEDS_REVIEW", entityType: "PLACEMENT", entityId: placement.id });
    const values = [placement.anchorX, placement.anchorY, placement.calloutX, placement.calloutY, placement.calloutWidth, placement.calloutHeight];
    if (values.some((value) => !Number.isFinite(value) || value < 0 || value > 1) || placement.calloutWidth <= 0 || placement.calloutHeight <= 0 || placement.calloutX + placement.calloutWidth > 1 || placement.calloutY + placement.calloutHeight > 1) issues.push({ code: "COORDINATE_INVALID", entityType: "PLACEMENT", entityId: placement.id });
    const placementRows = rows.filter((item) => item.placementId === placement.id); const placementAppendix = appendix.filter((item) => item.placementId === placement.id);
    if (placementRows.length !== 1 || placementRows[0]?.pageId !== placement.pageId || placementRows[0]?.masterNumber !== placement.masterNumber) issues.push({ code: "IMPLEMENTATION_ROW_MISMATCH", entityType: "IMPLEMENTATION_ROW", entityId: placement.id });
    if (placementAppendix.length !== 1 || placementAppendix[0]?.sourcePageId !== placement.pageId || placementAppendix[0]?.floorId !== placement.floorId || placementAppendix[0]?.masterNumber !== placement.masterNumber) issues.push({ code: "APPENDIX_ROW_MISMATCH", entityType: "APPENDIX_ROW", entityId: placement.id });
  }
  if (rows.length !== placements.length || rows.some((row) => !placements.some((placement) => placement.id === row.placementId))) issues.push({ code: "IMPLEMENTATION_ROW_MISMATCH", entityType: "IMPLEMENTATION_ROW" });
  if (appendix.length !== placements.length || appendix.some((row) => !placements.some((placement) => placement.id === row.placementId))) issues.push({ code: "APPENDIX_ROW_MISMATCH", entityType: "APPENDIX_ROW" });
  const scopeHash = deterministicContentHash(snapshot); const status = issues.length ? "FAIL" as const : "PASS" as const;
  const replay = state.stageBIntegrityRuns.find((item) => item.remediationId === remediation.id && item.scopeHash === scopeHash && item.status === status && deterministicContentHash(item.issues) === deterministicContentHash(issues));
  if (replay) return replay;
  const run: StageBIntegrityRunRecord = { id: id("stage-b-integrity"), organisationId: remediation.organisationId, createdByActorUserId: actor.id, updatedByActorUserId: actor.id, recordVersion: 1,
    remediationId: remediation.id, ...stageBRecordLineageFields(state, remediation), scopeHash, status, issues, checkedAt: now(), checkedBy: actor.id };
  state.stageBIntegrityRuns.unshift(run); return run;
}

function provenanceForResolution(resolution: RemedyEligibilityResolutionRecord): StageBRenderProvenance {
  return { eligibilityResolutionId: resolution.id, remedialType: resolution.remedialType, verdictId: resolution.verdictId, verdictContentHash: resolution.verdictContentHash,
    methodologyVersionId: resolution.methodologyVersionId, methodologyContentHash: resolution.methodologyContentHash, resolverVersion: resolution.resolverVersion, eligibilityResolutionHash: resolution.resolutionHash };
}
export function buildStageBRenderManifest(state: AppState, remediationId: string): StageBRenderManifest {
  const remediation = state.stageBRemediations.find((item) => item.id === remediationId); if (!remediation) throw new StageBError("Stage B remediation was not found.", 404);
  const snapshot = integritySnapshot(state, remediation); const { base, pages, placements, rows, appendix } = snapshot; const scopeHash = deterministicContentHash(snapshot);
  const run = state.stageBIntegrityRuns.find((item) => item.remediationId === remediation.id && item.status === "PASS" && item.scopeHash === scopeHash);
  if (remediation.state !== "PAGE_FINALISED" || !base || base.state !== "LOCKED" || pages.length !== STAGE_B_REMEDY_PAGES.length || pages.some((page) => page.state !== "FINALISED" || !page.finalisationHash) || !run) throw new StageBError("Finalised five-page Stage B render evidence is incomplete.", 409);
  const manifestPages = pages.map((page) => {
    const pagePlacements = placements.filter((item) => item.pageId === page.id); const pageRows = rows.filter((item) => item.pageId === page.id);
    const seen = new Set<string>(); const provenance = pagePlacements.flatMap((placement) => {
      const resolution = state.remedyEligibilityResolutions.find((item) => item.id === placement.eligibilityResolutionId);
      if (!resolution || seen.has(resolution.id)) return []; seen.add(resolution.id); return [provenanceForResolution(resolution)];
    });
    return { pageId: page.id, pageType: page.pageType as StageBRemedyType, ordinal: page.ordinal, finalisationHash: page.finalisationHash!, provenance,
      placements: structuredClone(pagePlacements), implementationRows: pageRows.map((item) => ({ ...structuredClone(item), implemented: null, implementationDate: null, alternativeNeeded: null })) };
  });
  const firstProvenance = manifestPages.flatMap((page) => page.provenance)[0];
  return { schemaVersion: "stage-b-render-manifest/v1", organisationId: remediation.organisationId!, caseId: remediation.caseId, floorId: remediation.floorId, ...stageBRecordLineageFields(state, remediation),
    ...(remediation.reportSourceKind ? { reportSourceKind: remediation.reportSourceKind, reportSourceId: remediation.reportSourceId, reportSourceHash: remediation.reportSourceHash } : {}),
    existingLayout: { assetId: remediation.existingLayoutAssetId, versionId: remediation.existingLayoutAssetVersionId, snapshotId: remediation.existingLayoutSnapshotId, contentHash: remediation.existingLayoutSnapshotId },
    baseLayout: { versionId: base.id, snapshotId: base.snapshotId, contentHash: base.assetContentHash },
    ...(firstProvenance ? { provenance: { verdictId: firstProvenance.verdictId, verdictContentHash: firstProvenance.verdictContentHash, methodologyVersionId: firstProvenance.methodologyVersionId,
      methodologyContentHash: firstProvenance.methodologyContentHash, resolverVersion: firstProvenance.resolverVersion, eligibilityResolutionHash: firstProvenance.eligibilityResolutionHash } } : {}),
    pages: manifestPages, appendixRows: appendix.map((item) => ({ ...structuredClone(item), implemented: null, implementationDate: null, alternativeNeeded: null })),
    integrityRunId: run.id, integrityScopeHash: run.scopeHash, integrityStatus: "PASS" };
}

export function finaliseStageBPage(input: { remediationId: unknown; pageId: unknown; expectedRecordVersion: unknown; idempotencyKey: unknown; actor: AppUser }) {
  const state = getAppState(); const scoped = remediationContext(state, input.remediationId, input.actor); const pageId = text(input.pageId, "Page ID"); const key = text(input.idempotencyKey, "Idempotency key");
  const page = state.reportPlacementPages.find((item) => item.id === pageId && item.remediationId === scoped.remediation.id && item.organisationId === owner(input.actor)
    && stageBChildMatchesRemediation(state, scoped.remediation, item) && item.caseId === scoped.caseRecord.id && item.floorId === scoped.floor.id && item.section === "B" && REMEDY_TYPES.has(item.pageType as StageBRemedyType));
  if (!page) throw new StageBError("Stage B remedy page was not found in this report and floor.", 404);
  const requestHash = deterministicContentHash({ remediationId: scoped.remediation.id, pageId: page.id });
  if (page.state === "FINALISED") {
    if (page.finalisationIdempotencyKey === key && page.finalisationRequestHash !== requestHash) throw new StageBError("This page finalisation key was used with different inputs.", 409);
    const sequenceFinalised = orderedPages(state, scoped.remediation.id).every((item) => item.state === "FINALISED");
    return { remediation: scoped.remediation, page, sequenceFinalised, integrityRun: sequenceFinalised ? state.stageBIntegrityRuns.find((item) => item.remediationId === scoped.remediation.id && item.status === "PASS") : undefined,
      manifest: sequenceFinalised ? buildStageBRenderManifest(state, scoped.remediation.id) : undefined };
  }
  expected(scoped.remediation, input.expectedRecordVersion, "remediation");
  const completingSequence = orderedPages(state, scoped.remediation.id).every((item) => item.id === page.id || item.state === "FINALISED");
  const sectionAWorkspace = state.sectionAWorkspaces.find((item) => item.remediationId === scoped.remediation.id);
  if (completingSequence && sectionAWorkspace && sectionAWorkspace.state !== "FINALISED") {
    throw new StageBError("Section A must be integrity-finalised before the report-wide physical placement sequence can freeze.", 409);
  }
  const base = state.remediationBaseLayoutVersions.find((item) => item.id === scoped.remediation.baseLayoutVersionId && item.remediationId === scoped.remediation.id
    && item.projectId === scoped.project.id && item.caseId === scoped.caseRecord.id && item.floorId === scoped.floor.id && ["SELECTED", "LOCKED"].includes(item.state));
  if (!base) throw new StageBError("Finalisation requires the selected or first-page-locked Final Revised Layout.", 409);
  const placements = sortPlacements(state, scoped.remediation.id, livePlacements(state, scoped.remediation.id).filter((item) => item.pageId === page.id));
  for (const placement of placements) {
    const resolution = state.remedyEligibilityResolutions.find((item) => item.id === placement.eligibilityResolutionId && item.remediationId === scoped.remediation.id && item.caseId === scoped.caseRecord.id
      && item.floorId === scoped.floor.id && item.status === "ELIGIBLE" && item.remedialType === page.pageType);
    const remedy = placement.remedyId && placement.remedyId === resolution?.remedyId ? resolveRemedySource(state, placement.remedyId, { organisationId: owner(input.actor), caseId: scoped.caseRecord.id,
      floorId: scoped.floor.id, remediationId: scoped.remediation.id, pageId: page.id, remedialType: page.pageType as StageBRemedyType })?.record : undefined;
    if (!resolution || !remedy || !stageBChildMatchesRemediation(state, scoped.remediation, placement) || placement.caseId !== scoped.caseRecord.id || placement.floorId !== scoped.floor.id || placement.placementType !== "REMEDY"
      || placement.state !== "LOCKED" || !placement.anchorLocked || placement.dependencyReviewState !== "CURRENT" || placement.baseLayoutVersionId !== base.id) throw new StageBError("Page finalisation requires only completed, current, page-matched remedy placements on the selected Final Revised Layout.", 409);
  }
  if (base.state === "SELECTED") { base.state = "LOCKED"; base.lockedAt = now(); base.lockedBy = input.actor.id; base.updatedByActorUserId = input.actor.id; base.recordVersion = (base.recordVersion ?? 0) + 1; }
  resequencePlacements(state, scoped.remediation.id, input.actor);
  const projections = placements.map((placement) => projectionForPlacement(state, scoped.remediation, page, placement, input.actor));
  page.baseLayoutVersionId = base.id; page.state = "FINALISED"; page.finalisedAt = now(); page.finalisedBy = input.actor.id; page.finalisationIdempotencyKey = key; page.finalisationRequestHash = requestHash;
  page.updatedByActorUserId = input.actor.id; page.recordVersion = (page.recordVersion ?? 0) + 1;
  scoped.remediation.state = "EDITING"; scoped.remediation.updatedByActorUserId = input.actor.id; scoped.remediation.recordVersion = (scoped.remediation.recordVersion ?? 0) + 1;
  refreshFinalisationHashes(state, scoped.remediation, input.actor);
  const sequenceFinalised = orderedPages(state, scoped.remediation.id).every((item) => item.state === "FINALISED");
  let run: StageBIntegrityRunRecord | undefined; let manifest: StageBRenderManifest | undefined;
  if (sequenceFinalised) {
    scoped.remediation.state = "PAGE_FINALISED"; scoped.remediation.recordVersion = (scoped.remediation.recordVersion ?? 0) + 1;
    run = integrity(state, scoped.remediation, input.actor); if (run.status !== "PASS") throw new StageBError(`Stage B integrity failed: ${run.issues.map((item) => item.code).join(", ")}`, 409);
    manifest = buildStageBRenderManifest(state, scoped.remediation.id);
  }
  addTimeline(state, scoped.caseRecord.id, input.actor, "Stage B remedy page finalised", `${page.pageType} finalised on the locked base layout; ${sequenceFinalised ? "the five-page sequence is integrity PASS and frozen" : "remaining remedy pages stay editable"}.`);
  return { remediation: scoped.remediation, page, baseLayout: base, placements, implementationRows: projections.map((item) => item.row), appendixRows: projections.map((item) => item.appendix), sequenceFinalised, integrityRun: run, manifest };
}

export function validateStageBIntegrity(input: { remediationId: unknown; expectedRecordVersion: unknown; actor: AppUser }) {
  const state = getAppState(); const scoped = remediationContext(state, input.remediationId, input.actor); expected(scoped.remediation, input.expectedRecordVersion, "remediation"); return integrity(state, scoped.remediation, input.actor);
}
