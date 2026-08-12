import test from "node:test";
import assert from "node:assert/strict";
import { buildLeadImportPreview, LEAD_IMPORT_MAX_ROWS, LEAD_IMPORT_TEMPLATE_COLUMNS, publicLeadImportPreview } from "../lib/lead-import.ts";
import type { ClientRecord } from "../lib/domain.ts";

const header = LEAD_IMPORT_TEMPLATE_COLUMNS.join(",");
const validRow = "Synthetic Lead,synthetic@example.test,+919876543210,Pune,EXISTING_SPACE,Owner referral,2026-08-01,Residential enquiry,referral,offline,pilot,,,NEW";
const csv = (...rows: string[]) => `${header}\n${rows.join("\n")}`;

function client(id: string, email: string, phone: string): ClientRecord {
  return { id, displayName: id, email, phone, city: "Pune", source: "UCHIT", assignedSetterId: "", stage: "NEW", pipelineStage: "NEW", organisationId: "org-a", recordVersion: 1 };
}

test("valid safe CSV previews a deterministic permanent-client create", () => {
  const first = buildLeadImportPreview(csv(validRow), { clients: [], leads: [], organisationId: "org-a" });
  const second = buildLeadImportPreview(csv(validRow), { clients: [], leads: [], organisationId: "org-a" });
  assert.equal(first.canImport, true);
  assert.equal(first.counts.create, 1);
  assert.equal(first.rows[0].disposition, "CREATE");
  assert.equal(first.batchHash, second.batchHash);
  const otherOrganisation = buildLeadImportPreview(csv(validRow), { clients: [], leads: [], organisationId: "org-b" });
  assert.notEqual(first.rows[0].targetClientId, otherOrganisation.rows[0].targetClientId);
  const output = publicLeadImportPreview(first);
  assert.equal("parsed" in output.rows[0], false);
  assert.equal("targetClientId" in output.rows[0], false);
});

test("exact identity links; in-file duplicate dedupes; ambiguous identity fails closed", () => {
  const existing = [client("UC-A", "synthetic@example.test", "+919876543210")];
  const exact = buildLeadImportPreview(csv(validRow), { clients: existing, leads: [] });
  assert.equal(exact.rows[0].disposition, "LINK_EXISTING");
  const duplicate = buildLeadImportPreview(csv(validRow, validRow), { clients: [], leads: [] });
  assert.deepEqual(duplicate.rows.map((row) => row.disposition), ["CREATE", "DUPLICATE_IN_FILE"]);
  const ambiguousRow = "Ambiguous,one@example.test,+919999999999,Pune,,CSV,2026-08-01,,,,,,,NEW";
  const ambiguous = buildLeadImportPreview(csv(ambiguousRow), { clients: [client("UC-A", "one@example.test", "+911111111111"), client("UC-B", "two@example.test", "+919999999999")], leads: [] });
  assert.equal(ambiguous.rows[0].disposition, "REVIEW_REQUIRED");
  assert.equal(ambiguous.counts.reviewRequired, 1);
});

test("unknown stages and services require review without canonical transition", () => {
  const stage = buildLeadImportPreview(csv(validRow.replace(/,NEW$/, ",converted")), { clients: [], leads: [] });
  assert.equal(stage.rows[0].disposition, "REVIEW_REQUIRED");
  const service = buildLeadImportPreview(csv(validRow.replace("EXISTING_SPACE", "UNAPPROVED_SERVICE")), { clients: [], leads: [] });
  assert.equal(service.rows[0].disposition, "REVIEW_REQUIRED");
});

test("malformed, sensitive, formula, invalid encoding and oversized-row inputs are rejected", () => {
  const sensitive = buildLeadImportPreview("full_name,email,dob\nSynthetic,synthetic@example.test,2000-01-01", { clients: [], leads: [] });
  assert.match(sensitive.batchErrors.join(" "), /Sensitive or authoritative columns/);
  const unexpected = buildLeadImportPreview("full_name,email,secret_payload\nSynthetic,synthetic@example.test,x", { clients: [], leads: [] });
  assert.match(unexpected.batchErrors.join(" "), /Unsupported columns/);
  const formula = buildLeadImportPreview(csv(validRow.replace("Synthetic Lead", "=HYPERLINK(x)")), { clients: [], leads: [] });
  assert.equal(formula.counts.invalid, 1);
  const encoding = buildLeadImportPreview(`${header}\nBad\uFFFDName,bad@example.test,,,,,,,,,,,,NEW`, { clients: [], leads: [] });
  assert.match(encoding.batchErrors.join(" "), /UTF-8/);
  const tooMany = buildLeadImportPreview(`${header}\n${Array.from({ length: LEAD_IMPORT_MAX_ROWS + 1 }, (_, index) => validRow.replace("Synthetic Lead", `Lead ${index}`)).join("\n")}`, { clients: [], leads: [] });
  assert.match(tooMany.batchErrors.join(" "), /row limit/);
});

test("a partially invalid batch cannot be confirmed while a valid batch carries only safe import data", () => {
  const invalidBatch = buildLeadImportPreview(csv(validRow, validRow.replace("Synthetic Lead", "=1+1")), { clients: [], leads: [] });
  assert.equal(invalidBatch.canImport, false);
  assert.equal(invalidBatch.counts.invalid, 1);
  const preview = buildLeadImportPreview(csv(validRow), { clients: [], leads: [] });
  assert.equal(preview.canImport, true);
  assert.equal("dob" in preview.rows[0].parsed!, false);
  assert.equal("assignedTo" in preview.rows[0].parsed!, false);
  assert.equal("payment" in preview.rows[0].parsed!, false);
  assert.equal("caseId" in preview.rows[0].parsed!, false);
});
