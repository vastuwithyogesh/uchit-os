import test from "node:test";
import assert from "node:assert/strict";
import { source } from "./helpers/source-contracts.mjs";

const ui = source("components/evaluation-console.tsx");
const scorecard = source("lib/founder-scorecard.ts");
const actions = source("app/api/actions/route.ts");

test("Step 08 presents two explicit immutable evaluation tasks", () => {
  for (const copy of ["Task 1 of 2", "Utility evaluation", "Task 2 of 2", "Shakti evaluation", "READY TO RUN", "RECORDED", "Run and save Utility evaluation", "Run and save Shakti evaluation"]) assert.match(ui, new RegExp(copy));
  assert.match(ui, /utilitySnapshot\.provenance/);
  assert.match(ui, /shaktiSnapshot\.inputValues\.join/);
  assert.match(ui, /Its input values are read-only/);
  assert.doesNotMatch(ui, /Release and payment context|Case amount|Balance gate|formatMoney/);
});

test("Step 08 successor is explicit, reasoned and lineage-gated", () => {
  assert.match(ui, /Create new Shakti snapshot/);
  assert.match(ui, /Reason for successor and invalidation/);
  assert.match(ui, /action: "evaluation-replacement-request"/);
  assert.match(ui, /Bind replacement snapshot/);
  assert.match(ui, /Verify replacement lineage/);
  assert.match(ui, /ignoreRegenerationTargetTypes/);
  assert.match(ui, /regenerationVersion/);
  assert.match(actions, /case "evaluation-replacement-request"/);
  assert.match(actions, /requestEvaluationReplacement/);
});

test("scorecard uses the same mixed-state recovery copy as the workspace", () => {
  assert.match(scorecard, /!facts\.evaluation && !facts\.shakti \? "Save the Utility and Shakti evaluations to continue\."/);
  assert.match(scorecard, /!facts\.evaluation \? "Save the Utility evaluation to continue\."/);
  assert.match(scorecard, /"Save the Shakti evaluation to continue\."/);
  assert.match(scorecard, /Boolean\(facts\.evaluation && facts\.shakti\)/);
});

test("busy, conflict and methodology reload states remain explicit", () => {
  assert.match(ui, /Running Utility evaluation\.\.\./);
  assert.match(ui, /Running Shakti evaluation\.\.\./);
  assert.match(ui, /The evaluation context changed\. Reload/);
  assert.match(ui, /Reload approved methodology/);
  assert.match(ui, /without changing active inputs/);
});
