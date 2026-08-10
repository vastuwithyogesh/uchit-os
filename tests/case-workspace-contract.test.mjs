import test from "node:test";
import assert from "node:assert/strict";
import { source, functionBody } from "./helpers/source-contracts.mjs";

test("case workspace is staff-only and appears in staff navigation", () => {
  const page = source("app/workspace/page.tsx");
  const policy = source("lib/access-policy.ts");
  assert.match(page, /requirePageAccess\("SETTER"\)/);
  assert.match(policy, /href: "\/workspace"[\s\S]*minimumRole: "SETTER"/);
  assert.match(functionBody(policy, "getAccessiblePageRules"), /item\.href === "\/client"/);
});

test("workspace projection limits setter visibility and remains read-only", () => {
  const helper = source("lib/case-workspace.ts");
  const projection = functionBody(helper, "buildCaseWorkspaceProjection");
  assert.match(projection, /actor\.role === "CLIENT"/);
  assert.match(projection, /actor\.role !== "SETTER" \|\| client\.assignedSetterId === actor\.id/);
  assert.doesNotMatch(helper, /setAppState|saveState|fetch\(|POST|PATCH|DELETE/);
});

test("workspace shows plain next steps, blockers, SLA and specialist links", () => {
  const component = source("components/case-workspace.tsx");
  assert.match(component, /Blocked by/);
  assert.match(component, /Next action/);
  assert.match(component, /slaLabel/);
  assert.match(component, /item\.links\.map/);
  assert.match(component, /type="search"/);
});
