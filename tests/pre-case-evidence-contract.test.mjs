import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read = (file) => fs.readFileSync(file, "utf8");

test("pre-Case questionnaire evidence is scoped and classification-bound", () => {
  const route = read("app/api/pre-case-evidence/route.ts");
  const service = read("lib/pre-case-evidence.server.ts");
  const migration = read("db/migrations.ts");
  assert.match(service, /QUALIFICATION_QUESTIONNAIRE_SNAPSHOT/);
  assert.match(service, /organisationId.*clientId.*leadId.*prospectiveProjectId/);
  assert.match(route, /clientId.*leadId.*prospectiveProjectId/);
  assert.match(migration, /pre_case_evidence_assets/);
  assert.doesNotMatch(service, /caseId|floorId/);
  assert.doesNotMatch(route, /ocr|tesseract|extract.*answer|interpret/i);
});

test("replacement supersedes history and preserves immutable R2 bytes", () => {
  const service = read("lib/pre-case-evidence.server.ts");
  assert.match(service, /R2\.put/);
  assert.match(service, /status='SUPERSEDED'/);
  assert.match(service, /checksumSha256/);
  assert.match(service, /R2\.delete\(objectKey\)/);
});
