import test from "node:test";
import assert from "node:assert/strict";
import { source } from "./helpers/source-contracts.mjs";

test("files workspace uses service requirements and the exact routed case", () => {
  const ui = source("components/files-drawings-console.tsx");
  assert.doesNotMatch(ui, /getActiveCaseForClient|clients\[0\]|files-client/);
  assert.match(ui, /Locked file context/);
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
  assert.match(ui, /Storage details stay hidden/);
  assert.match(ui, /<details><summary>(?:File details|Alternatives and technical details|Show)/);
  assert.match(ui, /aria-live="polite"/);
  assert.doesNotMatch(ui, /payment|client-portal/i);
});

test("protected uploads are scoped, validated, and keep technical storage data hidden", () => {
  const ui = source("components/files-drawings-console.tsx");
  assert.match(ui, /fetch\("\/api\/case-files", \{ method: "POST"/);
  assert.match(ui, /body\.set\("file", selectedFile\)/);
  assert.match(ui, /body\.set\("caseId", activeCase\.id\)/);
  assert.match(ui, /if \(requirement\.floorLabel\) body\.set\("floorLabel", requirement\.floorLabel\)/);
  assert.match(ui, /application\/pdf.*image\/png.*image\/jpeg.*image\/webp/);
  assert.match(ui, /20 \* 1024 \* 1024/);
  assert.match(ui, /asset\.caseId !== activeCase\.id \|\| asset\.floorLabel !== requirement\.floorLabel/);
  assert.match(ui, /setEvidenceRef\(asset\.evidenceRef\)/);
  assert.match(ui, /Only uploads for this case and exact floor are shown/);
  assert.match(ui, /<summary>File details<\/summary>/);
  assert.doesNotMatch(ui.slice(ui.indexOf("return <section")), /checksumSha256|uploadedBy\.id|storageKey|objectKey/);
});

test("protected upload exposes persistent state and recovery", () => {
  const ui = source("components/files-drawings-console.tsx");
  for (const state of ["NOT_SELECTED", "SELECTED", "UPLOADING", "UPLOADED_NOT_RECORDED", "RECORDED", "FAILED"]) assert.match(ui, new RegExp(state));
  assert.match(ui, /Retry upload/);
  assert.match(ui, /Upload is disabled until/);
  assert.match(ui, /router\.refresh\(\)/);
});

test("verified manual utility sheet exposes separate Founder approval", () => {
  const ui = source("components/files-drawings-console.tsx");
  assert.match(ui, /action: "manual-sheet-approve"/);
  assert.match(ui, /Founder approve sheet/);
  assert.match(ui, /approvalReason\.trim\(\)\.length < 20/);
  assert.match(ui, /documentId: currentDocument\.id/);
  assert.match(ui, /floorId: requestedFloorId/);
  assert.match(ui, /expectedRecordVersion: activeCase\.recordVersion/);
  assert.match(ui, /approvalKey\.current/);
});
