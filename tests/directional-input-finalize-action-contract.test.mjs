import test from "node:test";
import assert from "node:assert/strict";
import { source } from "./helpers/source-contracts.mjs";

const route = source("app/api/actions/route.ts");
const consoleSource = source("components/directional-evaluation-console-v1.tsx");

test("Directional Input finalize accepts only its action-specific browser contract", () => {
  assert.match(route, /"directional-input-finalize-v1": \["action", "actorRole", "caseId", "projectId", "floorId", "inputId", "expectedInputVersion", "idempotencyKey", "expectedRecordVersion", "expectedRevision"\]/);
  assert.match(consoleSource, /action, caseId, projectId, floorId, \.\.\.fields/);
  assert.match(consoleSource, /inputId: draft\.id/);
  assert.match(consoleSource, /expectedInputVersion: draft\.recordVersion/);
  assert.match(route, /Unsupported evaluation field/);
  assert.match(route, /directional-evaluation-finalize-v1": \["action", "actorRole", "caseId", "projectId", "floorId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"\]/);
});

test("Directional Input finalize is fail-closed on persisted lineage and preserves entity CAS", () => {
  assert.match(route, /directionalInputVersions\.find\(\(item\) => item\.id === String\(body\.inputId\)\)/);
  assert.match(route, /input\.caseId !== String\(body\.caseId\)/);
  assert.match(route, /input\.projectId !== String\(body\.projectId\)/);
  assert.match(route, /input\.floorId !== String\(body\.floorId\)/);
  assert.match(route, /input\.organisationId !== organisationId/);
  assert.match(route, /finalizeDirectionalInput\(\{ state: getAppState\(\), inputId: String\(body\.inputId\), actor, expectedVersion: body\.expectedInputVersion, idempotencyKey: String\(body\.idempotencyKey\) \}\)/);
  assert.match(route, /expectedInputVersion is required/);
});

test("Directional Input finalize does not broaden unrelated evaluation actions", () => {
  const finalize = route.match(/"directional-input-finalize-v1": \[(.*?)\]/)?.[1] ?? "";
  const evaluation = route.match(/"directional-evaluation-finalize-v1": \[(.*?)\]/)?.[1] ?? "";
  assert.match(finalize, /caseId/);
  assert.match(finalize, /projectId/);
  assert.match(finalize, /floorId/);
  assert.doesNotMatch(evaluation, /inputId|expectedInputVersion/);
});
