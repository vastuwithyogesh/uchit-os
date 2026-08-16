import type { AppUser, DirectionalReportCardSnapshotV1, DirectionalStageAPresentationV1 } from "./domain.ts";
import type { AppState } from "./store.ts";
import { deterministicContentHash } from "./evaluation-provenance.ts";
import { assembleDirectionalReportCard, type DirectionalStatementSelection } from "./directional-report-card-v1.ts";
import { resolveEvaluationArchitecture } from "./evaluation-architecture.ts";
import { DIRECTIONAL_METHODOLOGY_V1_1_CONTENT_HASH, DIRECTIONAL_METHODOLOGY_V1_1_VERSION_ID, resolveDirectionalStatements } from "./directional-statement-repo-v1.ts";

export class DirectionalReportCardSnapshotError extends Error {}
type StatementMap = Readonly<Record<string, DirectionalStatementSelection | undefined>>;

function currentEvaluation(state: AppState, caseId: string, projectId: string, floorId: string) {
  return state.directionalEvaluationSnapshots.find((item) => item.caseId === caseId && item.projectId === projectId && item.floorId === floorId && item.status !== "SUPERSEDED");
}
function assertV1(state: AppState, caseId: string, floorId: string) {
  const architecture = resolveEvaluationArchitecture({ state, caseId, floorId });
  if (architecture.caseVersion !== "V1" || architecture.floorVersion !== "V1") throw new DirectionalReportCardSnapshotError("Directional V1 report cards require a V1 case and floor.");
}

export function createDirectionalReportCardDraft(input: { state: AppState; organisationId?: string; caseId: string; projectId: string; floorId: string; actor: AppUser; statements?: StatementMap; idempotencyKey: string; expectedRecordVersion?: number; predecessorVersionId?: string }) {
  assertV1(input.state, input.caseId, input.floorId);
  const evaluation = currentEvaluation(input.state, input.caseId, input.projectId, input.floorId);
  if (!evaluation) throw new DirectionalReportCardSnapshotError("A current authoritative Directional Evaluation snapshot is required.");
  const caseRecord = input.state.vastuCases.find((item) => item.id === input.caseId && item.projectId === input.projectId);
  if (!caseRecord) throw new DirectionalReportCardSnapshotError("Case/project scope could not be verified.");
  if (input.expectedRecordVersion !== undefined && caseRecord.recordVersion !== input.expectedRecordVersion) throw new DirectionalReportCardSnapshotError("The case changed. Refresh before creating a report card.");
  const requestHash = deterministicContentHash({ caseId: input.caseId, projectId: input.projectId, floorId: input.floorId, evaluationId: evaluation.id, evaluationHash: evaluation.outputHash, statements: input.statements ?? {} });
  const replay = input.state.directionalReportCardSnapshots.find((item) => item.idempotencyKey === input.idempotencyKey);
  if (replay) { if (replay.requestHash !== requestHash) throw new DirectionalReportCardSnapshotError("That idempotency key is already used for different report-card inputs."); return replay; }
  const evaluationResult = evaluation.result as any;
  const statements = resolveDirectionalStatements(evaluationResult, { methodologyVersionId: evaluation.methodologyVersionId ?? "", methodologyContentHash: evaluation.methodologyContentHash ?? "" });
  const result = assembleDirectionalReportCard({ evaluation: evaluationResult, statements });
  const previous = input.state.directionalReportCardSnapshots.find((item) => item.caseId === input.caseId && item.projectId === input.projectId && item.floorId === input.floorId && item.status !== "SUPERSEDED");
  if (previous) previous.status = "SUPERSEDED";
  const now = new Date().toISOString();
  const snapshot: DirectionalReportCardSnapshotV1 = { id: crypto.randomUUID(), organisationId: input.organisationId ?? caseRecord.organisationId, createdByActorUserId: input.actor.id, updatedByActorUserId: input.actor.id, recordVersion: 1, caseId: input.caseId, projectId: input.projectId, floorId: input.floorId, architectureVersion: "V1", status: "DRAFT", cardStatus: result.status, sourceDirectionalEvaluationSnapshotId: evaluation.id, sourceDirectionalEvaluationHash: evaluation.outputHash, payload: result, statementSelections: [...result.statementSelections], reviewReasons: [...result.reviewReasons], methodologyVersionId: DIRECTIONAL_METHODOLOGY_V1_1_VERSION_ID, methodologyContentHash: DIRECTIONAL_METHODOLOGY_V1_1_CONTENT_HASH, contentHash: result.deterministicContentHash, snapshotVersion: (previous?.snapshotVersion ?? 0) + 1, supersedesSnapshotId: input.predecessorVersionId ?? previous?.id, idempotencyKey: input.idempotencyKey, requestHash, createdAt: now };
  input.state.directionalReportCardSnapshots.unshift(snapshot); return snapshot;
}

export function finalizeDirectionalReportCard(input: { state: AppState; snapshotId: string; actor: AppUser; expectedRecordVersion?: number; idempotencyKey: string }) {
  const snapshot = input.state.directionalReportCardSnapshots.find((item) => item.id === input.snapshotId);
  if (!snapshot) throw new DirectionalReportCardSnapshotError("Directional report-card draft not found.");
  if (snapshot.status === "FINALIZED") return snapshot;
  if (snapshot.status !== "DRAFT") throw new DirectionalReportCardSnapshotError("Only a draft report card can be finalized.");
  if (input.expectedRecordVersion !== undefined && snapshot.recordVersion !== input.expectedRecordVersion) throw new DirectionalReportCardSnapshotError("The report card changed. Refresh before finalizing.");
  if (snapshot.cardStatus !== "READY") throw new DirectionalReportCardSnapshotError("A REVIEW_REQUIRED report card cannot be finalized or presented.");
  snapshot.status = "FINALIZED"; snapshot.finalizedAt = new Date().toISOString(); snapshot.finalizedByActorUserId = input.actor.id; snapshot.updatedByActorUserId = input.actor.id; snapshot.recordVersion = (snapshot.recordVersion ?? 0) + 1; return snapshot;
}

export function createDirectionalReportCardSuccessor(input: { state: AppState; predecessorId: string; actor: AppUser; statements?: StatementMap; idempotencyKey: string; expectedRecordVersion?: number }) {
  const predecessor = input.state.directionalReportCardSnapshots.find((item) => item.id === input.predecessorId && item.status === "FINALIZED");
  if (!predecessor) throw new DirectionalReportCardSnapshotError("Only a finalized report card can have a successor.");
  return createDirectionalReportCardDraft({ ...input, organisationId: predecessor.organisationId, caseId: predecessor.caseId, projectId: predecessor.projectId, floorId: predecessor.floorId, predecessorVersionId: predecessor.id });
}

export function presentDirectionalStageA(input: { state: AppState; reportCardSnapshotId: string; actor: AppUser; expectedRecordVersion?: number; idempotencyKey: string }) {
  const card = input.state.directionalReportCardSnapshots.find((item) => item.id === input.reportCardSnapshotId);
  if (!card || card.status !== "FINALIZED") throw new DirectionalReportCardSnapshotError("Only a finalized V1 report card can be presented.");
  if (card.cardStatus !== "READY") throw new DirectionalReportCardSnapshotError("A REVIEW_REQUIRED V1 report card cannot be presented.");
  if (input.expectedRecordVersion !== undefined && card.recordVersion !== input.expectedRecordVersion) throw new DirectionalReportCardSnapshotError("The report card changed. Refresh before presenting.");
  const requestHash = deterministicContentHash({ reportCardSnapshotId: card.id, reportCardHash: card.contentHash });
  const replay = input.state.directionalStageAPresentations.find((item) => item.idempotencyKey === input.idempotencyKey);
  if (replay) { if (replay.requestHash !== requestHash) throw new DirectionalReportCardSnapshotError("That idempotency key is already used for another presentation."); return replay; }
  const existing = input.state.directionalStageAPresentations.find((item) => item.reportCardSnapshotId === card.id);
  if (existing) return existing;
  const presentation: DirectionalStageAPresentationV1 = { id: crypto.randomUUID(), organisationId: card.organisationId, createdByActorUserId: input.actor.id, updatedByActorUserId: input.actor.id, recordVersion: 1, caseId: card.caseId, projectId: card.projectId, floorId: card.floorId, architectureVersion: "V1", reportCardSnapshotId: card.id, reportCardContentHash: card.contentHash, status: "PRESENTED", presentedAt: new Date().toISOString(), presentedByActorUserId: input.actor.id, idempotencyKey: input.idempotencyKey, requestHash };
  input.state.directionalStageAPresentations.unshift(presentation); return presentation;
}
