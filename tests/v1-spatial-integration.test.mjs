import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("V1 spatial actions are explicit and architecture-gated", () => {
  const route = read("app/api/actions/route.ts");
  for (const action of [
    "d8-orientation-finalize-v1",
    "d16-mapping-draft-v1",
    "d16-mapping-finalize-v1",
    "d16-mapping-successor-v1",
    "d32-entrance-draft-v1",
    "d32-entrance-finalize-v1",
    "d32-entrance-successor-v1",
  ]) assert.match(route, new RegExp(`case \\\"${action}\\\"`));
  assert.match(route, /resolveEvaluationArchitecture/);
  assert.match(route, /skipLegacyInvalidation: true/);
  const snapshot = read("lib/d8-orientation-snapshot-v1.ts");
  const readiness = read("lib/v1-spatial-readiness.ts");
  assert.match(snapshot, /floorId\?: string/);
  assert.match(snapshot, /sourceFloorId/);
  assert.match(snapshot, /status = \"SUPERSEDED\"/);
  assert.match(readiness, /item\.caseId === caseId && item\.status !== \"SUPERSEDED\"/);
});

test("floor evidence action has replay and CAS plumbing", () => {
  const route = read("app/api/actions/route.ts");
  const service = read("lib/workflow-service.ts");
  assert.match(route, /concurrencyActions\.add\("floor-evidence-add"\)/);
  assert.match(route, /addFloorEvidence\(body\.floorId, body\.fileName, actor, body\.expectedRecordVersion, body\.idempotencyKey/);
  assert.match(service, /evidenceIdempotencyKey/);
  assert.match(service, /assertExpectedRecordVersion\(caseRecord, expectedRecordVersion\)/);
});

test("V1 presentation marks legacy opening records as historical-only", () => {
  const ui = read("components/spatial-workspace.tsx");
  assert.match(ui, /isV1Spatial/);
  assert.match(ui, /Legacy percentage marker evidence/);
});
