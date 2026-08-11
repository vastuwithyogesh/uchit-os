import test from "node:test";
import assert from "node:assert/strict";
import { functionBody, source, switchCaseBody } from "./helpers/source-contracts.mjs";

const actions = source("app/api/actions/route.ts");
const workflow = source("lib/workflow-service.ts");
const framework = source("lib/service-framework.ts");
const evaluationUi = source("components/evaluation-console.tsx");

test("evaluation inputs reject bad names and unknown or duplicate zones before mutation", () => {
  const body = functionBody(workflow, "createEvaluationSnapshot");
  for (const contract of ["MAX_SNAPSHOT_NAME_LENGTH", "Zone codes must be a list", "non-blank string", "must not contain duplicates", "Unknown zone code"]) {
    assert.match(body, new RegExp(contract));
  }
  assert.ok(body.indexOf("Unknown zone code") < body.indexOf("state.evaluationSnapshots.unshift"));
});

test("identical service and evaluation retries are idempotent", () => {
  assert.match(functionBody(workflow, "configureCaseService"), /deterministicContentHash\(currentConfiguration\).*deterministicContentHash\(nextConfiguration\)/s);
  assert.match(functionBody(workflow, "createEvaluationSnapshot"), /existingSnapshot.*return existingSnapshot/s);
  assert.match(functionBody(workflow, "recordShaktiSnapshot"), /existingSnapshot.*return existingSnapshot/s);
});

test("evaluation actor evidence reaches timeline records", () => {
  assert.match(switchCaseBody(actions, "utility-evaluate"), /actor\)/);
  assert.match(switchCaseBody(actions, "shakti-rank"), /actor\)/);
  const timeline = functionBody(workflow, "appendTimeline");
  assert.match(timeline, /actorId:/);
  assert.match(timeline, /actorName:/);
});

test("service configuration rejects unknown top-level fields with a bad request", () => {
  const action = switchCaseBody(actions, "case-service-configure");
  assert.match(action, /Unknown service setup field/);
  assert.match(action, /status: 400/);
});

test("artifacted reports block both engines with conflict semantics", () => {
  const blockers = functionBody(framework, "getCaseEvaluationBlockers");
  assert.match(blockers, /report\.caseId === caseId && report\.artifact/);
  assert.match(blockers, /formal rectification workflow/);
  assert.match(functionBody(framework, "assertCaseReadyForEvaluation"), /getCaseEvaluationBlockers/);
  assert.match(actions, /\[400, 401, 403, 404, 409, 428, 503\]\.includes\(Number\(error\.statusCode\)\)/);
});

test("drawing dates reject future values and invalid chronology", () => {
  assert.match(workflow, /cannot be in the future/);
  assert.match(workflow, /verification date cannot be earlier than the received date/);
});

test("a differing evaluation retry requires formal rectification", () => {
  for (const name of ["createEvaluationSnapshot", "recordShaktiSnapshot"]) {
    const body = functionBody(workflow, name);
    assert.match(body, /existingSnapshot\.provenance\?\.inputHash === inputHash/);
    assert.match(body, /throw new WorkflowConflictError/);
    assert.match(body, /formal rectification/);
  }
});

test("client controls use the same complete server prerequisite helper", () => {
  assert.equal((evaluationUi.match(/disabled=\{busy \|\| !evaluationReady/g) ?? []).length, 2);
  assert.match(evaluationUi, /getCaseEvaluationBlockers/);
  assert.match(evaluationUi, /evaluationBlockers\.slice\(0, 3\)\.map/);
  assert.match(evaluationUi, /href="\/ops">Complete case setup/);
});
