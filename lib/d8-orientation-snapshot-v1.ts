import type { AppUser, D8OrientationSnapshotV1 } from "./domain.ts";
import type { AppState } from "./store.ts";
import { deterministicContentHash } from "./evaluation-provenance.ts";
import { evaluateD8Orientation } from "./d8-orientation-v1.ts";
import { resolveEvaluationArchitecture } from "./evaluation-architecture.ts";

export class D8OrientationSnapshotError extends Error {}

export function finalizeD8OrientationSnapshotV1(input: {
  state: AppState; organisationId?: string; caseId: string; projectId: string; floorId?: string;
  orientationVersionId: string; orientationEvidenceVersionId: string; exactDegree: number; methodologyVersionId?: string; methodologyContentHash?: string;
  actor: AppUser; idempotencyKey: string; expectedRecordVersion?: number;
}): D8OrientationSnapshotV1 {
  const architecture = resolveEvaluationArchitecture({ state: input.state, caseId: input.caseId, ...(input.floorId ? { floorId: input.floorId } : {}) });
  if (architecture.caseVersion !== "V1") throw new D8OrientationSnapshotError("D8 V1 finalization requires a V1 case.");
  const caseRecord = input.state.vastuCases.find((item) => item.id === input.caseId && item.projectId === input.projectId);
  const floor = input.floorId ? input.state.floorWorkspaces.find((item) => item.id === input.floorId && item.caseId === input.caseId && item.projectId === input.projectId) : undefined;
  if (input.floorId && (!floor || floor.evaluationArchitectureVersion !== "V1")) throw new D8OrientationSnapshotError("The optional D8 source floor must be V1 and belong to the selected case/project.");
  if (!caseRecord) throw new D8OrientationSnapshotError("Case and project ownership could not be verified.");
  if (input.organisationId && caseRecord.organisationId && caseRecord.organisationId !== input.organisationId) throw new D8OrientationSnapshotError("Case organisation ownership could not be verified.");
  const evidence = input.state.spatialEvidenceVersions.find((item) => item.id === input.orientationEvidenceVersionId && item.caseId === input.caseId && item.projectId === input.projectId && (!input.organisationId || item.organisationId === input.organisationId) && item.kind === "GOOGLE_EARTH_ORIENTATION" && item.status === "CURRENT");
  if (!evidence) throw new D8OrientationSnapshotError("Current Google Earth orientation evidence is required.");
  const orientation = input.state.orientationVersions.find((item) => item.id === input.orientationVersionId && item.caseId === input.caseId && item.projectId === input.projectId && (!input.organisationId || item.organisationId === input.organisationId) && item.status === "LOCKED" && item.googleEarthEvidenceVersionId === evidence.id && item.exactDegree === input.exactDegree);
  if (!orientation) throw new D8OrientationSnapshotError("A locked OrientationVersion matching the current evidence and exact degree is required.");
  const result = evaluateD8Orientation(input.exactDegree);
  if (result.kind !== "RESOLVED") throw new D8OrientationSnapshotError(result.reviewCode);
  const requestHash = deterministicContentHash({ caseId: input.caseId, projectId: input.projectId, sourceOrientationVersionId: orientation.id, sourceFloorId: input.floorId ?? null, evidenceId: evidence.id, exactDegree: input.exactDegree, methodologyVersionId: input.methodologyVersionId ?? null, methodologyContentHash: input.methodologyContentHash ?? null });
  const replay = input.state.d8OrientationSnapshots.find((item) => item.caseId === input.caseId && item.idempotencyKey === input.idempotencyKey);
  if (replay) { if (replay.requestHash !== requestHash) throw new D8OrientationSnapshotError("That idempotency key is already used for different D8 inputs."); return replay; }
  if (!Number.isInteger(input.expectedRecordVersion) || (caseRecord.recordVersion ?? 0) !== input.expectedRecordVersion) throw new D8OrientationSnapshotError("The case changed. Refresh before finalizing D8 orientation.");
  const now = new Date().toISOString();
  const previous = input.state.d8OrientationSnapshots.find((item) => item.caseId === input.caseId && item.projectId === input.projectId && item.status !== "SUPERSEDED");
  if (previous && previous.direction === result.direction && previous.exactDegree === input.exactDegree && previous.sourceOrientationVersionId === orientation.id && previous.orientationEvidenceVersionId === evidence.id) return previous;
  if (previous) previous.status = "SUPERSEDED";
  const record: D8OrientationSnapshotV1 = { id: crypto.randomUUID(), organisationId: input.organisationId ?? caseRecord.organisationId ?? "", createdByActorUserId: input.actor.id, updatedByActorUserId: input.actor.id, caseId: input.caseId, projectId: input.projectId, ...(input.floorId ? { floorId: input.floorId, sourceFloorId: input.floorId, sourcePlanVersionId: evidence.planVersionId } : {}), architectureVersion: "V1", status: "FINALIZED", supersedesVersionId: previous?.id, finalizedAt: now, sourceOrientationVersionId: orientation.id, orientationEvidenceVersionId: evidence.id, exactDegree: input.exactDegree, normalizedDegree: result.normalizedDegree, direction: result.direction, resultCode: "D8_RESOLVED", rulesetVersion: result.rulesetVersion, catalogHash: result.catalogHash, methodologyVersionId: input.methodologyVersionId, methodologyContentHash: input.methodologyContentHash, inputHash: deterministicContentHash({ orientationVersionId: orientation.id, evidenceId: evidence.id, exactDegree: input.exactDegree }), outputHash: deterministicContentHash({ direction: result.direction, normalizedDegree: result.normalizedDegree, rulesetVersion: result.rulesetVersion, catalogHash: result.catalogHash }), idempotencyKey: input.idempotencyKey, requestHash, createdAt: now };
  input.state.d8OrientationSnapshots.unshift(record);
  caseRecord.recordVersion = (caseRecord.recordVersion ?? 0) + 1;
  return record;
}
