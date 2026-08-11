import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file) => readFileSync(resolve(process.cwd(), file), "utf8");

test("Founder step card exposes a shared semantic status and focused work area", () => {
  const card = read("components/founder-step-card.tsx");
  assert.match(card, /founder-step-card/);
  assert.match(card, /data-tone=\{tone\}/);
  assert.match(card, /status-pill/);
  assert.match(card, /aria-labelledby/);
});

test("CRM pipeline is a focused transition surface with preserved server contract", () => {
  const text = read("components/crm-pipeline-board.tsx");
  assert.match(text, /FounderStepCard/);
  assert.match(text, /client-pipeline-transition/);
  assert.match(text, /expectedRecordVersion/);
  assert.match(text, /expectedRevision/);
  assert.match(text, /idempotencyKey/);
  assert.match(text, /Your draft is still here/);
  assert.match(text, /founder-technical-details/);
  assert.match(text, /Save next step/);
});

test("intake is progressive and keeps consent, conflict recovery and exact action fields", () => {
  const text = read("components/client-intake-form.tsx");
  assert.match(text, /FounderStepCard/);
  assert.match(text, /client-intake-upsert/);
  assert.match(text, /consent:/);
  assert.match(text, /expectedRecordVersion/);
  assert.match(text, /expectedRevision/);
  assert.match(text, /Your draft is still here/);
  assert.match(text, /<details className="founder-technical-details founder-intake-more">/);
  assert.match(text, /Save intake/);
});

test("payment and report surfaces keep gates while making the current task dominant", () => {
  const payment = read("components/payment-proof-console.tsx");
  const report = read("components/report-console.tsx");
  assert.match(payment, /FounderStepCard/);
  assert.match(payment, /handleUpload\(key\)/);
  assert.match(payment, /Verified receipt locked/);
  assert.match(report, /FounderStepCard/);
  assert.match(report, /preview-report/);
  assert.match(report, /final-report-prepare/);
  assert.match(report, /report-approve/);
  assert.match(report, /runPdf\("generate"/);
  assert.match(report, /runPdf\("verify"/);
  assert.match(report, /runPdf\("release"/);
  assert.match(report, /Export PDF/);
  assert.match(report, /Print PDF/);
});

test("site review is sequential and retains Stage A and Founder checkpoints", () => {
  const text = read("components/site-analysis-console.tsx");
  assert.match(text, /FounderStepCard/);
  assert.match(text, /stageAVerdictReportId/);
  assert.match(text, /site-analysis-upsert/);
  assert.match(text, /post-site-findings-upsert/);
  assert.match(text, /FOUNDER_REVIEWED/);
  assert.match(text, /FOUNDER_APPROVED/);
  assert.match(text, /never reruns evaluation|does not redesign the layout or rerun the evaluation engine/);
  assert.match(text, /founder-context-bar/);
});

test("deep Founder surfaces use mobile-safe controls and calm semantic tokens", () => {
  const css = read("app/globals.css");
  for (const selector of [".founder-step-card", ".founder-context-bar", ".founder-step-grid", ".founder-technical-details", ".founder-action-primary"]) {
    assert.match(css, new RegExp(selector.replaceAll(".", "\\.")), selector);
  }
  assert.match(css, /\.founder-work-surface[\s\S]*min-height:\s*44px/);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*\.founder-step-grid/);
  assert.match(css, /status-needs-regeneration/);
  assert.doesNotMatch(css, /linear-gradient|radial-gradient/);
});
