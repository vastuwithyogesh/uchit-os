import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyAppState } from "../lib/store.ts";
import { resolveV1FloorWorkflowReadiness } from "../lib/founder-v1-readiness.ts";

function stateWithV1Floor() {
  const state = createEmptyAppState();
  const organisationId = "org-v1";
  const caseId = "case-v1";
  const projectId = "project-v1";
  const floorId = "floor-v1";
  state.vastuCases.push({ id: caseId, organisationId, projectId, clientId: "client-v1", evaluationArchitectureVersion: "V1" } as never);
  state.projects.push({ id: projectId, organisationId, activeCaseId: caseId } as never);
  state.floorWorkspaces.push({ id: floorId, caseId, projectId, floorLabel: "Ground", locked: true, evaluationArchitectureVersion: "V1" } as never);
  state.casePropertyContexts.push({ id: "property-v1", organisationId, caseId, projectId } as never);
  state.d8OrientationSnapshots.push({ id: "d8-v1", caseId, status: "FINALIZED" } as never);
  state.d16UtilityMappingVersions.push({ id: "d16-v1", caseId, floorId, status: "FINALIZED" } as never);
  return { state, caseId, floorId };
}

test("V1 spatial readiness does not invent a universal entrance gate", () => {
  const { state, caseId, floorId } = stateWithV1Floor();
  const readiness = resolveV1FloorWorkflowReadiness(state, caseId, floorId);
  assert.equal(readiness.spatial, "COMPLETE");
  assert.equal(readiness.blockers.includes("ENTRANCE_REQUIRED"), false);
});

test("V1 readiness is isolated per floor and does not use legacy Shakti/Post-Site records", () => {
  const { state, caseId, floorId } = stateWithV1Floor();
  const secondFloorId = "floor-v1-second";
  state.floorWorkspaces.push({ id: secondFloorId, caseId, projectId: "project-v1", floorLabel: "First", locked: true, evaluationArchitectureVersion: "V1" } as never);
  const first = resolveV1FloorWorkflowReadiness(state, caseId, floorId);
  const second = resolveV1FloorWorkflowReadiness(state, caseId, secondFloorId);
  assert.equal(first.spatial, "COMPLETE");
  assert.equal(second.spatial, "BLOCKED");
  assert.equal(first.postSite, "BLOCKED");
  assert.equal((first as unknown as Record<string, unknown>).architecture, "V1");
});
