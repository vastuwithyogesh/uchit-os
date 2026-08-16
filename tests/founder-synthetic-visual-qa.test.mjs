import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file) => readFileSync(resolve(process.cwd(), file), "utf8");

test("synthetic visual-QA harness is owner-scoped, no-write and context complete", () => {
  const script = read("scripts/prepare-founder-visual-qa.mjs");
  for (const token of ["buildReleaseableFounderPilotFixture", "syntheticOnly: true", "noWrites: true", "noExternalCommunication: true", "reviewMatrix", "ownerReview", "1440", "390", "/founder/08", "/founder/10", "/founder/11", "/founder/12", "/founder/15", "/founder/16", "BLOCKED_METHOD_INPUT", "DEFERRED"]) {
    assert.match(script, new RegExp(token.replace(/[.*+?^${}()|[\\]\\]/g, "\\\\$&")), token);
  }
  assert.doesNotMatch(script, /fetch\(|writeFileSync|client-data/i);
  assert.doesNotMatch(script, /method:\s*["']POST/i);
  assert.match(script, /hostedBrowserCapture: "PENDING_CLEAN_SYNTHETIC_RUNTIME"/);
});

test("synthetic review matrix covers all owner review surfaces and responsive recovery checks", () => {
  const script = read("scripts/prepare-founder-visual-qa.mjs");
  for (const token of ["Founder home", "Leads", "Lead Pipeline", "Clients & Cases", "Utility/Shakti evaluation", "Site analysis", "Post-Site findings", "Full balance clearance", "Founder approval", "Protected PDF", "Legacy report console", "Technical recovery", "keyboard-focus", "disabled-busy", "error-retry", "no-horizontal-overflow"]) {
    assert.match(script, new RegExp(token.replace(/[.*+?^${}()|[\\]\\]/g, "\\\\$&")), token);
  }
  assert.match(script, /requiredScreenshots: \["desktop-1440x900", "mobile-390x844"\]/);
  assert.match(script, /publication: "NO_GO_UNTIL_OWNER_VISUAL_REVIEW"/);
});

test("owner review package records safe hosted DOM evidence without claiming screenshots", () => {
  const review = read("docs/founder-visual-qa-review-2026-08-13.md");
  assert.match(review, /Desktop: requested 1440×900/);
  assert.match(review, /Mobile: requested 390×844/);
  assert.match(review, /no horizontal overflow/);
  assert.match(review, /screenshots remain pending/);
  assert.match(review, /NO-GO/);
});

test("evaluation surface keeps technical context behind disclosure and one dominant save action", () => {
  const ui = read("components/evaluation-console.tsx");
  assert.match(ui, /Utility and Shakti evaluation/);
  assert.match(ui, /Run and save Utility evaluation/);
  assert.match(ui, /Create new Shakti snapshot/);
  assert.match(ui, /className="button founder-action-primary"/);
  assert.match(ui, /className="button-secondary"/);
  assert.doesNotMatch(ui, /Release and payment context|Case amount|Balance gate|formatMoney/);
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
  assert.match(ui, /Upload the exact balance receipt before confirming the balance/);
  assert.match(ui, /The exact Stage A verdict must be presented before balance confirmation/);
  assert.match(ui, /Choose a file for \$\{uploadLabels\[key\]\.toLowerCase\(\)\} to enable upload/);
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
  assert.match(ui, /Complete Utility and Shakti evaluation first/);
  assert.match(manifest, /"\/founder\/15"/);
  assert.match(manifest, /"\/founder\/16"/);
});
