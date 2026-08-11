import test from "node:test";
import assert from "node:assert/strict";
import { functionBody, source, switchCaseBody } from "./helpers/source-contracts.mjs";

const actions = source("app/api/actions/route.ts");
const workflow = source("lib/workflow-service.ts");
const framework = source("lib/service-framework.ts");

test("service configuration is consultant-only, validated, and persisted by the action route", () => {
  const action = switchCaseBody(actions, "case-service-configure");
  assert.match(action, /if \(!canEvaluateCases\(actor\)\)/);
  assert.match(action, /configureCaseService\(/);
  assert.match(actions, /await persistStateToDatabase\(undefined, expectedGlobalRevision\)/);
  const configure = functionBody(workflow, "configureCaseService");
  assert.match(configure, /serviceTypes\.includes/);
  assert.match(configure, /canonicalServiceStages\.includes/);
  assert.match(configure, /Unknown readiness item/);
  assert.match(configure, /Unknown drawing field/);
  assert.match(configure, /input\.actor\.fullName/);
});

test("rejected configuration cannot partially mutate a case", () => {
  const configure = functionBody(workflow, "configureCaseService");
  const mutationIndex = configure.indexOf("Object.assign(caseRecord");
  assert.ok(mutationIndex > 0);
  for (const validation of ["serviceTypes.includes", "canonicalServiceStages.includes", "Unknown readiness item", "Unknown drawing field", "serviceTemplateVersion", "scopeVersion"]) {
    assert.ok(configure.indexOf(validation) < mutationIndex, `${validation} must be checked before mutation`);
  }
});

test("service setup is locked after evaluation snapshots or an artifacted report", () => {
  const configure = functionBody(workflow, "configureCaseService");
  assert.match(configure, /state\.evaluationSnapshots\.some/);
  assert.match(configure, /state\.shaktiSnapshots\.some/);
  assert.match(configure, /state\.reportVersions\.some\(\(item\) => item\.caseId === caseId && item\.artifact\)/);
  assert.match(configure, /formal rectification workflow/);
});

test("both evaluation engines use the same fail-closed readiness assertion", () => {
  for (const functionName of ["createEvaluationSnapshot", "recordShaktiSnapshot"]) {
    const body = functionBody(workflow, functionName);
    assert.match(body, /evaluationFloorContext\(caseId, floorIdValue, "(?:UTILITY_EVALUATION|SHAKTI_EVALUATION)"\)/);
    assert.match(body, /floorId: floor\.id/);
    assert.match(body, /planVersionId: plan\.id/);
    assert.match(body, /orientationVersionId: orientation\.id/);
  }
  const context = functionBody(workflow, "evaluationFloorContext");
  assert.match(context, /assertCaseReadyForEvaluation\(state, caseId, floorId\)/);
  assert.match(context, /item\.floorId === floorId && item\.status === "CURRENT"/);
  assert.match(context, /item\.caseId === caseId && item\.status === "LOCKED"/);
  assert.match(context, /item\.planVersionId === plan\?\.id/);
  assert.match(context, /item\.kind === "HAND_MARKED_PLAN"/);
  assert.match(context, /item\.fullColour/);
});

test("evaluation readiness requires orientation, complete inputs, and locked floors", () => {
  const blockers = functionBody(framework, "getCaseEvaluationBlockers");
  assert.match(blockers, /!caseRecord\.orientationLocked/);
  assert.match(blockers, /!readiness\.ready/);
  assert.match(blockers, /!floors\.length/);
  assert.match(blockers, /floors\.some\(\(floor\) => !floor\.locked\)/);
  const assertion = functionBody(framework, "assertCaseReadyForEvaluation");
  assert.match(assertion, /getCaseEvaluationBlockers/);
  assert.match(assertion, /CaseReadinessError/);
  assert.match(actions, /\[400, 401, 403, 404, 409, 428, 503\]\.includes\(Number\(error\.statusCode\)\)/);
});
