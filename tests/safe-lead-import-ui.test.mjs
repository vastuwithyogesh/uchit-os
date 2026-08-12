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

test("import contract rejects sensitive/authoritative columns and never maps owner or protected state", () => {
  const parser = source("lib/lead-import.ts");
  const service = source("lib/workflow-service.ts");
  assert.match(parser, /dob\|dateofbirth\|gender\|birthtime\|birthplace\|vehicle\|house\|rawpayload\|assignedto\|owner/);
  assert.match(parser, /Formula-like CSV cells are not allowed/);
  assert.match(parser, /REVIEW_REQUIRED/);
  assert.match(service, /preserveCanonical/);
  const block = service.slice(service.indexOf("export function importInboundLeads"), service.indexOf("export function qualifyInboundLead"));
  assert.doesNotMatch(block, /payment|proposal|caseId|evaluation|reportVersions|assignedSetterId\s*=/i);
});

test("mobile sheet and controls preserve full-screen, focus and 44px contracts", () => {
  const css = source("app/globals.css");
  assert.match(css, /lead-import-sheet/);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*lead-import-sheet \{ width: 100%/);
  assert.match(css, /lead-import-trigger \{ min-height: 44px/);
  assert.match(css, /lead-import-footer[\s\S]*grid-template-columns: 1fr/);
  assert.match(css, /prefers-reduced-motion/);
});
