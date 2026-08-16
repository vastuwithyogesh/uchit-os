import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const drawer = fs.readFileSync(path.join(root, "components", "unified-leads-workspace.tsx"), "utf8");
const editor = fs.readFileSync(path.join(root, "components", "founder-commercial-proposal-editor.tsx"), "utf8");
const openCase = fs.readFileSync(path.join(root, "components", "founder-open-case-sheet.tsx"), "utf8");

test("prospective projects expose the protected complimentary proposal workflow", () => {
  assert.match(drawer, /founder-proposal-draft-create/);
  assert.match(drawer, /INTERNAL_COMPLIMENTARY/);
  assert.match(drawer, /professionalFeePaise: 0/);
  assert.match(drawer, /appliedGstBasisPoints: 0/);
  assert.match(drawer, /agreedAdvancePaise: 0/);
  assert.match(drawer, /expectedRecordVersion: latestProject\?\.recordVersion/);
  assert.match(drawer, /expectedRevision: latestBootstrap\.persistenceRevision/);
  assert.match(drawer, /Private Founder reason/);
  assert.match(drawer, /commercial-proposals\/\$\{encodeURIComponent\(proposalId\)\}\/1/);
});

test("proposal editor exposes handoff only after accepted complimentary state", () => {
  assert.match(editor, /proposal\.status === "ACCEPTED" && proposal\.content\.commercial\.engagementClassification === "INTERNAL_COMPLIMENTARY"/);
  assert.match(editor, /founder-complimentary-case-handoff/);
  assert.match(editor, /No payment or invoice is created/);
});

test("new-case UI refreshes authoritative CAS versions before its protected create action", () => {
  assert.match(openCase, /fetch\("\/api\/bootstrap", \{ cache: "no-store" \}\)/);
  assert.match(openCase, /latestClient\?\.recordVersion \?\? client\.recordVersion/);
  assert.match(openCase, /latestBootstrap\.persistenceRevision \?\? revision/);
});
