import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file) => readFileSync(resolve(process.cwd(), file), "utf8");

test("synthetic visual-QA harness is owner-scoped, no-write and context complete", () => {
  const script = read("scripts/prepare-founder-visual-qa.mjs");
  for (const token of ["buildReleaseableFounderPilotFixture", "syntheticOnly: true", "noWrites: true", "noExternalCommunication: true", "1440", "390", "/founder/08", "/founder/10", "/founder/11", "BLOCKED_METHOD_INPUT", "DEFERRED"]) {
    assert.match(script, new RegExp(token.replace(/[.*+?^${}()|[\\]\\]/g, "\\\\$&")), token);
  }
  assert.doesNotMatch(script, /fetch\(|POST|writeFileSync|real|client-data/i);
});

test("evaluation surface keeps technical context behind disclosure and one dominant save action", () => {
  const ui = read("components/evaluation-console.tsx");
  assert.match(ui, /<summary>Evaluation status details<\/summary>/);
  assert.match(ui, /<summary>Rule summary<\/summary>/);
  assert.match(ui, /className="button founder-action-primary"/);
  assert.match(ui, /className="button-secondary"/);
  assert.match(ui, /<summary>Release and payment context<\/summary>/);
});

test("manual-sheet visual QA keeps the selected evidence task primary", () => {
  const ui = read("components/files-drawings-console.tsx");
  assert.match(ui, /focus === "manual-sheet"/);
  assert.match(ui, /<summary>View other required files<\/summary>/);
  assert.match(ui, /<summary>Version history and recovery<\/summary>/);
  assert.match(ui, /files-focus-\$\{focus\}/);
});

test("balance visual QA keeps payment confirmation primary and details progressive", () => {
  const ui = read("components/payment-proof-console.tsx");
  const manifest = read("scripts/prepare-founder-visual-qa.mjs");
  assert.match(ui, /focus === "balance"/);
  assert.match(ui, /<summary>Payment status details<\/summary>/);
  assert.match(ui, /<summary>Receipt history and gate context<\/summary>/);
  assert.match(ui, /balance-proof-verify/);
  assert.match(ui, /Confirm full balance/);
  assert.match(manifest, /"\/founder\/12"/);
});

test("report visual QA keeps protected artifact actions progressive", () => {
  const ui = read("components/founder-report-step.tsx");
  const legacyUi = read("components/report-console.tsx");
  const route = read("app/reports/page.tsx");
  const manifest = read("scripts/prepare-founder-visual-qa.mjs");
  assert.match(ui, /<summary>Released artifact actions<\/summary>/);
  assert.match(legacyUi, /<summary>Report status details<\/summary>/);
  assert.match(legacyUi, /<summary>Preview and approval status<\/summary>/);
  assert.match(legacyUi, /<summary>Report archive and history<\/summary>/);
  assert.doesNotMatch(route, /href="\/ops"/);
  assert.doesNotMatch(read("components/evaluation-console.tsx"), /href="\/ops">Complete case setup/);
  assert.match(ui, /mode=export/);
  assert.match(ui, /mode=print/);
  assert.match(ui, /report-approve/);
  assert.match(manifest, /"\/founder\/15"/);
  assert.match(manifest, /"\/founder\/16"/);
});
