import type { AppUser, CombinedEvaluationReportSnapshotV1 } from "./domain.ts";
import type { AppState } from "./store.ts";
import { deterministicContentHash } from "./evaluation-provenance.ts";
import { DIRECTIONAL_METHODOLOGY_V1_1_CONTENT_HASH, DIRECTIONAL_METHODOLOGY_V1_1_VERSION_ID } from "./directional-statement-repo-v1.ts";
import { resolveEvaluationArchitecture } from "./evaluation-architecture.ts";

export const COMBINED_EVALUATION_REPORT_TEMPLATE_V1 = "uchit-combined-evaluation/v1" as const;
export const COMBINED_REPORT_SECTION_ORDER_V1 = ["ADMINISTRATION", "DIRECTIONAL_REPORT_CARD", "SITE_EVALUATION_EVIDENCE", "ENERGY_BAR_GRAPH", "ELEMENTAL_REPORT"] as const;
export class CombinedEvaluationReportError extends Error {}

function assertV1(state: AppState, caseId: string, floorId: string) {
  const architecture = resolveEvaluationArchitecture({ state, caseId, floorId });
  if (architecture.caseVersion !== "V1" || architecture.floorVersion !== "V1") throw new CombinedEvaluationReportError("Combined V1 reports require a V1 case and floor.");
}
function sameLineage(item: { organisationId?: string; caseId: string; projectId: string; floorId: string }, input: { organisationId: string; caseId: string; projectId: string; floorId: string }) {
  return item.organisationId === input.organisationId && item.caseId === input.caseId && item.projectId === input.projectId && item.floorId === input.floorId;
}
function required<T>(value: T | undefined, message: string): T { if (!value) throw new CombinedEvaluationReportError(message); return value; }
function sourceHash(value: unknown) { return typeof value === "string" && value.length > 0 ? value : undefined; }

function assertHandoffElementalSource(input: { state: AppState; organisationId: string; caseId: string; projectId: string; floorId: string }, elemental: { elementalEvaluationSnapshotId: string }, handoff: any) {
  if (handoff.architectureVersion !== "V1") throw new CombinedEvaluationReportError("The READY Remedy-Type Handoff must be a V1 authority.");
  const handoffPayload = handoff.handoff;
  const sourceId = handoff.elementalEvaluationSnapshotId;
  if (!sourceId || sourceId !== elemental.elementalEvaluationSnapshotId || handoffPayload?.elementalEvaluationSnapshotId !== sourceId) throw new CombinedEvaluationReportError("The READY Remedy-Type Handoff must resolve to the Elemental Evaluation used by the Elemental Report.");
  const evaluation = input.state.elementalEvaluationSnapshots.find((x) => x.id === sourceId && sameLineage(x, input) && x.status === "COMPLETE");
  if (!evaluation) throw new CombinedEvaluationReportError("The READY Remedy-Type Handoff source Elemental Evaluation is not an authoritative same-floor V1 snapshot.");
  if (handoff.elementalEvaluationOutputHash !== evaluation.outputHash || handoffPayload?.elementalEvaluationOutputHash !== evaluation.outputHash) throw new CombinedEvaluationReportError("The READY Remedy-Type Handoff Elemental Evaluation source hash does not match the authoritative snapshot.");
  if (handoff.contentHash !== handoffPayload?.deterministicContentHash) throw new CombinedEvaluationReportError("The READY Remedy-Type Handoff content hash does not match its payload.");
  if (handoffPayload?.methodologyVersionId !== evaluation.methodologyVersionId || handoffPayload?.methodologyContentHash !== evaluation.methodologyContentHash) throw new CombinedEvaluationReportError("The READY Remedy-Type Handoff methodology provenance does not match the authoritative Elemental Evaluation.");
}

export function buildCombinedV1RenderModel(input: { snapshot: CombinedEvaluationReportSnapshotV1 }) {
  const snapshot = input.snapshot;
  return { architectureVersion: "V1" as const, reportVersion: snapshot.reportVersion, status: snapshot.status, templateVersion: snapshot.reportTemplateVersion, lineage: { organisationId: snapshot.organisationId, caseId: snapshot.caseId, projectId: snapshot.projectId, floorId: snapshot.floorId }, sections: COMBINED_REPORT_SECTION_ORDER_V1.map((key, index) => ({ key, order: index + 1 })), directional: { snapshotId: snapshot.directionalReportCardSnapshotId, contentHash: snapshot.directionalReportCardContentHash }, stageA: { presentationId: snapshot.directionalStageAPresentationId, contentHash: snapshot.directionalStageAPresentationHash }, siteEvidence: { versionId: snapshot.siteEvidenceVersionId, artifactHash: snapshot.siteEvidenceArtifactHash, presentation: "ORIGINAL_ARTIFACT_REFERENCE" as const }, energyBarEvidence: { versionId: snapshot.energyBarEvidenceVersionId, artifactHash: snapshot.energyBarEvidenceArtifactHash, presentation: "ORIGINAL_ARTIFACT_REFERENCE" as const }, elemental: { snapshotId: snapshot.elementalReportSnapshotId, contentHash: snapshot.elementalReportContentHash }, internalProvenance: { remedyHandoffId: snapshot.remedyHandoffId, remedyHandoffContentHash: snapshot.remedyHandoffContentHash } };
}

function authoritativeSources(input: { state: AppState; organisationId: string; caseId: string; projectId: string; floorId: string }) {
  const scope = { organisationId: input.organisationId, caseId: input.caseId, projectId: input.projectId, floorId: input.floorId };
  const card = input.state.directionalReportCardSnapshots.find((x) => sameLineage(x, scope) && x.status === "FINALIZED" && x.cardStatus === "READY");
  const stageA = card && input.state.directionalStageAPresentations.find((x) => sameLineage(x, scope) && x.reportCardSnapshotId === card.id && x.reportCardContentHash === card.contentHash && x.status === "PRESENTED");
  const site = input.state.siteEvaluationEvidenceVersions.find((x) => sameLineage(x, scope) && x.status === "FINALIZED" && x.id === input.state.elementalEvaluationSnapshots.find((e) => sameLineage(e, scope))?.siteEvidenceVersionId);
  const energy = input.state.energyBarEvidenceVersions.find((x) => sameLineage(x, scope) && x.status === "FINALIZED" && x.id === input.state.elementalEvaluationSnapshots.find((e) => sameLineage(e, scope))?.energyBarEvidenceVersionId);
  const elemental = input.state.elementalReportSnapshots.find((x) => sameLineage(x, scope) && x.status === "FINALIZED" && (x.report as { status?: string })?.status === "READY");
  const handoff = input.state.evaluationRemedyHandoffs.find((x) => sameLineage(x, scope) && x.status === "READY");
  return { card, stageA, site, energy, elemental, handoff };
}

export function createCombinedEvaluationReportDraft(input: { state: AppState; organisationId: string; caseId: string; projectId: string; floorId: string; actor: AppUser; idempotencyKey: string; expectedRecordVersion?: number }) {
  assertV1(input.state, input.caseId, input.floorId);
  const sources = authoritativeSources(input);
  const card = required(sources.card, "A finalized READY Directional Report Card is required.");
  const stageA = required(sources.stageA, "A Directional Stage A presentation for this report card is required.");
  const site = required(sources.site, "Finalized Site Evaluation evidence for this floor is required.");
  const energy = required(sources.energy, "Finalized Energy Bar evidence for this floor is required.");
  const elemental = required(sources.elemental, "A finalized READY Elemental Report is required.");
  const handoff = required(sources.handoff, "A READY V1 Remedy-Type Handoff is required.");
  assertHandoffElementalSource(input, elemental, handoff);
  const requestHash = deterministicContentHash({ caseId: input.caseId, projectId: input.projectId, floorId: input.floorId, card: card.contentHash, stageA: stageA.reportCardContentHash, site: site.artifactHash, energy: energy.artifactHash, elemental: elemental.contentHash, handoff: handoff.contentHash });
  const replay = input.state.combinedEvaluationReportSnapshots.find((x) => x.organisationId === input.organisationId && x.idempotencyKey === input.idempotencyKey);
  if (replay) { if (replay.requestHash !== requestHash) throw new CombinedEvaluationReportError("Idempotency key is already used for different combined-report inputs."); return replay; }
  const predecessor = input.state.combinedEvaluationReportSnapshots.find((x) => sameLineage(x, input) && x.status !== "SUPERSEDED");
  if (predecessor && (input.expectedRecordVersion === undefined || predecessor.recordVersion !== input.expectedRecordVersion)) throw new CombinedEvaluationReportError("Combined report changed. Refresh before retrying."); if (predecessor) predecessor.status = "SUPERSEDED";
  const now = new Date().toISOString();
  const base = { architectureVersion: "V1" as const, reportVersion: (predecessor?.reportVersion ?? 0) + 1, status: "DRAFT" as const, organisationId: input.organisationId, caseId: input.caseId, projectId: input.projectId, floorId: input.floorId, directionalReportCardSnapshotId: card.id, directionalReportCardContentHash: card.contentHash, directionalStageAPresentationId: stageA.id, directionalStageAPresentationHash: stageA.reportCardContentHash, siteEvidenceVersionId: site.id, siteEvidenceArtifactHash: site.artifactHash, energyBarEvidenceVersionId: energy.id, energyBarEvidenceArtifactHash: energy.artifactHash, elementalReportSnapshotId: elemental.id, elementalReportContentHash: elemental.contentHash, remedyHandoffId: handoff.id, remedyHandoffContentHash: handoff.contentHash, methodologyVersionIds: [DIRECTIONAL_METHODOLOGY_V1_1_VERSION_ID, elemental.methodologyVersionId ?? ""], methodologyContentHashes: [DIRECTIONAL_METHODOLOGY_V1_1_CONTENT_HASH, elemental.methodologyContentHash ?? ""], reportTemplateVersion: COMBINED_EVALUATION_REPORT_TEMPLATE_V1, predecessorId: predecessor?.id, idempotencyKey: input.idempotencyKey, requestHash, createdAt: now, createdByActorUserId: input.actor.id, recordVersion: 1 };
  const snapshot = { ...base, id: `combined-report-${crypto.randomUUID()}`, contentHash: "", renderModel: undefined } as CombinedEvaluationReportSnapshotV1;
  snapshot.renderModel = buildCombinedV1RenderModel({ snapshot });
  snapshot.contentHash = deterministicContentHash({ ...snapshot, renderModel: snapshot.renderModel });
  input.state.combinedEvaluationReportSnapshots.unshift(snapshot);
  return snapshot;
}

export function finalizeCombinedEvaluationReport(input: { state: AppState; snapshotId: string; actor: AppUser; expectedRecordVersion?: number; idempotencyKey: string }) {
  const snapshot = input.state.combinedEvaluationReportSnapshots.find((x) => x.id === input.snapshotId);
  if (!snapshot) throw new CombinedEvaluationReportError("Combined V1 report snapshot not found.");
  if (snapshot.organisationId && input.actor.organisationId && snapshot.organisationId !== input.actor.organisationId) throw new CombinedEvaluationReportError("Combined V1 report snapshot is outside the actor organisation.");
  if (snapshot.status === "FINALIZED") return snapshot;
  if (snapshot.status !== "DRAFT") throw new CombinedEvaluationReportError("Only a draft combined V1 report can be finalized.");
  if (input.expectedRecordVersion !== undefined && snapshot.recordVersion !== input.expectedRecordVersion) throw new CombinedEvaluationReportError("Combined report changed. Refresh before finalizing.");
  snapshot.status = "FINALIZED"; snapshot.finalizedAt = new Date().toISOString(); snapshot.finalizedByActorUserId = input.actor.id; snapshot.recordVersion = (snapshot.recordVersion ?? 0) + 1; return snapshot;
}

export function createCombinedEvaluationReportSuccessor(input: { state: AppState; predecessorId: string; actor: AppUser; idempotencyKey: string; expectedRecordVersion?: number }) {
  const predecessor = input.state.combinedEvaluationReportSnapshots.find((x) => x.id === input.predecessorId && x.status === "FINALIZED");
  if (!predecessor) throw new CombinedEvaluationReportError("Only a finalized combined V1 report can have a successor."); if (input.expectedRecordVersion !== undefined && predecessor.recordVersion !== input.expectedRecordVersion) throw new CombinedEvaluationReportError("Combined report predecessor changed. Refresh before retrying.");
  if (predecessor.organisationId && input.actor.organisationId && predecessor.organisationId !== input.actor.organisationId) throw new CombinedEvaluationReportError("Combined V1 report snapshot is outside the actor organisation.");
  return createCombinedEvaluationReportDraft({ state: input.state, organisationId: predecessor.organisationId ?? "", caseId: predecessor.caseId, projectId: predecessor.projectId, floorId: predecessor.floorId, actor: input.actor, idempotencyKey: input.idempotencyKey });
}
