import test from "node:test";
import assert from "node:assert/strict";
import { functionBody, source, switchCaseBody } from "./helpers/source-contracts.mjs";

const store = source("lib/store.ts");
const bootstrapRoute = source("app/api/bootstrap/route.ts");
const seedRoute = source("app/api/seed/route.ts");
const actions = source("app/api/actions/route.ts");
const bootstrapUi = source("components/bootstrap-console.tsx");
const stateUi = source("components/state-console.tsx");
const home = source("app/page.tsx");

test("a fresh production runtime starts empty instead of inventing demo clients or payments", () => {
  const empty = store.match(/export const createEmptyAppState[\s\S]*?\n\}\);/)?.[0] ?? "";
  assert.ok(empty);
  for (const collection of ["clients", "payments", "vastuCases", "reportVersions", "timelineEvents", "whatsappLogs"]) {
    assert.match(empty, new RegExp(`${collection}: \\[\\]`));
  }
  assert.match(store, /process\.env\.NODE_ENV === "production" \? createEmptyAppState\(\) : createDemoAppState\(\)/);
  assert.match(functionBody(store, "resetAppState"), /Demo reset is unavailable in production/);
});

test("production cannot sync an in-memory seed over durable state", () => {
  const post = functionBody(bootstrapRoute, "POST");
  assert.match(post, /requireRouteActor\(request, "SUPER_ADMIN"\)/);
  assert.match(post, /!isExplicitLocalDemo\(request\.headers\)/);
  assert.match(post, /Seed synchronization is disabled in production/);
  assert.ok(post.indexOf("isExplicitLocalDemo") < post.indexOf("persistStateToDatabase"));
  assert.match(post, /loadStateFromPersistence\(\)/);
});

test("demo fixtures and reset actions are local-demo only", () => {
  assert.match(functionBody(seedRoute, "GET"), /!isExplicitLocalDemo\(request\.headers\)/);
  assert.match(functionBody(seedRoute, "GET"), /Demo fixtures are unavailable outside an explicit local demo/);
  const reset = switchCaseBody(actions, "reset");
  assert.match(reset, /!isExplicitLocalDemo\(request\.headers\)/);
  assert.match(reset, /Demo reset is unavailable outside an explicit local demo/);
});

test("production data screens explain safe inspection and first use", () => {
  assert.match(bootstrapUi, /isLocalDemo \? \(/);
  assert.match(bootstrapUi, /Inspect the current saved records without overwriting them/);
  assert.doesNotMatch(bootstrapUi, /Sync state to persistence/);
  assert.match(stateUi, /Full production snapshot/);
  assert.doesNotMatch(stateUi, /restoring the demo|entire local app state/i);
  assert.match(home, /Start with your first client/);
  assert.match(home, /Add first client/);
});
