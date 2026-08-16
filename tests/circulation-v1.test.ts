import assert from "node:assert/strict";
import test from "node:test";
import { CIRCULATION_RULES, CIRCULATION_STATES, evaluateCirculation } from "../lib/circulation-v1.ts";

test("locked circulation catalog exposes exactly five states", () => {
  assert.deepEqual(CIRCULATION_RULES.map((item) => item.state), [...CIRCULATION_STATES]);
  for (const state of CIRCULATION_STATES) assert.equal(evaluateCirculation(state).rule.status, "LOCKED");
});

test("circulation rejects unapproved values", () => assert.throws(() => evaluateCirculation("INFERRED" as never), /approved locked value/));
