import test from "node:test";
import assert from "node:assert/strict";
import { source } from "./helpers/source-contracts.mjs";

test("staff home makes the workspace the primary action and avoids stale launch copy", () => {
  const page = source("app/page.tsx");
  assert.match(page, /FounderFlowHome/);
  assert.match(page, /buildFounderScorecard/);
  assert.doesNotMatch(page, /Saturday, August 8, 2026|Launch readiness|Sites-ready local build|loose scaffold/);
});

test("workspace explains now, next, and after in plain language", () => {
  const workspace = source("components/case-workspace.tsx");
  assert.match(workspace, /What needs attention\?/);
  assert.match(workspace, /Do this next/);
  assert.match(workspace, /What happens after/);
  assert.match(workspace, /What is waiting/);
  assert.match(workspace, /Show task details/);
});

test("workspace has accessible search, filters, and recovery guidance", () => {
  const workspace = source("components/case-workspace.tsx");
  const page = source("app/workspace/page.tsx");
  assert.match(workspace, /aria-label="Find a client or case"/);
  assert.match(workspace, /aria-pressed=/);
  assert.match(workspace, /Show all tasks/);
  assert.match(page, /Nothing has been changed/);
});
