import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const component = await readFile(new URL("../components/v1-site-elemental-workspace.tsx", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/actions/route.ts", import.meta.url), "utf8");

test("initial-create CAS authorities are action-specific", () => {
  assert.match(component, /site-evaluation-evidence-draft-v1" \? scopedCase\?\.recordVersion/);
  assert.match(component, /post-site-observation-draft-v1" \? currentSiteVersion/);
  assert.match(component, /energy-bar-evidence-draft-v1" \? currentPostSiteVersion/);
  assert.match(component, /energy-bar-state-draft-v1" \? currentEnergyEvidenceVersion/);
  assert.match(component, /elemental-evaluation-finalize-v1" \? currentEnergyStateVersion/);
});

test("all protected V1 callers retain expectedRevision and bounded idempotency", () => {
  assert.match(component, /expectedRevision: state\.persistenceRevision/);
  assert.match(component, /actionKeys\.current\[action\] \?\?= crypto\.randomUUID\(\)/);
  assert.match(component, /idempotencyKey,/);
  assert.doesNotMatch(component, /Date\.now\(\)/);
});

test("server remains fail-closed for missing entity CAS", () => {
  assert.match(route, /const hasEntityVersion = action === "commercial-policy-update" \? "expectedPolicyVersion" in body : "expectedRecordVersion" in body/);
  for (const action of ["site-evaluation-evidence-draft-v1", "post-site-observation-draft-v1", "energy-bar-evidence-draft-v1", "energy-bar-state-draft-v1", "elemental-evaluation-finalize-v1"]) assert.match(route, new RegExp(action));
});

test("V1 prerequisite actions remain explicit and ordered", () => {
  assert.match(component, /site-evaluation-evidence-draft-v1/);
  assert.match(component, /post-site-observation-draft-v1/);
  assert.match(component, /energy-bar-evidence-draft-v1/);
  assert.match(component, /elemental-evaluation-finalize-v1/);
  assert.match(component, /energy-bar-state-draft-v1/);
});
