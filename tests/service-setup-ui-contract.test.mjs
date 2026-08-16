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
  assert.match(evaluation, /evaluationBlockers\.map/);
  assert.match(evaluation, /!snapshotName\.trim\(\)/);
  assert.match(evaluation, /Boolean\(busyAction\) \|\| !evaluationReady/);
  assert.match(evaluation, /Evaluation is blocked/);
  assert.match(evaluation, /Methodology and technical details/);
  assert.match(evaluation, /The evaluation action could not be completed/);
});
