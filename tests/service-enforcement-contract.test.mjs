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
  assert.match(actions, /await persistStateToDatabase\(\)/);
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

test("service setup is locked after evaluation snapshots or any report", () => {
  const configure = functionBody(workflow, "configureCaseService");
  assert.match(configure, /state\.evaluationSnapshots\.some/);
  assert.match(configure, /state\.shaktiSnapshots\.some/);
  assert.match(configure, /state\.reportVersions\.some\(\(item\) => item\.caseId === caseId\)/);
  assert.match(configure, /formal rectification workflow/);
});

test("both evaluation engines use the same fail-closed readiness assertion", () => {
  assert.match(functionBody(workflow, "createEvaluationSnapshot"), /assertCaseReadyForEvaluation\(state, caseId\)/);
  assert.match(functionBody(workflow, "recordShaktiSnapshot"), /assertCaseReadyForEvaluation\(state, caseId\)/);
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
  assert.match(actions, /error\.statusCode === 409 \? 409 : 400/);
});
