import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../app/evaluation/page.tsx", import.meta.url), "utf8");

test("legacy evaluation keeps the canonical Founder scorecard as its primary recovery", () => {
  assert.match(page, /Legacy Evaluation Tools/);
  assert.match(page, /href: "\/founder\/continue", label: "Continue Founder scorecard"/);
  assert.match(page, /<details className="route-secondary-links legacy-console-disclosure">[\s\S]*<EvaluationConsole \/>/);
  assert.match(page, /<details className="route-secondary-links legacy-console-disclosure">[\s\S]*<ChartAssetBoard \/>/);
  assert.match(page, /Open legacy evaluation console/);
  assert.match(page, /Open chart readiness tools/);
});
