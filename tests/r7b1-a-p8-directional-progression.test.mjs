import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const scorecard = () => read("lib/founder-scorecard.ts");

test("V1 evaluation progression is directional-complete, not elemental-complete", () => {
  const source = scorecard();
  assert.match(source, /const evaluationReady = isV1 \? Boolean\(v1\?\.directionalEvaluationComplete\)/);
  assert.match(source, /const directionalInputReady = v1\.spatial === "COMPLETE"/);
  assert.match(source, /status: status\(\{ complete: v1\.directionalEvaluationComplete,[\s\S]*ready: directionalInputReady && !v1\.directionalEvaluationComplete, blocked: !directionalInputReady \}\)/);
});

test("V1 Stage-A starts after Directional Evaluation and remains incomplete until presented", () => {
  const source = scorecard();
  assert.match(source, /id: "stage-a"/);
  assert.match(source, /status: status\(\{ complete: stageAReady, started: v1\.directionalEvaluationComplete, blocked: !evaluationReady \}\)/);
  assert.ok(source.indexOf('id: "stage-a"') < source.indexOf('id: "site"'));
});

test("later V1 site and elemental milestones remain independently gated", () => {
  const source = scorecard();
  assert.match(source, /id: "site"/);
  assert.match(source, /id: "post-site"/);
  assert.match(source, /elementalComplete/);
  assert.match(source, /id: "remedial"/);
});

test("legacy evaluation progression branch remains present", () => {
  assert.match(scorecard(), /isV1 \? Boolean\(v1\?\.directionalEvaluationComplete\) : Boolean\(facts\.evaluation && facts\.shakti\)/);
});

test("Step 09 remains the existing native Directional Report Card workspace", () => {
  const workspace = read("components/founder-step-workspace.tsx");
  assert.match(workspace, /if \(stepNumber === 9\).*DirectionalReportCardV1/s);
});
