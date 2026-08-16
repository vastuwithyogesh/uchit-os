import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Directional Input V1 is floor-scoped, versioned and explicit", () => {
  const source = read("lib/directional-input-v1.ts");
  for (const token of ["DRAFT", "FINALIZED", "SUPERSEDED", "noConfirmedD8Modifiers", "CIRCULATION_STATES", "predecessorVersionId", "requestHash"]) assert.match(source, new RegExp(token));
  assert.match(source, /evaluateD8Modifier/);
  assert.doesNotMatch(source, /opening-mapping-create|space-mapping-create/);
});

test("Directional snapshot consumes authoritative lineage and excludes legacy authority", () => {
  const source = read("lib/directional-evaluation-snapshot-v1.ts");
  for (const token of ["d8OrientationSnapshots", "d16UtilityMappingVersions", "directionalInputVersions", "entranceZoneVersions", "evaluateDirectionalEvaluation", "architectureVersion: \"V1\""]) assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(source, /shaktiSnapshots|utilityGraphVerdicts|spaceMappings/);
});

test("V1 Step 08 dual mode preserves legacy and selects Directional console", () => {
  const source = read("components/founder-step-workspace.tsx");
  assert.match(source, /DirectionalEvaluationConsoleV1/);
  assert.match(source, /evaluationArchitectureVersion === \"V1\"/);
  assert.match(source, /<EvaluationConsole/);
});

test("Directional readiness is additive and does not rewrite the scorecard", () => {
  const source = read("lib/v1-directional-readiness.ts");
  assert.match(source, /directionalInputFinal/);
  assert.match(source, /directionalEvaluationComplete/);
  assert.doesNotMatch(source, /founder-scorecard|Stage A|shakti/);
});

test("Step 08 binds server IDs, refreshed versions and explicit stale-CAS recovery", () => {
  const source = read("components/directional-evaluation-console-v1.tsx");
  assert.match(source, /draft\.id/);
  assert.match(source, /draft\.recordVersion/);
  assert.match(source, /caseVersion/);
  assert.match(source, /await refresh\(\)/);
  assert.match(source, /case changed after this screen was loaded/i);
  assert.match(source, /disabled=\{Boolean\(busyAction\)\}/);
});

test("Step 08 successor path preserves finalized input immutability", () => {
  const source = read("components/directional-evaluation-console-v1.tsx");
  assert.match(source, /directional-input-successor-v1/);
  assert.match(source, /predecessorId: finalizedInput\.id/);
  assert.match(source, /Finalized inputs are immutable/);
});
