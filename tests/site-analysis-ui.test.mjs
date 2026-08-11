import test from "node:test";
import assert from "node:assert/strict";
import { source } from "./helpers/source-contracts.mjs";

test("Site Analysis UI is sequential, floor-scoped, and does not expose methodology controls", () => {
  const ui = source("components/site-analysis-console.tsx"); const page = source("app/site/page.tsx");
  assert.match(page, /requirePageAccess\("CONSULTANT"\)/);
  assert.match(ui, /stageAVerdictReportId/); assert.match(ui, /site-analysis-upsert/); assert.match(ui, /site-analysis-checkpoint/);
  assert.match(ui, /post-site-findings-upsert/); assert.match(ui, /post-site-findings-checkpoint/);
  assert.match(ui, /exact presented preview/); assert.match(ui, /never reruns evaluation/);
  assert.doesNotMatch(ui, /remedy|threshold|direction boundary/i);
});
