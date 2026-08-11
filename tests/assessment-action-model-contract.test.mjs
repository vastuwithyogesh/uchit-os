import test from "node:test";
import assert from "node:assert/strict";
import { functionBody, source, switchCaseBody } from "./helpers/source-contracts.mjs";

const domain = source("lib/domain.ts");
const store = source("lib/store.ts");
const merge = source("lib/persistence-merge.ts");
const workflow = source("lib/workflow-service.ts");
const framework = source("lib/service-framework.ts");
const actions = source("app/api/actions/route.ts");

test("assessment entities use approved categories without an invented aggregate score", () => {
  for (const value of ["ALIGNED", "CONCERN", "BALANCED", "EXCESS", "RELOCATE", "IMMEDIATE", "ADVISORY", "L1", "L4", "IN_PROGRESS", "NOT_APPLICABLE"]) assert.match(domain, new RegExp(`"${value}"`));
  assert.match(domain, /interface AssessmentObservation/);
  assert.match(domain, /interface Recommendation/);
  assert.match(domain, /interface ImplementationTask/);
  const model = domain.slice(domain.indexOf("export interface AssessmentObservation"), domain.indexOf("export interface FloorWorkspaceRecord"));
  assert.doesNotMatch(model, /aggregateScore|numericScore|price/);
});

test("assessment collections are additive and legacy-safe", () => {
  for (const name of ["assessmentObservations", "recommendations", "implementationTasks"]) {
    assert.match(store, new RegExp(`${name}: .*\\[\\]`));
    assert.match(store, new RegExp(`${name}: \\[\\]`));
    assert.match(merge, new RegExp(`"${name}"`));
  }
});

test("writes are consultant-only, concurrent, rollback-safe, and reject unknown fields", () => {
  for (const action of ["assessment-observation-upsert", "assessment-recommendation-upsert", "assessment-implementation-upsert"]) {
    assert.match(switchCaseBody(actions, action), /canEvaluateCases\(actor\)/);
  }
  assert.match(actions, /assessmentAllowedFields/);
  assert.match(actions, /Unknown assessment field/);
  assert.match(actions, /expectedRecordVersion/);
  assert.match(actions, /expectedRevision/);
  assert.match(actions, /setAppState\(rollbackState/);
});

test("every write binds to active revision, actor, service, and immutable evidence", () => {
  const context = functionBody(workflow, "assessmentContext");
  assert.match(context, /getActiveCaseForClient/);
  assert.match(context, /item\.artifact/);
  assert.match(context, /item\.id === floorId && item\.caseId === caseId/);
  for (const name of ["upsertAssessmentObservation", "upsertRecommendation", "upsertImplementationTask"]) {
    const body = functionBody(workflow, name);
    assert.match(body, /idempotencyKey/);
    assert.match(body, /assertExpectedRecordVersion/);
    assert.match(body, /caseRevisionNumber: revisionNumber/);
    assert.match(body, /floorId/);
    assert.match(body, /Evidence references are immutable/);
    assert.match(body, /recordVersion/);
    assert.match(body, /appendTimeline/);
  }
  assert.match(functionBody(workflow, "audit"), /actorId: actor\.id/);
});

test("links stay within one case revision and tasks have bounded responsibility", () => {
  assert.match(functionBody(workflow, "upsertRecommendation"), /item\.id === id && item\.caseId === caseId && item\.floorId === floorId/);
  const task = functionBody(workflow, "upsertImplementationTask");
  assert.match(task, /item\.id === recommendationId && item\.caseId === caseId && item\.floorId === floorId/);
  assert.match(task, /ownerRole: enumValue\(input\.ownerRole, responsibilityRoles/);
  assert.match(task, /boundedRequiredString\(input\.ownerName, "Responsibility owner name", 120\)/);
  assert.match(domain, /"ARCHITECT".*"STRUCTURAL_ENGINEER".*"MEP_ENGINEER".*"INTERIOR_DESIGNER".*"CONTRACTOR".*"SITE_TEAM"/s);
  assert.doesNotMatch(domain, /ownerEmail|ownerPhone/);
});

test("structured-report readiness is explicit without a scoring rule", () => {
  const readiness = functionBody(framework, "getCaseAssessmentReadiness");
  assert.match(readiness, /observationCount > 0 && recommendationCount > 0/);
  assert.doesNotMatch(readiness, /score|weight|price/);
});
