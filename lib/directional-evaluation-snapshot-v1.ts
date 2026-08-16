import type { AppUser, DirectionalEvaluationSnapshotV1 } from "./domain.ts";
import type { AppState } from "./store.ts";
import { deterministicContentHash } from "./evaluation-provenance.ts";
import { evaluateD8Orientation } from "./d8-orientation-v1.ts";
import { evaluateDirectionalEvaluation, type AuthoritativeD8Orientation } from "./directional-evaluation-v1.ts";
import { resolveEvaluationArchitecture } from "./evaluation-architecture.ts";
import { DIRECTIONAL_METHODOLOGY_V1_1_CONTENT_HASH, DIRECTIONAL_METHODOLOGY_V1_1_VERSION_ID } from "./directional-statement-repo-v1.ts";

export class DirectionalSnapshotError extends Error {}

export function finalizeDirectionalEvaluationSnapshot(input: { state: AppState; organisationId?: string; caseId: string; projectId: string; floorId: string; actor: AppUser; expectedRecordVersion?: number; idempotencyKey: string }) {
  const architecture = resolveEvaluationArchitecture({ state: input.state, caseId: input.caseId, floorId: input.floorId });
  if (architecture.caseVersion !== "V1" || architecture.floorVersion !== "V1") throw new DirectionalSnapshotError("Directional V1 evaluation requires a V1 case and floor.");
  const floor = input.state.floorWorkspaces.find((item) => item.id === input.floorId && item.caseId === input.caseId && item.projectId === input.projectId);
  const caseRecord = input.state.vastuCases.find((item) => item.id === input.caseId && item.projectId === input.projectId);
  if (!floor || !caseRecord) throw new DirectionalSnapshotError("Case, project and floor ownership could not be verified.");
  if (input.expectedRecordVersion !== undefined && caseRecord.recordVersion !== input.expectedRecordVersion) throw new DirectionalSnapshotError("The case changed. Refresh before finalizing Directional Evaluation.");
  const directionalInput = input.state.directionalInputVersions.find((item) => item.caseId === input.caseId && item.floorId === input.floorId && item.status === "FINALIZED");
  if (!directionalInput) throw new DirectionalSnapshotError("A finalized Directional Input is required.");
  const mapping = input.state.d16UtilityMappingVersions.find((item) => item.caseId === input.caseId && item.projectId === input.projectId && item.floorId === input.floorId && item.status === "FINALIZED");
  if (!mapping) throw new DirectionalSnapshotError("A finalized V1 D16 mapping is required.");
  const d8 = input.state.d8OrientationSnapshots.find((item) => item.caseId === input.caseId && item.projectId === input.projectId && item.status !== "SUPERSEDED");
  if (!d8) throw new DirectionalSnapshotError("A current case-level V1 D8 orientation is required.");
  const d8Result = evaluateD8Orientation(d8.exactDegree);
  const orientation: AuthoritativeD8Orientation = { caseId: input.caseId, projectId: input.projectId, floorId: input.floorId, orientationVersionId: d8.id, status: "LOCKED", result: d8Result };
  const mainEntrance = input.state.entranceZoneVersions.find((item) => item.caseId === input.caseId && item.scope === "PROPERTY_MAIN_GATE" && ["CURRENT", "FINALIZED"].includes(item.status));
  const floorEntrance = input.state.entranceZoneVersions.find((item) => item.caseId === input.caseId && item.floorId === input.floorId && item.scope === "FLOOR_PRIMARY_ENTRANCE" && ["CURRENT", "FINALIZED"].includes(item.status));
  const result = evaluateDirectionalEvaluation({ organisationId: input.organisationId ?? caseRecord.organisationId, caseId: input.caseId, projectId: input.projectId, floorId: input.floorId, orientation, d16: { mapping }, modifiers: directionalInput.modifierFindings.map((item: { modifier: string; result: unknown }) => ({ caseId: input.caseId, projectId: input.projectId, floorId: input.floorId, findingId: item.modifier, result: item.result as never })), ...(mainEntrance ? { mainEntrance: { record: mainEntrance } } : {}), ...(floorEntrance ? { floorEntrance: { record: floorEntrance } } : {}), circulation: directionalInput.circulationState });
  const sourceHash = deterministicContentHash({ d8: d8.id, mapping: mapping.id, input: directionalInput.id, mainEntrance: mainEntrance?.id ?? null, floorEntrance: floorEntrance?.id ?? null });
  const replay = input.state.directionalEvaluationSnapshots.find((item) => item.caseId === input.caseId && item.floorId === input.floorId && item.idempotencyKey === input.idempotencyKey);
  if (replay) { if (replay.inputHash !== sourceHash) throw new DirectionalSnapshotError("That idempotency key is already used for different evaluation inputs."); return replay; }
  const previous = input.state.directionalEvaluationSnapshots.find((item) => item.caseId === input.caseId && item.floorId === input.floorId && item.status !== "SUPERSEDED");
  if (previous) previous.status = "SUPERSEDED";
  const now = new Date().toISOString();
  const snapshot: DirectionalEvaluationSnapshotV1 = { id: crypto.randomUUID(), organisationId: input.organisationId ?? caseRecord.organisationId, createdByActorUserId: input.actor.id, updatedByActorUserId: input.actor.id, recordVersion: 1, caseId: input.caseId, projectId: input.projectId, floorId: input.floorId, architectureVersion: "V1", status: result.status, result, sourceD8SnapshotId: d8.id, sourceD8Hash: d8.outputHash, sourceD16MappingId: mapping.id, sourceD16Hash: deterministicContentHash(mapping), sourceMainEntranceId: mainEntrance?.id, sourceMainEntranceHash: mainEntrance ? deterministicContentHash(mainEntrance) : undefined, sourceFloorEntranceId: floorEntrance?.id, sourceFloorEntranceHash: floorEntrance ? deterministicContentHash(floorEntrance) : undefined, sourceDirectionalInputId: directionalInput.id, sourceDirectionalInputHash: directionalInput.inputHash, methodologyVersionId: DIRECTIONAL_METHODOLOGY_V1_1_VERSION_ID, methodologyContentHash: DIRECTIONAL_METHODOLOGY_V1_1_CONTENT_HASH, inputHash: sourceHash, outputHash: deterministicContentHash(result), idempotencyKey: input.idempotencyKey, snapshotVersion: (previous?.snapshotVersion ?? 0) + 1, supersedesSnapshotId: previous?.id, createdAt: now, finalizedAt: now };
  input.state.directionalEvaluationSnapshots.unshift(snapshot);
  return snapshot;
}
