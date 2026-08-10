import test from "node:test";
import assert from "node:assert/strict";
import { source } from "./helpers/source-contracts.mjs";

test("client portal explains progress and uses plain payment states", () => {
  const portal = source("components/client-portal.tsx");
  assert.match(portal, /aria-label="Case progress"/);
  assert.match(portal, /Current step/);
  assert.match(portal, /Being checked/);
  assert.match(portal, /We will show the report here as soon as it is ready/);
  assert.doesNotMatch(portal, /item\.status\.toLowerCase/);
});

test("report actions explain irreversible decisions and hide technical evidence", () => {
  const reports = source("components/report-console.tsx");
  assert.match(reports, /window\.confirm/);
  assert.match(reports, /Release this final report to the client/);
  assert.match(reports, /<details>/);
  assert.match(reports, /File fingerprint/);
  assert.match(reports, /aria-live="polite"/);
});

test("payment receipts have associated inputs, PDF support, and private details disclosure", () => {
  const proofs = source("components/payment-proof-console.tsx");
  assert.match(proofs, /htmlFor={`proof-\$\{key\}`}/);
  assert.match(proofs, /application\/pdf/);
  assert.match(proofs, /Open uploaded PDF/);
  assert.match(proofs, /<details/);
  assert.match(proofs, /aria-live="polite"/);
});
