import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const component = await readFile(new URL("../components/directional-report-card-v1.tsx", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/actions/route.ts", import.meta.url), "utf8");
const domain = await readFile(new URL("../lib/directional-report-card-snapshot-v1.ts", import.meta.url), "utf8");

test("draft caller supplies scoped Case recordVersion plus global revision", () => {
  assert.match(component, /state\.vastuCases\.find\(\(item\) => item\.id === caseId && item\.projectId === projectId\)/);
  assert.match(component, /caseId, projectId, floorId, expectedRecordVersion: scopedCase\?\.recordVersion/);
  assert.match(component, /expectedRevision: state\.persistenceRevision/);
});

test("finalize and Stage-A callers supply current Report Card recordVersion", () => {
  assert.match(component, /snapshotId: card\?\.id, expectedRecordVersion: card\?\.recordVersion/);
  assert.match(component, /reportCardSnapshotId: card\?\.id, expectedRecordVersion: card\?\.recordVersion/);
  assert.match(component, /expectedRevision: state\.persistenceRevision/);
});

test("route allowlist and concurrency gate preserve all three protected actions", () => {
  assert.match(route, /directional-report-card-draft-v1/);
  assert.match(route, /directional-report-card-finalize-v1/);
  assert.match(route, /directional-stage-a-present-v1/);
  assert.match(route, /const hasEntityVersion = action === "commercial-policy-update" \? "expectedPolicyVersion" in body : "expectedRecordVersion" in body/);
  assert.match(route, /"directional-report-card-draft-v1": \["action", "actorRole", "caseId", "projectId", "floorId", "statements", "idempotencyKey", "expectedRecordVersion", "expectedRevision"\]/);
});

test("domain CAS authorities remain Case for draft and Report Card for later actions", () => {
  assert.match(domain, /caseRecord\.recordVersion !== input\.expectedRecordVersion/);
  assert.match(domain, /snapshot\.recordVersion !== input\.expectedRecordVersion/);
  assert.match(domain, /card\.recordVersion !== input\.expectedRecordVersion/);
});

test("Step 09 idempotency key remains bounded and non-PII", () => {
  assert.match(component, /idempotencyKey: key\.current/);
  assert.match(component, /key\.current = crypto\.randomUUID\(\)/);
  assert.doesNotMatch(component, /email|phone|displayName|propertyAddress/);
});
