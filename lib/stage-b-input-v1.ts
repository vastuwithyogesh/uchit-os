import type { AppUser, EvaluationRemedyHandoffRecordV1, StageBInputV1Decision, StageBInputV1Record, StageBRemedyType } from "./domain.ts";
import type { AppState } from "./store.ts";
import { deterministicContentHash } from "./evaluation-provenance.ts";

const ELEMENTS = ["WATER", "AIR", "FIRE", "EARTH", "SPACE"] as const;
const MAP: Record<string, { remedyType: string; stageBRemedyType: StageBRemedyType }> = {
  SUPPRESS: { remedyType: "Tattav Balancer", stageBRemedyType: "TATTAV_BALANCER" },
  GROUND: { remedyType: "Disha Balancer", stageBRemedyType: "DISHA_BALANCER" },
  UPLIFT: { remedyType: "Tattav Activation", stageBRemedyType: "TATTAV_ACTIVATION" },
  PROMOTE: { remedyType: "Disha Activation", stageBRemedyType: "DISHA_ACTIVATION" },
  BALANCE: { remedyType: "Equaliser", stageBRemedyType: "EQUALISER" }
};
const now = () => new Date().toISOString();
const id = () => `stageb-input-v1_${crypto.randomUUID()}`;
function owned(actor: AppUser, organisationId: string) { if (!actor.organisationId || actor.organisationId !== organisationId) throw new Error("Organisation scope mismatch."); }
function scope(state: AppState, handoff: EvaluationRemedyHandoffRecordV1, actor: AppUser) {
  owned(actor, handoff.organisationId);
  const caseRecord = state.vastuCases.find((x) => x.id === handoff.caseId && x.organisationId === handoff.organisationId);
  const project = caseRecord?.projectId ? state.projects.find((x) => x.id === caseRecord.projectId && x.id === handoff.projectId && x.activeCaseId === caseRecord.id) : undefined;
  const floor = project ? state.floorWorkspaces.find((x) => x.id === handoff.floorId && x.caseId === handoff.caseId && x.projectId === project.id) : undefined;
  if (!caseRecord || !project || !floor) throw new Error("Case, project, or floor lineage mismatch.");
  return { caseRecord, project, floor };
}
function decisions(handoff: EvaluationRemedyHandoffRecordV1): StageBInputV1Decision[] {
  const source = handoff.handoff as any;
  const rows = Array.isArray(source?.decisions) ? source.decisions : [];
  if (rows.length !== 5 || new Set(rows.map((x: any) => x.element)).size !== 5 || rows.some((x: any) => !ELEMENTS.includes(x.element))) throw new Error("V1 Stage B input requires exactly one decision for each Element.");
  return rows.map((x: any) => {
    const mapped = MAP[x.verdict]; if (!mapped || mapped.stageBRemedyType !== ({ TATTAV_BALANCER: "TATTAV_BALANCER", DISHA_BALANCER: "DISHA_BALANCER", TATTAV_ACTIVATION: "TATTAV_ACTIVATION", DISHA_ACTIVATION: "DISHA_ACTIVATION", EQUALISER: "EQUALISER" } as any)[x.remedyType]) throw new Error(`Invalid V1 remedy mapping for ${x.element}.`);
    const specific = x.correctionScope === "SPECIFIC_DIRECTION" ? x.targetDirection : undefined;
    if (x.correctionScope === "SPECIFIC_DIRECTION" && !specific) throw new Error(`SPECIFIC_DIRECTION_REQUIRED for ${x.element}.`);
    if (x.correctionScope !== "SPECIFIC_DIRECTION" && specific) throw new Error(`Whole-element decisions cannot contain a direction for ${x.element}.`);
    return { element: x.element, verdict: x.verdict, correctionScope: x.correctionScope, ...(specific ? { specificDirection: specific } : {}), remedyType: mapped.remedyType, stageBRemedyType: mapped.stageBRemedyType, statementId: x.statementId, statementContentHash: x.statementContentHash };
  });
}
export function createStageBInputV1(input: { state: AppState; handoffId: string; actor: AppUser; idempotencyKey: string; expectedRecordVersion?: number }) {
  const handoff = input.state.evaluationRemedyHandoffs.find((x) => x.id === input.handoffId && x.status === "READY"); if (!handoff) throw new Error("SOURCE_HANDOFF_INVALID");
  if (input.expectedRecordVersion !== undefined && (handoff.recordVersion ?? 0) !== input.expectedRecordVersion) throw new Error("Source handoff changed. Refresh and retry.");
  const { caseRecord } = scope(input.state, handoff, input.actor); const existing = input.state.stageBInputsV1.find((x) => x.idempotencyKey === input.idempotencyKey && x.organisationId === handoff.organisationId); if (existing) return existing;
  const combined = input.state.combinedEvaluationReportSnapshots.find((x) => x.organisationId === handoff.organisationId && x.caseId === handoff.caseId && x.projectId === handoff.projectId && x.floorId === handoff.floorId && x.status === "FINALIZED" && x.remedyHandoffId === handoff.id && x.remedyHandoffContentHash === handoff.contentHash);
  if (!combined) throw new Error("CURRENT_FINALIZED_COMBINED_REQUIRED");
  const ds = decisions(handoff); const base = { architectureVersion: "V1" as const, sourceKind: "V1_ELEMENTAL" as const, organisationId: handoff.organisationId, clientId: caseRecord.clientId, caseId: handoff.caseId, projectId: handoff.projectId, floorId: handoff.floorId, sourceEvaluationRemedyHandoffId: handoff.id, sourceEvaluationRemedyHandoffHash: handoff.contentHash, sourceElementalEvaluationSnapshotId: handoff.elementalEvaluationSnapshotId, sourceElementalEvaluationHash: handoff.elementalEvaluationOutputHash, sourceCombinedEvaluationReportId: combined.id, sourceCombinedEvaluationReportHash: combined.contentHash, reportSourceId: combined.id, reportSourceHash: combined.contentHash, decisions: ds, methodologyVersionId: handoff.handoff && (handoff.handoff as any).methodologyVersionId, methodologyContentHash: handoff.handoff && (handoff.handoff as any).methodologyContentHash };
  const record: StageBInputV1Record = { id: id(), ...base, deterministicInputHash: deterministicContentHash({ handoffId: handoff.id, handoffHash: handoff.contentHash }), deterministicOutputHash: deterministicContentHash(base), status: "DRAFT", createdAt: now(), idempotencyKey: input.idempotencyKey, requestHash: deterministicContentHash({ handoffId: handoff.id }) };
  input.state.stageBInputsV1.unshift(record); return record;
}
export function finalizeStageBInputV1(input: { state: AppState; recordId: string; actor: AppUser; expectedRecordVersion: number; idempotencyKey: string }) {
  const record = input.state.stageBInputsV1.find((x) => x.id === input.recordId && x.organisationId === input.actor.organisationId); if (!record) throw new Error("Stage B V1 input not found.");
  if (record.status === "FINALIZED") return record; if ((record.recordVersion ?? 0) !== input.expectedRecordVersion) throw new Error("Stage B V1 input changed. Refresh and retry.");
  record.status = "FINALIZED"; record.finalizedAt = now(); record.finalizedByActorUserId = input.actor.id; record.recordVersion = (record.recordVersion ?? 0) + 1; return record;
}
export function createStageBInputV1Successor(input: { state: AppState; predecessorId: string; actor: AppUser; idempotencyKey: string; expectedRecordVersion?: number }) {
  const predecessor = input.state.stageBInputsV1.find((x) => x.id === input.predecessorId && x.organisationId === input.actor.organisationId); if (!predecessor || predecessor.status !== "FINALIZED") throw new Error("Only a FINALIZED V1 input can have a successor.");
  if (input.expectedRecordVersion !== undefined && (predecessor.recordVersion ?? 0) !== input.expectedRecordVersion) throw new Error("Stage B V1 input changed. Refresh and retry.");
  const handoff = input.state.evaluationRemedyHandoffs.find((x) => x.id === predecessor.sourceEvaluationRemedyHandoffId && x.status === "READY"); if (!handoff) throw new Error("SOURCE_HANDOFF_INVALID");
  predecessor.status = "SUPERSEDED"; predecessor.recordVersion = (predecessor.recordVersion ?? 0) + 1; const next = createStageBInputV1({ state: input.state, handoffId: handoff.id, actor: input.actor, idempotencyKey: input.idempotencyKey, expectedRecordVersion: (handoff.recordVersion ?? 0) }); predecessor.successorId = next.id; next.predecessorId = predecessor.id; return next;
}
export interface NormalizedStageBRemedyInput { sourceKind: "LEGACY_UTILITY" | "V1_ELEMENTAL"; sourceId: string; sourceHash: string; caseId: string; floorId: string; element: string; stageBRemedyType: StageBRemedyType; directions?: string[]; methodologyVersionId: string; methodologyContentHash: string; }
export function normalizeStageBInputsV1(record: StageBInputV1Record, stageBRemedyType: StageBRemedyType): NormalizedStageBRemedyInput[] {
  if (record.status !== "FINALIZED") return [];
  return record.decisions.filter((decision) => decision.stageBRemedyType === stageBRemedyType).map((decision) => ({
    sourceKind: "V1_ELEMENTAL" as const, sourceId: record.id, sourceHash: record.deterministicOutputHash, caseId: record.caseId, floorId: record.floorId,
    element: decision.element, stageBRemedyType: decision.stageBRemedyType,
    ...(decision.specificDirection ? { directions: [decision.specificDirection] } : {}), methodologyVersionId: record.methodologyVersionId, methodologyContentHash: record.methodologyContentHash
  }));
}
export function normalizeStageBInputV1(record: StageBInputV1Record, stageBRemedyType: StageBRemedyType): NormalizedStageBRemedyInput | undefined {
  return normalizeStageBInputsV1(record, stageBRemedyType)[0];
}
