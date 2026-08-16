import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const route = fs.readFileSync("app/api/actions/route.ts", "utf8");
const workspace = fs.readFileSync("components/stage-b-remedy-workspace.tsx", "utf8");
const readiness = fs.readFileSync("components/v1-remedy-type-handoff-workspace.tsx", "utf8");

test("R1 Stage B action allowlist carries native reportSourceId and remains strict", () => {
  assert.match(route, /"stage-b-remediation-initialise": \["action", "actorRole", "caseId", "floorId", "reportId", "reportSourceId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"\]/);
  assert.match(route, /"stage-b-readiness-v1": \["action", "actorRole", "caseId", "floorId", "idempotencyKey", "expectedRecordVersion", "reservationRecordVersion", "expectedRevision"\]/);
  assert.match(route, /Unknown Stage B field/);
});

test("R1 readiness caller and route share the reservation CAS field", () => {
  assert.match(readiness, /reservationRecordVersion: reservation\?\.recordVersion \?\? 0/);
  assert.match(route, /expectedRecordVersion: body\.reservationRecordVersion === undefined \? undefined : Number\(body\.reservationRecordVersion\)/);
});

test("R1 V1 caller sends native source while legacy caller keeps reportId", () => {
  assert.match(workspace, /evaluationArchitectureVersion === "V1"/);
  assert.match(workspace, /reportSourceId: v1Source\.id/);
  assert.match(workspace, /reportId: report!\.id/);
  assert.doesNotMatch(workspace, /reportSourceId: report!\.id/);
});
