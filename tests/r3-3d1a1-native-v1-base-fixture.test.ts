import assert from "node:assert/strict";
import test from "node:test";
import { createNativeV1BaseFixture } from "./helpers/native-v1-evaluation-fixture.ts";
import { getD16UtilityMapping } from "../lib/d16-utility-mapping.ts";

test("R3.3D1A.1 builds reusable native V1 base authority through lifecycle functions", () => {
  const fixture = createNativeV1BaseFixture();
  assert.equal(fixture.caseRecord.evaluationArchitectureVersion, "V1");
  assert.equal(fixture.floor.evaluationArchitectureVersion, "V1");
  assert.equal(fixture.resolvePropertyContext().provenance, "CASE_SCOPED");
  assert.equal(fixture.d8.status, "FINALIZED");
  assert.equal(fixture.d8.architectureVersion, "V1");
  assert.equal(fixture.d8.result.kind, "RESOLVED");
  assert.equal(fixture.d16.status, "FINALIZED");
  assert.equal(fixture.resolveD16().id, fixture.d16.id);
  assert.equal(fixture.readiness.architecture, "V1");
  assert.equal(fixture.readiness.spatial, "COMPLETE");
  assert.equal(fixture.d32, undefined, "D32 is not a current V1 readiness prerequisite");
});

test("R3.3D1A.1 keeps D16 authority floor-scoped", () => {
  const fixture = createNativeV1BaseFixture();
  assert.throws(() => getD16UtilityMapping({ state: fixture.state, mappingId: fixture.d16.id, caseId: fixture.caseRecord.id, projectId: fixture.project.id, floorId: "wrong-floor" } as any));
});