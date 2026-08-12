import test from "node:test";
import assert from "node:assert/strict";
import { source } from "./helpers/source-contracts.mjs";

test("Founder Zoom adapter is hard-bound, least-privilege and dormant", () => {
  const connector = source("lib/founder-zoom.server.ts");
  const env = source("lib/runtime-env.ts");
  const diagnostics = source("app/api/diagnostics/route.ts");
  for (const key of ["ZOOM_ACCOUNT_ID", "ZOOM_CLIENT_ID", "ZOOM_CLIENT_SECRET", "ZOOM_HOST_EMAIL", "ZOOM_INTEGRATION_ACTIVATION"]) assert.match(env, new RegExp(key));
  for (const scope of ["meeting:write:admin", "meeting:read:admin", "user:read:admin"]) assert.match(connector, new RegExp(scope));
  assert.match(connector, /iyogesh2020@gmail\.com/);
  assert.match(connector, /BOUNDED_SYNTHETIC_SMOKE_APPROVED/);
  assert.match(connector, /liveActivationEnabled: false/);
  assert.match(diagnostics, /deferredIntegrations: \{ zoom \}/);
  assert.doesNotMatch(diagnostics, /ZOOM_ACCOUNT_ID|ZOOM_CLIENT_ID|ZOOM_CLIENT_SECRET/);
});

test("Zoom public and diagnostics projections exclude provider ids, links and credentials", () => {
  const booking = source("app/api/public/booking/[token]/route.ts");
  const diagnosticsUi = source("components/diagnostics-console.tsx");
  assert.doesNotMatch(booking, /providerMeetingId|privateJoinMetadataCiphertext|joinLink|ZOOM_CLIENT_SECRET/);
  assert.doesNotMatch(diagnosticsUi, /ZOOM_ACCOUNT_ID|ZOOM_CLIENT_ID|ZOOM_CLIENT_SECRET|join_url|start_url/);
  assert.match(diagnosticsUi, /Live activation remains disabled/);
});

test("v14 only pins historical Zoom host and OAuth scope lineage", () => {
  const migrations = source("db/migrations.ts");
  assert.match(migrations, /version: 14/);
  for (const column of ["host_user_email", "oauth_connection_type", "scope_snapshot_json"]) assert.match(migrations, new RegExp(column));
  assert.match(migrations, /idx_zoom_binding_host/);
});

test("real provider smoke requires explicit acknowledgement and returns boolean evidence only", () => {
  const smoke = source("scripts/run-founder-zoom-synthetic-smoke.mjs");
  assert.match(smoke, /--acknowledge-bounded-private-staging-smoke/);
  assert.match(smoke, /READY_FOR_BOUNDED_SYNTHETIC_SMOKE/);
  assert.match(smoke, /credentialsOrLinksReturned: false/);
  assert.match(smoke, /productionActivationEnabled: false/);
  assert.doesNotMatch(smoke, /console\.log|providerMeetingId:/);
});
