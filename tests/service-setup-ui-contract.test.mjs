import test from "node:test";
import assert from "node:assert/strict";
import { source } from "./helpers/source-contracts.mjs";

test("case setup exposes an accessible service configuration form and explicit save", () => {
  const setup = source("components/case-master-console.tsx");
  assert.match(setup, /action: "case-service-configure"/);
  for (const field of ["serviceType", "canonicalStage", "serviceTemplateVersion", "scopeVersion", "inputReadiness", "currentDrawing"]) assert.match(setup, new RegExp(field));
  assert.match(setup, /id="service-type"/);
  assert.match(setup, /id="service-stage"/);
  assert.match(setup, /Save service setup/);
  assert.match(setup, /Unsaved changes/);
  assert.match(setup, /window\.confirm/);
  assert.match(setup, /Changing the service clears the current readiness checklist/);
});

test("new-construction setup records drawing verification and discrepancy state", () => {
  const setup = source("components/case-master-console.tsx");
  assert.match(setup, /id="drawing-version"/);
  assert.match(setup, /id="drawing-verified-at"/);
  assert.match(setup, /id="drawing-discrepancy"/);
  assert.match(setup, /drawingSuperseded/);
});

test("both evaluation actions remain disabled until service inputs are ready", () => {
  const evaluation = source("components/evaluation-console.tsx");
  assert.match(evaluation, /getCaseEvaluationBlockers/);
  assert.match(evaluation, /evaluationBlockers\.slice\(0, 3\)\.map/);
  assert.match(evaluation, /!snapshotName\.trim\(\)/);
  assert.equal((evaluation.match(/disabled=\{busy \|\| !evaluationReady/g) ?? []).length, 2);
  assert.match(evaluation, /Complete the case setup first/);
  assert.match(evaluation, /href="\/ops">Complete case setup/);
  assert.match(evaluation, /evaluationReady \? <div className="card span-4 founder-support-surface"/);
  assert.match(evaluation, /View rule master and technical details/);
  assert.match(evaluation, /Review the readiness steps and try again/);
});
