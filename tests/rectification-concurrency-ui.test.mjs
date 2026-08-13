import test from "node:test";
import assert from "node:assert/strict";
import { source } from "./helpers/source-contracts.mjs";

test("case writes carry both concurrency tokens and never silently retry", () => {
  const setup = source("components/case-master-console.tsx");
  assert.match(setup, /expectedRecordVersion: caseRecord\.recordVersion \?\? 0/);
  assert.match(setup, /expectedRevision: persistenceRevision/);
  assert.match(setup, /error\.status === 409/);
  assert.match(setup, /error\.status === 428/);
  assert.match(setup, /Reload latest case/);
  assert.match(setup, /review and reapply your changes/);
  assert.doesNotMatch(setup, /status === 409[^}]+postAction/s);
});

test("rectification requires a reason, confirmations, and separate approver", () => {
  const setup = source("components/case-master-console.tsx");
  assert.match(setup, /action: "case-rectification-request"/);
  assert.match(setup, /action: "case-rectification-approve"/);
  assert.match(setup, /rectificationReason\.trim\(\)\.length < 20/);
  assert.equal((setup.match(/window\.confirm/g) ?? []).length >= 3, true);
  assert.match(setup, /pendingRectification\.requestedBy\.id !== activeUser\.id/);
  assert.match(setup, /old report and evidence stay unchanged/i);
  assert.match(setup, /new linked case workspace/i);
});

test("active revision helpers and predecessor history are visible", () => {
  const setup = source("components/case-master-console.tsx");
  const evaluation = source("components/evaluation-console.tsx");
  const workspace = source("components/case-workspace.tsx");
  assert.match(setup, /getActiveCaseForClient/);
  assert.doesNotMatch(evaluation, /getActiveCaseForClient|clients\[0\]|floors\[0\]|evaluation-client|evaluation-floor/);
  assert.match(evaluation, /Locked evaluation context/);
  assert.match(setup, /Case revision/);
  assert.match(setup, /parentCaseId/);
  assert.match(workspace, /View revision history/);
});
