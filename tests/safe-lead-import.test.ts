import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLeadImportPreview, LEAD_IMPORT_MAX_ROWS, LEAD_IMPORT_MINIMAL_TEMPLATE_COLUMNS,
  LEAD_IMPORT_TEMPLATE_COLUMNS, normalizeIndianSourcePhone, publicLeadImportPreview
} from "../lib/lead-import.ts";
import type { ClientRecord, InboundLeadRecord } from "../lib/domain.ts";
import { applyLeadHeaders, buildSanitizedApplyLeadsCsv } from "./fixtures/apply-leads-sanitized.mjs";

const minimalHeader = LEAD_IMPORT_MINIMAL_TEMPLATE_COLUMNS.join(",");
const minimalRow = "Synthetic Lead,synthetic@example.test,+919876543210,Pune,EXISTING_SPACE,Owner referral,2026-08-01,Residential enquiry,referral,offline,pilot,,,NEW";
const minimalCsv = (...rows: string[]) => `${minimalHeader}\n${rows.join("\n")}`;

function client(id: string, email: string, phone: string): ClientRecord {
  return { id, displayName: id, email, phone, city: "Pune", source: "UCHIT", assignedSetterId: "", stage: "NEW", pipelineStage: "NEW", organisationId: "org-a", recordVersion: 1 };
}

test("the authoritative 23-column format is exact, detected and PII-safe in public preview", () => {
  assert.deepEqual([...LEAD_IMPORT_TEMPLATE_COLUMNS], applyLeadHeaders);
  const first = buildLeadImportPreview(buildSanitizedApplyLeadsCsv(), { clients: [], leads: [], organisationId: "org-a" });
  const second = buildLeadImportPreview(buildSanitizedApplyLeadsCsv(), { clients: [], leads: [], organisationId: "org-a" });
  assert.equal(first.formatLabel, "Vastu With Yogesh Apply Leads");
  assert.equal(first.rows.length, 97);
  assert.equal(first.counts.invalid, 0);
  assert.equal(first.counts.reviewRequired, 3);
  assert.equal(first.counts.create, 94);
  assert.equal(first.batchHash, second.batchHash);
  assert.equal(first.rows[9].parsed?.city, "305406");
  assert.equal(first.rows[0].parsed?.phone, "+919000000001");
  assert.equal(first.rows[94].parsed?.phone, "+447700900095");
  assert.equal(first.rows[94].disposition, "REVIEW_REQUIRED");
  assert.match(first.rows[94].reason, /lost has no approved disqualification reason/);
  assert.equal(first.rows[95].disposition, "REVIEW_REQUIRED");
  assert.equal(first.rows[96].disposition, "REVIEW_REQUIRED");
  assert.equal(first.rows[0].parsed?.sourceProfile?.format, "VASTU_WITH_YOGESH_APPLY_LEADS");
  const output = publicLeadImportPreview(first);
  assert.equal("parsed" in output.rows[0], false);
  assert.equal("targetClientId" in output.rows[0], false);
});

test("Indian 10-digit and explicit E.164 normalize while unprefixed other lengths require review", () => {
  assert.deepEqual(normalizeIndianSourcePhone("98765 43210"), { canonical: "+919876543210", valid: true, reviewRequired: false });
  assert.deepEqual(normalizeIndianSourcePhone("+44 7700 900123"), { canonical: "+447700900123", valid: true, reviewRequired: false });
  assert.deepEqual(normalizeIndianSourcePhone("91987654321"), { canonical: "", valid: false, reviewRequired: true });
});

test("minimal template remains supported and exact identity linking is organisation-scoped", () => {
  const create = buildLeadImportPreview(minimalCsv(minimalRow), { clients: [], leads: [], organisationId: "org-a" });
  assert.equal(create.formatLabel, "Uchit minimal template");
  assert.equal(create.rows[0].disposition, "CREATE");
  const exact = buildLeadImportPreview(minimalCsv(minimalRow), { clients: [client("UC-A", "synthetic@example.test", "+919876543210")], leads: [], organisationId: "org-a" });
  assert.equal(exact.rows[0].disposition, "LINK_EXISTING");
  const otherOrganisation = buildLeadImportPreview(minimalCsv(minimalRow), { clients: [], leads: [], organisationId: "org-b" });
  assert.notEqual(create.rows[0].targetClientId, otherOrganisation.rows[0].targetClientId);
});

test("source identifiers replay safely and conflicting identity/source bindings require review", () => {
  const preview = buildLeadImportPreview(buildSanitizedApplyLeadsCsv(), { clients: [], leads: [], organisationId: "org-a" });
  const parsed = preview.rows[0].parsed!;
  const existing: InboundLeadRecord = {
    id: "lead-existing", uniqueClientId: "UC-A", identityKey: "email:synthetic-001@example.test",
    fullName: parsed.fullName, email: parsed.email, phone: parsed.phone, city: parsed.city, source: parsed.source,
    score: 60, message: "", status: "NEW", importedAt: "2026-08-11T00:00:00Z", firstSeenAt: "2026-08-11T00:00:00Z",
    lastSeenAt: "2026-08-11T00:00:00Z", submissionCount: 1, duplicateCount: 0, isReturningLead: false,
    organisationId: "org-a", sourceRecordId: parsed.sourceRecordId, externalClientCode: parsed.externalClientCode,
    sourceProfile: parsed.sourceProfile, recordVersion: 1
  };
  const replay = buildLeadImportPreview(buildSanitizedApplyLeadsCsv(), { clients: [client("UC-A", parsed.email, parsed.phone)], leads: [existing], organisationId: "org-a" });
  assert.equal(replay.rows[0].disposition, "LINK_EXISTING");
  const conflict = buildLeadImportPreview(buildSanitizedApplyLeadsCsv(), {
    clients: [client("UC-A", parsed.email, "+911111111111"), client("UC-B", "other@example.test", parsed.phone)], leads: [existing], organisationId: "org-a"
  });
  assert.equal(conflict.rows[0].disposition, "REVIEW_REQUIRED");
});

test("schema, formula, unsafe URL, source stage and whole-batch validation fail closed", () => {
  const real = buildSanitizedApplyLeadsCsv();
  const missing = buildLeadImportPreview(real.replace(",client_code\n", "\n"), { clients: [], leads: [] });
  assert.match(missing.batchErrors.join(" "), /Missing: client_code/);
  const extra = buildLeadImportPreview(real.replace("client_code\n", "client_code,secret\n"), { clients: [], leads: [] });
  assert.match(extra.batchErrors.join(" "), /Unsupported: secret/);
  const formula = buildLeadImportPreview(real.replace("Synthetic Lead 001", "=HYPERLINK(x)"), { clients: [], leads: [] });
  assert.equal(formula.counts.invalid, 1);
  const unsafeUrl = buildLeadImportPreview(real.replace("/apply,https://example.test", "javascript:alert(1),https://example.test"), { clients: [], leads: [] });
  assert.equal(unsafeUrl.counts.invalid, 1);
  const encoding = buildLeadImportPreview(real.replace("Synthetic Lead 001", "Bad\uFFFDName"), { clients: [], leads: [] });
  assert.match(encoding.batchErrors.join(" "), /UTF-8/);
  assert.equal(formula.canImport, false);
});

test("duplicate source IDs and oversized row counts invalidate the entire batch", () => {
  const real = buildSanitizedApplyLeadsCsv();
  const records = real.split("\n");
  records[2] = records[2].replace("synthetic-source-002", "synthetic-source-001");
  const duplicate = buildLeadImportPreview(records.join("\n"), { clients: [], leads: [] });
  assert.equal(duplicate.counts.invalid, 1);
  assert.equal(duplicate.canImport, false);
  const tooMany = buildLeadImportPreview(`${minimalHeader}\n${Array.from({ length: LEAD_IMPORT_MAX_ROWS + 1 }, (_, index) => minimalRow.replace("Synthetic Lead", `Lead ${index}`)).join("\n")}`, { clients: [], leads: [] });
  assert.match(tooMany.batchErrors.join(" "), /row limit/);
});
