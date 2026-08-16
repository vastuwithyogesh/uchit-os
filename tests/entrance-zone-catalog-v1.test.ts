import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyAppState } from "../lib/store.ts";
import { getApprovedEntranceZoneCatalog } from "../lib/entrance-zone-catalog.ts";
import {
  activateLocalEntranceZoneCatalogV1,
  ENTRANCE_ZONE_CATALOG_V1_CODES,
  ENTRANCE_ZONE_CATALOG_V1_HASH,
  ENTRANCE_ZONE_CATALOG_V1_ID,
  ENTRANCE_ZONE_CATALOG_V1_RECORDS,
  validateEntranceZoneCatalogV1
} from "../lib/entrance-zone-catalog-v1.ts";

test("owner-approved Entrance Zone Catalog v1.0 preserves all 32 exact records in canonical order", () => {
  assert.equal(ENTRANCE_ZONE_CATALOG_V1_RECORDS.length, 32);
  assert.deepEqual(ENTRANCE_ZONE_CATALOG_V1_CODES, [
    "N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8",
    "E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8",
    "S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8",
    "W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8"
  ]);
  assert.equal(ENTRANCE_ZONE_CATALOG_V1_RECORDS[0].ownerSourceText, "Residents in house is affected by bed intention of other people.");
  assert.equal(ENTRANCE_ZONE_CATALOG_V1_RECORDS[5].ownerSourceText, "Acceptable behavious in society and peopleusually avoid listening them.");
  assert.equal(ENTRANCE_ZONE_CATALOG_V1_RECORDS[15].ownerSourceText, "Results accidente ,burglary, financial losses.");
  assert.equal(ENTRANCE_ZONE_CATALOG_V1_RECORDS[31].ownerSourceText, "Unfair and unlawful means for their own benefits.");
  assert.equal(ENTRANCE_ZONE_CATALOG_V1_HASH, "sha256:4bcd38cb178a78369140b745ece77553140cd1c4eca78d7d9db698fcb05853b6");
  assert.equal(validateEntranceZoneCatalogV1(), true);
});

test("catalog validation rejects missing, duplicate, unknown and invalid-rating records", () => {
  assert.throws(() => validateEntranceZoneCatalogV1(ENTRANCE_ZONE_CATALOG_V1_RECORDS.slice(0, 31)), /exactly 32/);
  const duplicate = ENTRANCE_ZONE_CATALOG_V1_RECORDS.map((item) => ({ ...item })); duplicate[1].code = "N1";
  assert.throws(() => validateEntranceZoneCatalogV1(duplicate), /duplicate/);
  const unknown = ENTRANCE_ZONE_CATALOG_V1_RECORDS.map((item) => ({ ...item })); unknown[31].code = "X1";
  assert.throws(() => validateEntranceZoneCatalogV1(unknown), /missing, unknown, or out-of-order/);
  const invalid = ENTRANCE_ZONE_CATALOG_V1_RECORDS.map((item) => ({ ...item })) as Array<{ code: string; ownerSourceText: string; classification: "GOOD" | "BAD" | "OK-OK" }>;
  (invalid[0] as { classification: string }).classification = "AVERAGE";
  assert.throws(() => validateEntranceZoneCatalogV1(invalid), /invalid rating/);
});

test("local activation is immutable, audited and leaves client-facing presentation copy unresolved", () => {
  const state = createEmptyAppState();
  const version = activateLocalEntranceZoneCatalogV1({ state, organisationId: "org", actorUserId: "founder", activatedAt: "2026-08-14T10:00:00.000+05:30" });
  assert.equal(version.id, ENTRANCE_ZONE_CATALOG_V1_ID);
  assert.equal(version.catalogScope, "ENTRANCE");
  assert.equal(version.catalogRecordCount, 32);
  assert.equal(version.contentHash, ENTRANCE_ZONE_CATALOG_V1_HASH);
  assert.equal(version.ownerSourceAuthority, "Yogesh");
  assert.equal(state.methodologyRules.length, 32);
  assert.ok(state.methodologyRules.every((item) => item.presentationTextStatus === "REVIEW_REQUIRED_COPY" && item.presentationText === undefined));
  assert.equal(state.founderCommercialAuditEvents[0].eventType, "ENTRANCE_ZONE_CATALOG_ACTIVATED");
  assert.equal(activateLocalEntranceZoneCatalogV1({ state, organisationId: "org", actorUserId: "founder" }), version);
  assert.equal(state.methodologyVersions.length, 1);
  assert.equal(state.founderCommercialAuditEvents.length, 1);
  const catalog = getApprovedEntranceZoneCatalog(state, "org");
  assert.equal(catalog.ready, true);
  assert.deepEqual(catalog.zones.map((item) => `${item.code}:${item.classification}`), ENTRANCE_ZONE_CATALOG_V1_RECORDS.map((item) => `${item.code}:${item.classification}`));
});
