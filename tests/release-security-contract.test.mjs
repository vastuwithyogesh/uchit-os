import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { source } from "./helpers/source-contracts.mjs";

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);

test("no local secret stores or environment files are tracked", () => {
  const forbidden = tracked.filter((file) => /(^|\/)(?:\.env(?:\..+)?|local-settings\.json)$/i.test(file) && file !== ".env.example");
  assert.deepEqual(forbidden, []);
  assert.equal(existsSync(resolve(process.cwd(), "data/local-settings.example.json")), true);
  assert.match(source(".gitignore"), /data\/local-settings\.json/);
});

test("tracked source contains no obvious committed credential values", () => {
  const findings = [];
  const textExtensions = /\.(?:ts|tsx|js|mjs|json|md|yml|yaml|toml|env|txt|csv)$/i;
  for (const file of tracked.filter((item) => textExtensions.test(item) && !item.startsWith("dist/") && item !== "pnpm-lock.yaml")) {
    const text = readFileSync(resolve(process.cwd(), file), "utf8");
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) findings.push(`${file}: private-key material`);
    const credentialLiterals = [...text.matchAll(/(?:SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL|DIRECT_URL)\s*[:=]\s*["']([^"'\r\n]{16,})["']/gi)];
    if (credentialLiterals.some((match) => !match[1].includes("${") && !/example|placeholder|your-/i.test(match[1]))) findings.push(`${file}: credential-like literal`);
  }
  assert.deepEqual(findings, []);
});

test("every API route declares an authentication or ownership gate", () => {
  const policies = {
    "app/api/actions/route.ts": /resolveRequestActor/,
    "app/api/audit/route.ts": /resolveRequestActor.*resolveActiveOrganisationContext/s,
    "app/api/bootstrap/route.ts": /requireRouteActor/,
    "app/api/branding/route.ts": /resolveRequestActor.*resolveActiveOrganisationContext/s,
    "app/api/case-files/route.ts": /requireRouteActor\(request, "CONSULTANT"\)/,
    "app/api/case-files/[assetId]/route.ts": /requireRouteActor\(request, "CONSULTANT"\)/,
    "app/api/chart-assets/route.ts": /requireRouteActor/,
    "app/api/client/portal/route.ts": /resolveRequestActor.*buildClientPortalView/s,
    "app/api/client/reports/[reportId]/route.ts": /resolveRequestActor.*findOwnedClient/s,
    "app/api/diagnostics/route.ts": /requireRouteActor\(request, "ADMIN"\)/,
    "app/api/foundation/access/route.ts": /resolveRequestActor.*resolveActiveOrganisationContext/s,
    "app/api/foundation/policy/route.ts": /resolveRequestActor.*resolveActiveOrganisationContext/s,
    "app/api/founder/cases/route.ts": /requireRouteActor/,
    "app/api/image-utility/assets/[versionId]/route.ts": /requireRouteActor\(request, "ADMIN"\).*organisation\.id/s,
    "app/api/image-utility/route.ts": /requireRouteActor\(request, "ADMIN"\).*resolveActiveOrganisationContext/s,
    "app/api/integrity/route.ts": /requireRouteActor\(request, "ADMIN"\)/,
    "app/api/media-library/route.ts": /requireRouteActor\(request, "SUPER_ADMIN"\).*organisation_owner/s,
    "app/api/migrations/status/route.ts": /requireRouteActor\(request, "SUPER_ADMIN"\).*organisation_owner/s,
    "app/api/integrations/lovable/events/route.ts": /verifyInboundSignature.*parseLovableIntegrationEvent/s,
    "app/api/integrations/lovable/reconcile/route.ts": /requireRouteActor\(request, "SUPER_ADMIN"\)/,
    "app/api/optin-leads/route.ts": /requireRouteActor/,
    "app/api/optin-leads/events/route.ts": /OPTIN_WEBHOOK_SECRET.*verifyInboundSignature/s,
    "app/api/payment-proofs/route.ts": /requireRouteActor/,
    "app/api/payment-proofs/files/[fileName]/route.ts": /requireRouteActor/,
    "app/api/public/qualification/[token]/route.ts": /resolveQualificationInvitation.*private, no-store/s,
    "app/api/report-deliveries/route.ts": /resolveRequestActor.*hasOrganisationCapability.*"DELIVERY"/s,
    "app/api/public/booking/[token]/route.ts": /resolveSecureGrant.*private, no-store/s,
    "app/api/public/media/[token]/route.ts": /resolveSecureGrant.*privateHeaders/s,
    "app/api/public/proposals/[token]/route.ts": /resolveFounderProposalGrant.*private, no-store/s,
    "app/api/public/proposals/[token]/pdf/route.ts": /resolveFounderProposalGrant.*private, no-store/s,
    "app/api/reports/[reportId]/pdf/route.ts": /resolveRequestActor.*resolveActiveOrganisationContext/s,
    "app/api/reports/[reportId]/print/route.ts": /resolveRequestActor.*canReadClientSnapshots/s,
    "app/api/seed/route.ts": /requireRouteActor\(request, "ADMIN"\)/,
    "app/api/session/route.ts": /resolveRequestActor/,
    "app/api/settings/route.ts": /requireRouteActor/,
    "app/api/settings/test/route.ts": /requireRouteActor\(request, "ADMIN"\)/,
    "app/api/staff-roles/route.ts": /requireRouteActor/,
    "app/api/state/route.ts": /requireRouteActor/,
    "app/api/timeline/route.ts": /requireRouteActor/,
    "app/api/utility/master/route.ts": /requireRouteActor/
  };
  const routes = readdirSync(resolve(process.cwd(), "app/api"), { recursive: true })
    .map((file) => `app/api/${String(file).replaceAll("\\", "/")}`)
    .filter((file) => /\/route\.ts$/.test(file));
  routes.sort();
  assert.deepEqual(routes, Object.keys(policies).sort());
  for (const [file, pattern] of Object.entries(policies)) assert.match(source(file), pattern, `${file} lacks its declared access gate`);
});

test("synthetic walkthrough and visual-review fixtures cannot render outside development", () => {
  for (const file of ["app/walkthrough/page.tsx", "app/visual-review/repository/page.tsx", "app/visual-review/remediation/page.tsx", "app/visual-review/image-utility/page.tsx"]) {
    assert.match(source(file), /process\.env\.NODE_ENV !== "development".*notFound\(\)/s, `${file} lacks its development-only boundary`);
  }
  for (const file of ["app/visual-review/branding/page.tsx", "app/visual-review/delivery/page.tsx"]) {
    assert.match(source(file), /process\.env\.NODE_ENV === "production".*notFound\(\)/s, `${file} lacks its production boundary`);
  }
});

test("critical journey gates remain connected without commercial or report bypasses", () => {
  const actions = source("app/api/actions/route.ts");
  for (const action of ["lead-qualify", "advance-proof-verify", "floor-create", "case-document-upsert", "utility-evaluate", "assessment-observation-upsert", "preview-report", "final-report-prepare", "report-approve", "verdict-release", "delivery-milestone-upsert"]) assert.match(actions, new RegExp(`case "${action}"`));
  assert.match(actions, /concurrencyActions.*case-document-upsert.*delivery-milestone-upsert/s);
  assert.match(actions, /setAppState\(rollbackState/);
  assert.match(source("lib/workflow-service.ts"), /assertCaseReadyForEvaluation/);
  assert.match(source("lib/report-artifacts.ts"), /artifactStillMatches/);
});

test("production demo elevation is disabled and health responses avoid PII and raw errors", () => {
  const auth = source("lib/auth.ts");
  assert.match(auth, /process\.env\.NODE_ENV !== "production".*UCHIT_VASTU_DEMO_MODE === "true"/s);
  const diagnostics = source("app/api/diagnostics/route.ts");
  assert.doesNotMatch(diagnostics, /client\.email|client\.phone|databaseUrl|serviceRole/);
  const health = source("app/api/settings/test/route.ts");
  assert.doesNotMatch(health, /actor\.email|actor\.fullName|error\.message/);
  assert.match(health, /protected server logs/);
});

test("upload, report, migration and deployment package gates are present", () => {
  const files = source("lib/case-file-assets.server.ts");
  assert.match(files, /detectedMime.*hasPolyglotMarker/s);
  assert.match(files, /R2\.delete\(objectKey\)/);
  assert.match(source("lib/report-artifacts.ts"), /sha256Hex.*canonicalReportPayload/s);
  assert.match(source("db/migrations.ts"), /version: 3.*case_file_assets/s);
  assert.match(source("db/migrations.ts"), /version: 4.*staff_role_assignment_audit/s);
  const prepare = source("scripts/prepare-sites.mjs");
  assert.match(prepare, /const packageEntries = \[/);
  assert.doesNotMatch(prepare, /local-settings\.json/);
});
