import test from "node:test";
import assert from "node:assert/strict";
import { migrateLegacyPaymentProofs } from "./payment-proof-migration.ts";

const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);
const ownership = {
  legacy_1: { clientId: "client_1", caseId: "case_1", uploadedById: "migration_operator", uploadedByEmail: "operator@example.com" }
};

test("dry-run is the default and is deterministic without storage bindings", async () => {
  const input = [{ legacyId: "legacy_1", key: "advance-proof", fileName: "proof.png", bytes: png, mimeType: "image/png" }];
  const first = await migrateLegacyPaymentProofs(undefined, undefined, input, ownership);
  const second = await migrateLegacyPaymentProofs(undefined, undefined, input, ownership);
  assert.equal(first.mode, "DRY_RUN");
  assert.equal(first.records[0].outcome, "PLANNED");
  assert.equal(first.records[0].targetId, second.records[0].targetId);
  assert.equal(first.records[0].objectKey, second.records[0].objectKey);
  assert.equal(first.legacyDataDeleted, false);
  assert.equal(JSON.stringify(first).includes("iVBOR"), false);
});

test("missing ownership mapping fails only that record and never exposes bytes", async () => {
  const manifest = await migrateLegacyPaymentProofs(undefined, undefined,
    [{ legacyId: "legacy_2", dataUrl: "data:image/png;base64,iVBORw0KGgoB" }], {});
  assert.equal(manifest.totals.failed, 1);
  assert.match(manifest.records[0].reason ?? "", /ownership mapping/i);
  assert.equal(JSON.stringify(manifest).includes("iVBOR"), false);
});

test("execute mode cannot start without explicit D1 and R2 bindings", async () => {
  await assert.rejects(() => migrateLegacyPaymentProofs(undefined, undefined, [], {}, { execute: true }), /requires explicit D1 and R2/);
});

test("duplicate legacy ids are rejected in the same batch", async () => {
  const manifest = await migrateLegacyPaymentProofs(undefined, undefined, [
    { legacyId: "legacy_1", bytes: png, mimeType: "image/png" },
    { legacyId: "legacy_1", bytes: png, mimeType: "image/png" }
  ], ownership);
  assert.equal(manifest.totals.planned, 1);
  assert.equal(manifest.totals.failed, 1);
  assert.match(manifest.records[1].reason ?? "", /duplicate/i);
});
