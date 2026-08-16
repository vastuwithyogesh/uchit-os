import test from "node:test";
import assert from "node:assert/strict";
import { functionBody, source } from "./helpers/source-contracts.mjs";

const storage = source("lib/case-file-assets.server.ts");
const collection = source("app/api/case-files/route.ts");
const download = source("app/api/case-files/[assetId]/route.ts");
const workflow = source("lib/workflow-service.ts");
const actions = source("app/api/actions/route.ts");
const migrations = source("db/migrations.ts");
const schema = source("db/schema.ts");
const clientPortal = source("lib/client-portal.ts");
const reportArtifacts = source("lib/report-artifacts.ts");

test("case-file routes require consultant access and exact active case scope", () => {
  assert.match(collection, /requireRouteActor\(request, "CONSULTANT"\)/);
  assert.match(download, /requireRouteActor\(request, "CONSULTANT"\)/);
  assert.match(collection, /getActiveCaseForClient/);
  assert.match(download, /getActiveCaseForClient/);
  assert.match(collection, /floor.*belong/s);
  assert.match(download, /caseId/);
  assert.match(functionBody(storage, "listCaseFiles"), /COALESCE\(floor_label, ''\) = \?/);
});

test("uploads validate size, claimed MIME, magic bytes and polyglot markers", () => {
  const save = functionBody(storage, "saveCaseFileUpload");
  assert.match(storage, /20 \* 1024 \* 1024/);
  for (const mime of ["application/pdf", "image/png", "image/jpeg", "image/webp"]) assert.match(storage, new RegExp(mime.replace("/", "\\/")));
  assert.match(save, /detectedMime\(bytes\)/);
  assert.match(save, /hasPolyglotMarker/);
  assert.match(save, /file\.size < 1/);
});

test("R2 keys and evidence refs are opaque, immutable and checksummed", () => {
  const save = functionBody(storage, "saveCaseFileUpload");
  assert.match(save, /crypto\.randomUUID\(\)/);
  assert.match(save, /case-file-\$\{id\}/);
  assert.match(save, /case-files\/\$\{id\}/);
  assert.match(save, /sha256Hex\(bytes\)/);
  assert.match(save, /R2\.put\(objectKey, bytes/);
  assert.match(save, /'IMMUTABLE'/);
  assert.doesNotMatch(save, /dataUrl|readFile|writeFile/);
});

test("D1 failure compensates the private object and metadata never exposes object keys", () => {
  const save = functionBody(storage, "saveCaseFileUpload");
  assert.match(save, /catch \(error\).*R2\.delete\(objectKey\)/s);
  assert.doesNotMatch(functionBody(storage, "publicMetadata"), /object_key|objectKey/);
  assert.doesNotMatch(functionBody(storage, "listCaseFiles"), /SELECT \*/);
  assert.doesNotMatch(functionBody(storage, "publicMetadata"), /checksum|uploadedBy|uploaded_by/);
});

test("upload retries deduplicate exact scoped content before creating an R2 object", () => {
  const save = functionBody(storage, "saveCaseFileUpload");
  assert.match(save, /checksum_sha256 = \?/);
  assert.match(save, /COALESCE\(floor_label, ''\) = \?/);
  assert.match(save, /if \(duplicate\) return publicMetadata\(duplicate\)/);
  assert.ok(save.indexOf("if (duplicate)") < save.indexOf("crypto.randomUUID()"));
});

test("document action resolves evidence against case revision, service and floor", () => {
  const upsert = functionBody(workflow, "upsertCaseDocument");
  assert.match(upsert, /await assertCaseFileEvidenceScope/);
  assert.match(upsert, /caseRevisionNumber: revisionNumber/);
  assert.match(upsert, /serviceType, floorLabel/);
  assert.match(actions, /document: await upsertCaseDocument/);
  const assertion = functionBody(storage, "assertCaseFileEvidenceScope");
  assert.match(assertion, /evidence_ref = \?.*case_id = \?.*case_revision_number = \?.*service_type = \?/s);
  assert.match(assertion, /COALESCE\(floor_label, ''\) = \?/);
});

test("downloads stream privately with safe attachment headers", () => {
  assert.match(download, /Cache-Control": "private, no-store"/);
  assert.match(download, /X-Content-Type-Options": "nosniff"/);
  assert.match(download, /Content-Disposition.*attachment/);
  assert.match(download, /file\.object\.body/);
  assert.doesNotMatch(download, /object_key/);
  assert.match(download, /floorLabel/);
  const read = functionBody(storage, "readCaseFile");
  assert.match(read, /COALESCE\(floor_label, ''\) = \?/);
  assert.match(read, /4\[0-9a-f\]\{3\}.*\[89ab\]/);
  assert.match(download, /const scopedOrganisationId = localFixture \? \(caseRecord\?\.organisationId \?\? organisationId\) : organisationId/);
});

test("collection responses are non-cacheable, nosniff, and downstream projections expose no protected refs", () => {
  assert.match(collection, /Cache-Control": "private, no-store"/);
  assert.match(collection, /X-Content-Type-Options": "nosniff"/);
  assert.doesNotMatch(clientPortal, /case-file|caseFiles|evidenceRef/);
  assert.doesNotMatch(functionBody(reportArtifacts, "buildVerifiedDocumentComposition"), /evidenceRef|checksum|uploadedBy|reviewObservation|objectKey/);
});

test("polyglot checks reject executable HTML and PDF JavaScript markers", () => {
  const polyglot = functionBody(storage, "hasPolyglotMarker");
  assert.match(polyglot, /<script/);
  assert.match(polyglot, /doctype/);
  assert.match(polyglot, /JavaScript\|JS/);
});

test("case file schema is deterministic and indexed for exact queries", () => {
  for (const sourceText of [migrations, schema]) {
    assert.match(sourceText, /case_file_assets/);
    assert.match(sourceText, /evidence_ref TEXT NOT NULL UNIQUE/);
    assert.match(sourceText, /idx_case_file_assets_scope/);
    assert.match(sourceText, /idx_case_file_assets_floor/);
  }
});
