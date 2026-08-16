import assert from "node:assert/strict";
import test from "node:test";
import { D8OrientationSnapshotError, finalizeD8OrientationSnapshotV1 } from "../lib/d8-orientation-snapshot-v1.ts";

const ids = { caseId: "case-v1", projectId: "project-v1", floorId: "floor-v1", orientationId: "orientation-v1", evidenceId: "evidence-v1", organisationId: "org-v1", actorId: "founder-v1" };
function makeState() {
  return {
    vastuCases: [{ id: ids.caseId, projectId: ids.projectId, organisationId: ids.organisationId, evaluationArchitectureVersion: "V1", recordVersion: 0 }],
    floorWorkspaces: [{ id: ids.floorId, caseId: ids.caseId, projectId: ids.projectId, organisationId: ids.organisationId, evaluationArchitectureVersion: "V1" }],
    spatialEvidenceVersions: [{ id: ids.evidenceId, caseId: ids.caseId, projectId: ids.projectId, organisationId: ids.organisationId, kind: "GOOGLE_EARTH_ORIENTATION", status: "CURRENT" }],
    orientationVersions: [{ id: ids.orientationId, caseId: ids.caseId, projectId: ids.projectId, organisationId: ids.organisationId, exactDegree: 10, googleEarthEvidenceVersionId: ids.evidenceId, status: "LOCKED" }],
    d8OrientationSnapshots: [],
  } as any;
}
const input = (state: any, overrides: Record<string, unknown> = {}) => finalizeD8OrientationSnapshotV1({ state, organisationId: ids.organisationId, caseId: ids.caseId, projectId: ids.projectId, floorId: ids.floorId, orientationVersionId: ids.orientationId, orientationEvidenceVersionId: ids.evidenceId, exactDegree: 10, actor: { id: ids.actorId } as any, idempotencyKey: "d8-replay-key", expectedRecordVersion: 0, ...overrides });

test("locked V1 orientation creates one case/property D8 authority with exact source binding", () => {
  const state = makeState();
  const snapshot = input(state);
  assert.equal(snapshot.status, "FINALIZED");
  assert.equal(snapshot.sourceOrientationVersionId, ids.orientationId);
  assert.equal(snapshot.orientationEvidenceVersionId, ids.evidenceId);
  assert.equal(snapshot.direction, "N");
  assert.equal(state.d8OrientationSnapshots.length, 1);
});

test("exact replay is safe and changed-body replay is rejected", () => {
  const state = makeState();
  const first = input(state);
  const replay = input(state, { expectedRecordVersion: 999 });
  assert.equal(replay.id, first.id);
  assert.equal(state.d8OrientationSnapshots.length, 1);
  assert.throws(() => input(state, { methodologyContentHash: "changed" }), D8OrientationSnapshotError);
});

test("boundary input fails closed and stale or non-locked source cannot finalize", () => {
  const boundaryState = makeState();
  boundaryState.orientationVersions[0].exactDegree = 22.5;
  assert.throws(() => input(boundaryState, { exactDegree: 22.5, idempotencyKey: "boundary-key" }), /D8_BOUNDARY_POLICY_REQUIRED/);
  const staleState = makeState();
  staleState.vastuCases[0].recordVersion = 1;
  assert.throws(() => input(staleState), /case changed/);
  const unlockedState = makeState();
  unlockedState.orientationVersions[0].status = "DRAFT";
  assert.throws(() => input(unlockedState), /locked OrientationVersion/);
});

test("cross-organisation case is rejected", () => {
  const state = makeState();
  state.vastuCases[0].organisationId = "other-org";
  assert.throws(() => input(state), /organisation ownership/);
});
