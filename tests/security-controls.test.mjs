import test from "node:test";
import assert from "node:assert/strict";
import { functionBody, source, switchCaseBody } from "./helpers/source-contracts.mjs";

const permissions = source("lib/permissions.ts");
const accessPolicy = source("lib/access-policy.ts");
const actions = source("app/api/actions/route.ts");
const settingsRoute = source("app/api/settings/route.ts");
const settingsStore = source("lib/server-settings.ts");
const packaging = source("scripts/prepare-sites.mjs");
const workflow = source("lib/workflow-service.ts");

function allowedRoles(permissionName) {
  return [...functionBody(permissions, permissionName).matchAll(/user\.role === "([A-Z_]+)"/g)].map((match) => match[1]);
}

test("role permission matrix preserves least privilege on high-risk actions", () => {
  assert.deepEqual(allowedRoles("canVerifyPayments"), ["ADMIN", "SUPER_ADMIN"]);
  assert.deepEqual(allowedRoles("canEvaluateCases"), ["CONSULTANT", "ADMIN", "SUPER_ADMIN"]);
  assert.deepEqual(allowedRoles("canReadClientSnapshots"), ["CONSULTANT", "ADMIN", "SUPER_ADMIN"]);
  assert.deepEqual(allowedRoles("canReleaseVerdict"), ["ADMIN", "SUPER_ADMIN"]);
  assert.deepEqual(allowedRoles("canApproveCommercialProposal"), ["SUPER_ADMIN"]);
});

test("restricted pages keep their minimum role boundaries", () => {
  assert.match(accessPolicy, /href: "\/evaluation"[^\n]+minimumRole: "CONSULTANT"/);
  assert.match(accessPolicy, /href: "\/reports"[^\n]+minimumRole: "CONSULTANT"/);
  assert.match(accessPolicy, /href: "\/settings"[^\n]+minimumRole: "ADMIN"/);
  assert.match(accessPolicy, /href: "\/state"[^\n]+minimumRole: "SUPER_ADMIN"/);
});

for (const action of ["advance-pay", "advance-proof-verify", "balance-pay", "balance-proof-verify"]) {
  test(`${action} is guarded by payment-verifier authorization`, () => {
    assert.match(switchCaseBody(actions, action), /if \(!canVerifyPayments\(actor\)\)/);
  });
}

for (const action of ["shakti-rank", "utility-evaluate"]) {
  test(`${action} is guarded by evaluation authorization`, () => {
    assert.match(switchCaseBody(actions, action), /if \(!canEvaluateCases\(actor\)\)/);
  });
}

test("settings reads are redacted and mutations require SUPER_ADMIN", () => {
  assert.match(functionBody(settingsRoute, "GET"), /requireRouteActor\(request, "ADMIN"\)/);
  assert.match(functionBody(settingsRoute, "GET"), /redactConnectionSettings\(settings\)/);
  assert.match(functionBody(settingsRoute, "POST"), /requireRouteActor\(request, "SUPER_ADMIN"\)/);
  assert.match(functionBody(settingsRoute, "POST"), /redactConnectionSettings\(settings\)/);
});

test("secret-bearing settings are blanked by the redaction contract", () => {
  const body = functionBody(settingsStore, "redactConnectionSettings");
  for (const key of ["databaseUrl", "directUrl", "supabaseAnonKey", "supabaseServiceRoleKey"]) {
    assert.match(body, new RegExp(`${key}: ""`));
  }
});

test("deployment package is allowlisted and excludes secrets, local settings, archives, and generated output", () => {
  assert.match(packaging, /const packageEntries = \[/);
  const list = packaging.match(/const packageEntries = \[([\s\S]*?)\];/)?.[1] ?? "";
  for (const forbidden of [".env", "local-settings.json", "site-archive", "dist", "work", ".git"]) {
    const escaped = forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.doesNotMatch(list, new RegExp(`['\"]${escaped}['\"]`));
  }
  assert.match(packaging, /const packageDataEntries = \["data\/residential-tab\.csv"\]/);
});

test("unconnected messaging never claims external delivery", () => {
  const whatsapp = functionBody(workflow, "sendWhatsAppTemplate");
  assert.match(whatsapp, /status: "QUEUED"/);
  assert.match(whatsapp, /provider delivery is not configured/);
  assert.doesNotMatch(whatsapp, /status: "SENT"/);

  const outreach = functionBody(workflow, "recordClientOutreachSend");
  assert.match(outreach, /status=RECORDED/);
  assert.match(outreach, /status: "RECORDED"/);
  assert.doesNotMatch(outreach, /status: "SENT"/);
});
