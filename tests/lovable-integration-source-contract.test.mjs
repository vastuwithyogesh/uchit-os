import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = Object.fromEntries(await Promise.all([
  ["contract", "../lib/lovable-integration-contract.ts"],
  ["wrapper", "../lib/lovable-wrapper.server.ts"],
  ["outbox", "../lib/integration-outbox.ts"],
  ["events", "../app/api/integrations/lovable/events/route.ts"],
  ["reconcile", "../app/api/integrations/lovable/reconcile/route.ts"],
  ["env", "../lib/runtime-env.ts"]
].map(async ([key, path]) => [key, await readFile(new URL(path, import.meta.url), "utf8")]))) ;

test("dormant wrapper is environment-bound and fail-closed", () => {
  assert.match(files.contract, /LOVABLE_INTEGRATION_SCHEMA_VERSION/);
  assert.match(files.contract, /sourceEnvironment/);
  assert.match(files.wrapper, /assertLovableEnvironmentBinding/);
  assert.match(files.wrapper, /assertNoLiveActivation/);
  assert.match(files.env, /LOVABLE_INTEGRATION_ENVIRONMENT/);
  assert.match(files.env, /LOVABLE_INTEGRATION_SOURCE_KEY/);
});

test("signed ingress and reconcile surfaces never expose or mutate while dormant", () => {
  assert.match(files.events, /verifyInboundSignature/);
  assert.match(files.events, /parseLovableIntegrationEvent/);
  assert.match(files.events, /assertNoLiveActivation/);
  assert.match(files.events, /status: 503/);
  assert.match(files.reconcile, /requireRouteActor\(request, "SUPER_ADMIN"\)/);
  assert.match(files.reconcile, /assertNoLiveActivation/);
  assert.match(files.reconcile, /status: 503/);
});

test("canonical outbox projection is privacy-minimized and replay-safe", () => {
  assert.match(files.outbox, /canonicalProjectionVersion/);
  assert.match(files.outbox, /stableOutboxIdempotencyKey/);
  assert.match(files.outbox, /assertOutboxTransition/);
  assert.match(files.outbox, /syncStatus/);
  assert.doesNotMatch(files.outbox, /email|phone|notes|fullName|payloadText/);
});
