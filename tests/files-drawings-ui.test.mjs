import test from "node:test";
import assert from "node:assert/strict";
import { source } from "./helpers/source-contracts.mjs";

test("files workspace uses service requirements and the active case", () => {
  const ui = source("components/files-drawings-console.tsx");
  assert.match(ui, /getActiveCaseForClient/);
  assert.match(ui, /getCaseDocumentReadiness/);
  assert.match(ui, /readiness\?\.requirements/);
  for (const state of ["Missing", "Received", "Needs correction", "Verified"]) assert.match(ui, new RegExp(state));
  assert.match(ui, /Next:/);
});

test("document writes match concurrency, idempotency, and immutable evidence controls", () => {
  const ui = source("components/files-drawings-console.tsx");
  assert.match(ui, /action: "case-document-upsert"/);
  for (const field of ["recordId", "assetType", "floorLabel", "versionLabel", "documentDate", "isCurrent", "evidenceRef", "discrepancy", "blocker", "reviewObservation", "requiredChange", "preferredAlternative", "acceptableAlternative", "ownerRole", "ownerName", "revisionStatus"]) assert.match(ui, new RegExp(field));
  assert.match(ui, /idempotencyKey\.current/);
  assert.match(ui, /expectedRecordVersion: activeCase\.recordVersion/);
  assert.match(ui, /expectedRevision: state\.persistenceRevision/);
  assert.match(ui, /error\.status === 409/);
  assert.match(ui, /error\.status === 428/);
  assert.match(ui, /Nothing was saved/);
  assert.match(ui, /disabled=\{Boolean\(currentDocument && versionLabel === currentDocument\.versionLabel\)\}/);
});

test("verification is deliberate, safe, and staff-only", () => {
  const ui = source("components/files-drawings-console.tsx");
  const page = source("app/files/page.tsx");
  assert.match(page, /requirePageAccess\("CONSULTANT"\)/);
  assert.ok((ui.match(/window\.confirm/g) ?? []).length >= 1);
  assert.match(ui, /revisionStatus === "VERIFIED" && \(blocker \|\| Boolean\(discrepancy\.trim\(\)\)\)/);
  assert.match(ui, /Resolve the blocker and discrepancy before verifying/);
  assert.match(ui, /File paths stay hidden here/);
  assert.match(ui, /<details><summary>Show/);
  assert.match(ui, /aria-live="polite"/);
  assert.doesNotMatch(ui, /payment|client-portal/i);
});
