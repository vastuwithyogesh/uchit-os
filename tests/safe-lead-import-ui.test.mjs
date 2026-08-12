import test from "node:test";
import assert from "node:assert/strict";
import { source } from "./helpers/source-contracts.mjs";

test("Founder leads header opens a focused validation-first import sheet", () => {
  const workspace = source("components/unified-leads-workspace.tsx");
  const sheet = source("components/lead-import-sheet.tsx");
  assert.match(workspace, /LeadImportSheet/);
  for (const token of ["Upload leads", "Download template", "Preview rows", "Confirm import", "Import summary", "XLSX is deferred"]) assert.match(sheet, new RegExp(token));
  assert.match(sheet, /role="dialog"/);
  assert.match(sheet, /aria-modal="true"/);
  assert.match(sheet, /aria-live="polite"/);
  assert.match(sheet, /activeUser\.role !== "SUPER_ADMIN"/);
});

test("preview and confirm resubmit the same file with both concurrency tokens", () => {
  const sheet = source("components/lead-import-sheet.tsx");
  for (const field of ["expectedBatchHash", "expectedRevision", "expectedOrganisationVersion", "idempotencyKey"]) assert.match(sheet, new RegExp(field));
  assert.match(sheet, /setPreview\(payload\.preview\)/);
  assert.match(sheet, /Your file and preview remain here/);
  assert.match(sheet, /response\.status === 409 \|\| response\.status === 428/);
  assert.match(sheet, /Check the connection and retry; no import was committed/);
});

test("server route is Founder-only, exact-field, bounded, audited and replay-safe", () => {
  const route = source("app/api/optin-leads/route.ts");
  assert.match(route, /requireRouteActor\(request, "SUPER_ADMIN"\)/);
  assert.match(route, /membership\.capability !== "organisation_owner"/);
  assert.match(route, /ALLOWED_FORM_FIELDS/);
  assert.match(route, /LEAD_IMPORT_MAX_BYTES/);
  assert.match(route, /findImmutableAuditEventByIdempotency/);
  assert.match(route, /replay\.entityId !== preview\.batchHash/);
  assert.match(route, /idempotency key was already used for a different CSV file/);
  assert.match(route, /appendImmutableAuditEvent/);
  assert.match(route, /LEAD_CSV_IMPORT_CONFIRMED/);
  assert.match(route, /persistStateToDatabase\(undefined, snapshot\.revision \?\? undefined\)/);
  assert.match(route, /projectOrganisationState/);
  assert.doesNotMatch(route, /organisationId\s*=\s*formData|get\("organisationId"\)/);
});

test("import contract isolates approved source profile and never maps owner or protected state", () => {
  const parser = source("lib/lead-import.ts");
  const service = source("lib/workflow-service.ts");
  assert.match(parser, /VASTU_WITH_YOGESH_APPLY_LEADS/);
  assert.match(parser, /sourceAssignedTo/);
  assert.match(parser, /sourceDeletedAt/);
  assert.match(parser, /sourceProfile/);
  assert.match(parser, /Formula-like CSV cells are not allowed/);
  assert.match(parser, /REVIEW_REQUIRED/);
  assert.match(service, /preserveCanonical/);
  assert.match(service, /sourceRowHash/);
  assert.match(service, /unchanged \+= 1/);
  assert.match(service, /assignedSetterId = setterId/);
  const block = service.slice(service.indexOf("export function importInboundLeads"), service.indexOf("export function qualifyInboundLead"));
  assert.doesNotMatch(block, /payment|proposal|caseId|evaluation|reportVersions|assignedSetterId\s*=/i);
});

test("default template and preview expose the exact named format without private row data", () => {
  const route = source("app/api/optin-leads/route.ts");
  const parser = source("lib/lead-import.ts");
  const sheet = source("components/lead-import-sheet.tsx");
  const drawer = source("components/unified-leads-workspace.tsx");
  const bootstrap = source("app/api/bootstrap/route.ts");
  for (const column of ["id", "dob", "landing_page", "assigned_to", "deleted_at", "property_stage", "client_code"]) assert.match(parser, new RegExp(`"${column}"`));
  assert.match(route, /vastu-with-yogesh-apply-leads-template\.csv/);
  assert.match(parser, /rows\.map\(\(\{ parsed: _parsed, targetClientId: _targetClientId/);
  assert.match(sheet, /Detected format/);
  assert.match(sheet, /Source IDs remain immutable references/);
  assert.match(drawer, /Private source details/);
  assert.match(drawer, /activeUser\.role === "SUPER_ADMIN"/);
  assert.match(bootstrap, /access\.actor\.role === "SUPER_ADMIN"/);
  assert.match(bootstrap, /sourceProfile: _sourceProfile/);
  assert.doesNotMatch(drawer.slice(drawer.indexOf("<table"), drawer.indexOf("</table>")), /Date of birth|sourceRecordId|landingPage|referrer/);
});

test("mobile sheet and controls preserve full-screen, focus and 44px contracts", () => {
  const css = source("app/globals.css");
  assert.match(css, /lead-import-sheet/);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*lead-import-sheet \{ width: 100%/);
  assert.match(css, /lead-import-trigger \{ min-height: 44px/);
  assert.match(css, /lead-import-footer[\s\S]*grid-template-columns: 1fr/);
  assert.match(css, /prefers-reduced-motion/);
});
