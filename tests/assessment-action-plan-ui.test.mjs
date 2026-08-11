import test from "node:test";
import assert from "node:assert/strict";
import { source } from "./helpers/source-contracts.mjs";

test("assessment workspace follows the active case and exact write contracts", () => {
  const workspace = source("components/assessment-action-plan.tsx");
  assert.match(workspace, /getActiveCaseForClient/);
  for (const action of ["assessment-observation-upsert", "assessment-recommendation-upsert", "assessment-implementation-upsert"]) assert.match(workspace, new RegExp(action));
  assert.match(workspace, /expectedRecordVersion: activeCase\.recordVersion/);
  assert.match(workspace, /expectedRevision: state\.persistenceRevision/);
  assert.match(workspace, /useRef\(\{ observation: crypto\.randomUUID\(\), recommendation: crypto\.randomUUID\(\), task: crypto\.randomUUID\(\) \}\)/);
  assert.match(workspace, /idempotencyKey: idempotencyKeys\.current\.observation/);
  assert.match(workspace, /idempotencyKey: idempotencyKeys\.current\.recommendation/);
  assert.match(workspace, /idempotencyKey: idempotencyKeys\.current\.task/);
});

test("guided workflow uses verified evidence, confirmations, and server-safe owner roles", () => {
  const workspace = source("components/assessment-action-plan.tsx");
  assert.match(workspace, /selectedFloor\?\.locked/);
  assert.match(workspace, /floorId: selectedFloor\.id/);
  assert.match(workspace, /item\.floorId === selectedFloor\?\.id/);
  assert.match(workspace, /No evidence from a locked floor is available/);
  assert.ok((workspace.match(/window\.confirm/g) ?? []).length >= 3);
  for (const role of ["CLIENT", "CONSULTANT", "ARCHITECT", "STRUCTURAL_ENGINEER", "MEP_ENGINEER", "INTERIOR_DESIGNER", "CONTRACTOR", "SITE_TEAM"]) assert.match(workspace, new RegExp(`value="${role}"`));
  assert.doesNotMatch(workspace, /MEP_CONSULTANT|value="OTHER"/);
  assert.match(workspace, /<details><summary>Technical details<\/summary>/);
  assert.match(workspace, /aria-live="polite"/);
});

test("workspace explains concurrency recovery and stays staff-only", () => {
  const workspace = source("components/assessment-action-plan.tsx");
  const page = source("app/assessment/page.tsx");
  assert.match(workspace, /error\.status === 409/);
  assert.match(workspace, /Reload it, review the latest information/);
  assert.match(workspace, /error\.status === 428/);
  assert.match(page, /requirePageAccess\("CONSULTANT"\)/);
  assert.doesNotMatch(workspace, /client-portal|consultant notes/i);
});
