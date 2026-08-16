import assert from "node:assert/strict";
import test from "node:test";
import { buildDirectionalStatementCatalog, DIRECTIONAL_METHODOLOGY_V1_1_CONTENT_HASH, DIRECTIONAL_METHODOLOGY_V1_1_VERSION_ID, getDirectionalStatementEntry, resolveDirectionalStatements } from "../lib/directional-statement-repo-v1.ts";

const provenance = { methodologyVersionId: "m/v1", methodologyContentHash: "sha256:m" };
test("catalog promotes the exact 53 final directional rows with locked provenance", () => {
  const catalog = buildDirectionalStatementCatalog(provenance);
  assert.equal(catalog.filter((entry) => entry.conditionKey.startsWith("BUILDING_ORIENTATION:")).length, 8);
  assert.equal(catalog.filter((entry) => entry.conditionKey.startsWith("SITE_ORIENTATION:")).length, 36);
  assert.equal(catalog.filter((entry) => entry.conditionKey.startsWith("ENTRANCE_COMBINED:")).length, 9);
  assert.equal(catalog.filter((entry) => entry.approvalStatus === "APPROVED_CLIENT_TEXT").length, 58);
  assert.ok(catalog.filter((entry) => entry.approvalStatus === "APPROVED_CLIENT_TEXT").every((entry) => entry.approvedText.length > 0 && entry.contentHash.startsWith("sha256:")));
  assert.equal(getDirectionalStatementEntry("BUILDING_ORIENTATION:N", provenance)?.statementId, "DIR-BO-N");
  assert.equal(getDirectionalStatementEntry("SITE_ORIENTATION:OPEN_SIDE:N+E+S+W", provenance)?.statementId, "DIR-OPEN-11");
  assert.equal(getDirectionalStatementEntry("ENTRANCE_COMBINED:OK-OK:BAD", provenance)?.statementId, "DIR-ENT-OKOK-BAD");
  assert.equal(getDirectionalStatementEntry("BUILDING_ORIENTATION:N", provenance)?.methodologyVersionId, DIRECTIONAL_METHODOLOGY_V1_1_VERSION_ID);
  assert.equal(getDirectionalStatementEntry("BUILDING_ORIENTATION:N", provenance)?.methodologyContentHash, DIRECTIONAL_METHODOLOGY_V1_1_CONTENT_HASH);
  assert.ok(!catalog.some((entry) => entry.sourceSheet.includes("Founder Review")));
});
test("circulation catalog contains five locked conditions and no AI source", () => {
  const catalog = buildDirectionalStatementCatalog(provenance);
  const circulation = catalog.filter((entry) => entry.conditionKey.startsWith("CIRCULATION:"));
  assert.equal(circulation.length, 5);
  assert.ok(circulation.every((entry) => entry.approvalStatus === "APPROVED_CLIENT_TEXT" && entry.sourceSheet === "Circulation Rules"));
  assert.ok(circulation.every((entry) => !entry.sourceSheet.toLowerCase().includes("ai")));
});
test("zoning approved Utility content is selected without requiring redundant prose", () => {
  const evaluation = { status: "COMPLETE", zoning: [{ mappingRowId: "row-1", resolutionStatus: "APPROVED", attribute: "Approved Utility attribute", provenance: { sourceRowNumber: 12 }, serialNo: 1, utilityId: "u", utilityName: "Kitchen", floorPlanLabel: "Kitchen", d16Zone: "E" }], circulation: undefined } as any;
  const selected = resolveDirectionalStatements(evaluation, provenance);
  assert.equal(selected["ZONING:row-1"]?.approvedText, "Approved Utility attribute");
});
