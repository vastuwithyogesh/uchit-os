import test from "node:test";
import assert from "node:assert/strict";
import { source } from "./helpers/source-contracts.mjs";

test("grouped Founder pipeline moves use the governed correction contract when a group skips canonical stages", () => {
  const ui = source("components/unified-leads-workspace.tsx");
  assert.match(ui, /getAllowedPipelineTransitions\(pipeline\.stage\)/);
  assert.match(ui, /const correction = !allowedTargets\.includes\(target\)/);
  assert.match(ui, /correctionReason: correction \? correctionReason\.trim\(\) : undefined/);
  assert.match(ui, /expectedRecordVersion: selectedClient\.recordVersion/);
  assert.match(ui, /expectedRevision: state\.persistenceRevision/);
  assert.match(ui, /window\.confirm\("Record this administrative pipeline correction/);
  assert.match(ui, /Correction reason \(20–500 characters\)/);
  assert.match(ui, /groupedCorrectionDueAt/);
  assert.match(ui, /24 \* 60 \* 60 \* 1000/);
  assert.doesNotMatch(ui, /pipelineStage:\s*"(REVIEW|CONVERTED)"/);
});

test("grouped review and converted destinations remain canonical stage groups", () => {
  const ui = source("components/unified-leads-workspace.tsx");
  assert.match(ui, /id: "REVIEW"[\s\S]*FORM_PENDING[\s\S]*QUALIFIED/);
  assert.match(ui, /id: "CONVERTED", label: "Converted", stages: \["WON"\]/);
});
