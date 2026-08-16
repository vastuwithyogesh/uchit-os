import type { AppUser, V1FullBalanceClearanceRecord } from "./domain.ts";
import type { AppState } from "./store.ts";
import { deterministicContentHash } from "./evaluation-provenance.ts";
import { getCurrentElementalEvaluation } from "./elemental-evaluation-integration-v1.ts";
import { ELEMENTAL_METHODOLOGY_CONTENT_HASH, ELEMENTAL_METHODOLOGY_IDENTITY, isCanonicalElementalMethodology } from "./elemental-methodology-authority-v1.ts";

export class V1FullBalanceClearanceError extends Error {}

const requireText = (value: unknown, label: string) => {
  if (typeof value !== "string" || !value.trim()) throw new V1FullBalanceClearanceError(`${label} is required.`);
  return value.trim();
};

function scope(state: AppState, organisationId: string, caseId: string, projectId: string, floorId: string) {
  const caseRecord = state.vastuCases.find((item) => item.id === caseId && item.organisationId === organisationId && item.projectId === projectId);
  const project = state.projects.find((item) => item.id === projectId && item.organisationId === organisationId && item.activeCaseId === caseId);
  const floor = state.floorWorkspaces.find((item) => item.id === floorId && item.organisationId === organisationId && item.caseId === caseId && item.projectId === projectId && item.evaluationArchitectureVersion === "V1");
  if (!caseRecord || !project || !floor) throw new V1FullBalanceClearanceError("Organisation, case, project and V1 floor scope must match.");
  return { caseRecord, project, floor };
}

export function getCurrentV1FullBalanceClearance(state: AppState, organisationId: string, caseId: string, projectId: string, floorId: string) {
  const currentEvaluation = getCurrentElementalEvaluation(state, organisationId, caseId, projectId, floorId);
  const currentReport = state.elementalReportSnapshots
    .filter((item) => item.organisationId === organisationId && item.caseId === caseId && item.projectId === projectId && item.floorId === floorId && item.status === "FINALIZED")
    .sort((left, right) => right.snapshotVersion - left.snapshotVersion)[0];
  if (!currentEvaluation || !currentReport || currentReport.elementalEvaluationSnapshotId !== currentEvaluation.id || currentReport.elementalEvaluationOutputHash !== currentEvaluation.outputHash) return undefined;
  return state.v1FullBalanceClearances
    .filter((item) => item.organisationId === organisationId && item.caseId === caseId && item.projectId === projectId && item.floorId === floorId && item.status === "APPROVED" && item.elementalEvaluationSnapshotId === currentEvaluation.id && item.elementalReportSnapshotId === currentReport.id && item.elementalEvaluationOutputHash === currentEvaluation.outputHash && item.elementalReportContentHash === currentReport.contentHash)
    .sort((left, right) => right.version - left.version)[0];
}

export function approveV1FullBalanceClearance(input: { state: AppState; organisationId: string; caseId: string; projectId: string; floorId: string; actor: AppUser; expectedRecordVersion: number; idempotencyKey: string }) {
  const organisationId = requireText(input.organisationId, "Organisation ID");
  const caseId = requireText(input.caseId, "Case ID");
  const projectId = requireText(input.projectId, "Project ID");
  const floorId = requireText(input.floorId, "Floor ID");
  const idempotencyKey = requireText(input.idempotencyKey, "Idempotency key");
  const { caseRecord } = scope(input.state, organisationId, caseId, projectId, floorId);
  const evaluation = getCurrentElementalEvaluation(input.state, organisationId, caseId, projectId, floorId);
  if (!evaluation || evaluation.status !== "COMPLETE" || !isCanonicalElementalMethodology(evaluation.methodologyVersionId, evaluation.methodologyContentHash)) throw new V1FullBalanceClearanceError("Current canonical COMPLETE Elemental Evaluation is required.");
  const report = input.state.elementalReportSnapshots.find((item) => item.organisationId === organisationId && item.caseId === caseId && item.projectId === projectId && item.floorId === floorId && item.status === "FINALIZED" && item.elementalEvaluationSnapshotId === evaluation.id && item.elementalEvaluationOutputHash === evaluation.outputHash);
  if (!report) throw new V1FullBalanceClearanceError("A finalized Elemental Report bound to the current Evaluation is required.");
  if (evaluation.methodologyVersionId !== ELEMENTAL_METHODOLOGY_IDENTITY || evaluation.methodologyContentHash !== ELEMENTAL_METHODOLOGY_CONTENT_HASH) throw new V1FullBalanceClearanceError("Elemental methodology authority is not canonical.");
  const requestHash = deterministicContentHash({ organisationId, caseId, projectId, floorId, scope: "FULL_BALANCE_CLEARANCE_V1", elementalEvaluationSnapshotId: evaluation.id, elementalEvaluationOutputHash: evaluation.outputHash, elementalReportSnapshotId: report.id, elementalReportContentHash: report.contentHash });
  const replay = input.state.v1FullBalanceClearances.find((item) => item.organisationId === organisationId && item.idempotencyKey === idempotencyKey);
  if (replay) { if (replay.requestHash !== requestHash) throw new V1FullBalanceClearanceError("Idempotency key is already used for different clearance sources."); return replay; }
  const current = input.state.v1FullBalanceClearances.filter((item) => item.organisationId === organisationId && item.caseId === caseId && item.projectId === projectId && item.floorId === floorId).sort((left, right) => right.version - left.version)[0];
  if (current) throw new V1FullBalanceClearanceError("Current V1 Full Balance Clearance already exists for these findings.");
  if (input.expectedRecordVersion !== 0) throw new V1FullBalanceClearanceError("V1 Full Balance Clearance changed. Refresh before approving.");
  const record: V1FullBalanceClearanceRecord = { id: `v1-full-balance-clearance-${crypto.randomUUID()}`, organisationId, caseId, projectId, floorId, scope: "FULL_BALANCE_CLEARANCE_V1", version: 1, status: "APPROVED", elementalEvaluationSnapshotId: evaluation.id, elementalEvaluationOutputHash: evaluation.outputHash, elementalReportSnapshotId: report.id, elementalReportContentHash: report.contentHash, actorUserId: input.actor.id, actorDisplayName: input.actor.fullName || input.actor.id, actorRole: input.actor.role, approvedAt: new Date().toISOString(), recordVersion: 1, idempotencyKey, requestHash };
  input.state.v1FullBalanceClearances.unshift(record);
  return record;
}
