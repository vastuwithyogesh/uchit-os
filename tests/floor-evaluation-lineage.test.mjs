import test from "node:test";
import assert from "node:assert/strict";
import { functionBody, source, switchCaseBody } from "./helpers/source-contracts.mjs";

const actions = source("app/api/actions/route.ts");
const workflow = source("lib/workflow-service.ts");
const framework = source("lib/service-framework.ts");
const evaluationUi = source("components/evaluation-console.tsx");

test("Utility and Shakti actions require exact floor and concurrency lineage", () => {
  for (const actionName of ["utility-evaluate", "shakti-rank"]) {
    const allowlist = new RegExp(`"${actionName}": \\[([^\\]]*"floorId"[^\\]]*"expectedRecordVersion"[^\\]]*"expectedRevision"[^\\]]*)\\]`);
    assert.match(actions, allowlist);
    const action = switchCaseBody(actions, actionName);
    assert.match(action, /body\.floorId/);
    assert.match(action, /body\.expectedRecordVersion/);
    assert.match(action, /body\.idempotencyKey/);
  }
});

test("evaluation context fails closed on cross-floor or stale evidence", () => {
  const context = functionBody(workflow, "evaluationFloorContext");
  assert.match(context, /floor\.id !== floorId/);
  assert.match(context, /floor\.projectId !== caseRecord\.projectId/);
  assert.match(context, /item\.floorId === floorId && item\.status === "CURRENT"/);
  assert.match(context, /item\.planVersionId === plan\?\.id/);
  assert.match(context, /item\.kind === "HAND_MARKED_PLAN"/);
  assert.match(context, /item\.fullColour/);
  assert.match(context, /Current plan, locked orientation, and full-colour marked evidence are required/);
});

test("evaluation snapshots are unique and traceable per floor", () => {
  for (const functionName of ["createEvaluationSnapshot", "recordShaktiSnapshot"]) {
    const body = functionBody(workflow, functionName);
    assert.match(body, /item\.caseId === caseId && item\.floorId === floor\.id/);
    assert.match(body, /floorId: floor\.id/);
    assert.match(body, /planVersionId: plan\.id/);
    assert.match(body, /orientationVersionId: orientation\.id/);
    assert.match(body, /methodologyVersionId: methodology\.version\.id/);
    assert.match(body, /methodologyContentHash: methodology\.version\.contentHash/);
    assert.match(body, /assertExpectedRecordVersion/);
    assert.match(body, /caseRecord\.recordVersion = \(caseRecord\.recordVersion \?\? 0\) \+ 1/);
  }
});

test("readiness and UI select one floor without merging evaluations", () => {
  const blockers = functionBody(framework, "getCaseEvaluationBlockers");
  assert.match(blockers, /!report\.floorId \|\| report\.floorId === floorId/);
  assert.match(blockers, /item\.id === floorId && item\.caseId === caseId/);
  assert.match(blockers, /!floorId \|\| floor\.id === floorId/);
  assert.match(evaluationUi, /selectedFloorId/);
  assert.match(evaluationUi, /item\.floorId === selectedFloor\?\.id/);
  assert.match(evaluationUi, /floorId: selectedFloor\.id/);
  assert.match(evaluationUi, /expectedRecordVersion: currentCase\.recordVersion \?\? 0/);
  assert.match(evaluationUi, /expectedRevision: state\.persistenceRevision/);
});
