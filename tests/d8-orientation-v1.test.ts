import assert from "node:assert/strict";
import test from "node:test";
import { D8_ORIENTATION_RULES, evaluateD8Orientation, normalizeD8Degree } from "../lib/d8-orientation-v1.ts";

test("D8 catalog contains the eight locked directions", () => assert.deepEqual(D8_ORIENTATION_RULES.map((r) => r.direction), ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]));
test("D8 resolves representative non-boundary degrees", () => {
  for (const [degree, expected] of [[0, "N"], [45, "NE"], [180, "S"], [315, "NW"]] as const) { const result = evaluateD8Orientation(degree); assert.equal(result.kind, "RESOLVED"); if (result.kind === "RESOLVED") assert.equal(result.direction, expected); }
});
test("D8 normalizes wraparound degrees", () => { assert.equal(normalizeD8Degree(360), 0); assert.equal(normalizeD8Degree(-45), 315); const result = evaluateD8Orientation(720); assert.equal(result.kind, "RESOLVED"); if (result.kind === "RESOLVED") assert.equal(result.direction, "N"); });
test("D8 exact locked-sheet boundaries fail closed for review", () => {
  for (const degree of [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5]) {
    const result = evaluateD8Orientation(degree);
    assert.equal(result.kind, "REVIEW_REQUIRED");
    if (result.kind === "REVIEW_REQUIRED") assert.equal(result.reviewCode, "D8_BOUNDARY_POLICY_REQUIRED");
  }
});
test("D8 rejects non-finite input", () => { assert.throws(() => normalizeD8Degree(Number.NaN)); assert.throws(() => normalizeD8Degree(Number.POSITIVE_INFINITY)); });
