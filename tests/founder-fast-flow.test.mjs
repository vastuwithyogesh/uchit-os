import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

test("fast flow is restricted to staging or local hosts and an owner", () => {
  const source = read("lib/founder-fast-flow.ts");
  assert.match(source, /staging/);
  assert.match(source, /isFounderFastFlowRequest/);
  assert.match(source, /return isFounderOwner && isFounderFastFlowHost/);
});

test("Founder fast flow opens every step without removing the current-step contract", () => {
  const flow = read("lib/founder-flow.ts");
  const page = read("components/founder-flow.tsx");
  assert.match(flow, /fastFlow = false/);
  assert.match(flow, /if \(fastFlow\) return Boolean\(getFounderFlowStep/);
  assert.match(page, /Fast flow · staging/);
  assert.match(page, /fastFlow \|\| isComplete/);
});

test("server fast flow remains scoped to the authenticated Founder organisation owner", () => {
  const route = read("app/api/actions/route.ts");
  assert.match(route, /foundation\.membership\.role === "SUPER_ADMIN"/);
  assert.match(route, /foundation\.membership\.capability === "organisation_owner"/);
  assert.match(route, /fastFlow \|\| baseCanEditFloorWorkspaces/);
});
