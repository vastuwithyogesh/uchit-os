import test from "node:test";
import assert from "node:assert/strict";
import { calculateUtilityGraphVerdict } from "../lib/utility-verdict.ts";
import { source } from "./helpers/source-contracts.mjs";

const run = (values, lines = { extension: 10, balance: 5, exhaustion: 0 }) => calculateUtilityGraphVerdict({
  element: "Earth", directionSet: values.map((_, index) => `D${index + 1}`),
  bars: values.map((value, index) => ({ directionCode: `D${index + 1}`, value })), lines
});

test("each approved graph condition produces its deterministic framing", () => {
  assert.equal(run([11, 12, 5]).verdict, "SUPPRESS");
  assert.equal(run([11, 5, 4]).verdict, "GROUND");
  assert.equal(run([-1, -2, 5]).verdict, "UPLIFT");
  assert.equal(run([0, 5, 4]).verdict, "PROMOTE");
  assert.equal(run([10, 10, 10, 10]).verdict, "BALANCE");
  assert.equal(run([11, 12, 5]).solutionFraming, "Disha Balancer");
  assert.equal(run([11, 5, 4]).solutionFraming, "Tattva Balancer");
  assert.equal(run([-1, -2, 5]).solutionFraming, "Disha Activation");
  assert.equal(run([0, 5, 4]).solutionFraming, "Tattva Activation");
  assert.equal(run([10, 10, 10, 10]).solutionFraming, "Equaliser");
});

test("graph boundaries, scope and contradictions fail closed or remain explainable", () => {
  assert.equal(run([10, 10, 5]).matchedConditions.includes("SUPPRESS"), false);
  assert.equal(run([0, 1, 5]).matchedConditions.includes("UPLIFT"), false);
  assert.equal(run([1, 2, 3], { extension: 4, balance: 5, exhaustion: 0 }).status, "BLOCKED_METHOD_INPUT");
  assert.throws(() => calculateUtilityGraphVerdict({ element: "Earth", directionSet: ["D1", "D2"], bars: [{ directionCode: "D1", value: 1 }], lines: { extension: 2, balance: 1, exhaustion: 0 } }), /exactly one bar|Each direction/);
  assert.throws(() => calculateUtilityGraphVerdict({ element: "Earth", directionSet: ["D1", "D1"], bars: [{ directionCode: "D1", value: 1 }, { directionCode: "D1", value: 2 }], lines: { extension: 2, balance: 1, exhaustion: 0 } }), /duplicates/);
});

test("same frozen graph inputs reproduce byte-identical verdict output and never add remedies", () => {
  const first = run([11, 12, 5]);
  const second = run([11, 12, 5]);
  assert.deepEqual(second, first);
  assert.match(first.explanation, /Triggered directions/);
  assert.doesNotMatch(JSON.stringify(first), /priority|sequence|recommendation|remedy/i);
  const body = source("lib/utility-verdict.ts");
  assert.match(body, /matchedConditions/);
  assert.match(body, /frozenInput/);
  assert.match(body, /inputHash/);
});
