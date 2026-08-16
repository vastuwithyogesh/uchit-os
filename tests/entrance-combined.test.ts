import assert from "node:assert/strict";
import { combineEntranceClassifications } from "../lib/entrance-combined.ts";

const expected = [
  ["GOOD", "GOOD", "STRONG_POSITIVE"],
  ["GOOD", "OK-OK", "POSITIVE_WITH_MINOR_FLOOR_CAUTION"],
  ["GOOD", "BAD", "POSITIVE_PROPERTY_ENTRY_FLOOR_LEVEL_DEFECT"],
  ["OK-OK", "GOOD", "MODERATE_WITH_SUPPORTIVE_FLOOR_MODIFIER"],
  ["OK-OK", "OK-OK", "MIXED_NEUTRAL"],
  ["OK-OK", "BAD", "PROPERTY_CAUTION_WITH_FLOOR_DEFECT"],
  ["BAD", "GOOD", "PRIMARY_PROPERTY_DEFECT_WITH_FLOOR_SUPPORT"],
  ["BAD", "OK-OK", "PRIMARY_DEFECT_WITH_LIMITED_FLOOR_MODERATION"],
  ["BAD", "BAD", "HIGH_PRIORITY_ENTRANCE_DEFECT"]
] as const;

for (const [main, floor, status] of expected) {
  assert.deepEqual(combineEntranceClassifications(main, floor), { main, floor, status });
}
assert.equal(expected.length, 9);
