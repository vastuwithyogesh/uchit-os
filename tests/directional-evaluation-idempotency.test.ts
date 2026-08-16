import test from "node:test";
import assert from "node:assert/strict";
import { buildDirectionalEvaluationIdempotencyKey } from "../lib/directional-evaluation-idempotency.ts";

const source = { caseId: "case-a", projectId: "project-a", floorId: "floor-a", inputId: "input-a", inputVersion: 2, d8Id: "d8-a", d16Id: "d16-a" };

test("directional evaluation key is stable, bounded and non-PII across retries", () => {
  const keys = Array.from({ length: 10 }, () => buildDirectionalEvaluationIdempotencyKey({ ...source }));
  assert.equal(new Set(keys).size, 1);
  assert.ok(keys[0].length <= 160);
  assert.doesNotMatch(keys[0], /case-a|project-a|floor-a|input-a|d8-a|d16-a/);
});

test("directional evaluation key changes when a source identity or version changes", () => {
  assert.notEqual(buildDirectionalEvaluationIdempotencyKey(source), buildDirectionalEvaluationIdempotencyKey({ ...source, inputVersion: 3 }));
  assert.notEqual(buildDirectionalEvaluationIdempotencyKey(source), buildDirectionalEvaluationIdempotencyKey({ ...source, d16Id: "d16-b" }));
});
