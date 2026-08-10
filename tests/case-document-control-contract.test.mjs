import test from "node:test";
import assert from "node:assert/strict";
import { functionBody, source, switchCaseBody } from "./helpers/source-contracts.mjs";

const domain = source("lib/domain.ts");
const store = source("lib/store.ts");
const merge = source("lib/persistence-merge.ts");
const framework = source("lib/service-framework.ts");
const workflow = source("lib/workflow-service.ts");
const actions = source("app/api/actions/route.ts");

test("service document checklists are distinct and complete", () => {
  for (const value of ["DIMENSIONED_PLAN", "LOCATION_MAP", "PHOTO_VIDEO", "ENTRANCE_ACCESS", "CURRENT_USE", "STRUCTURE_SERVICES", "FURNITURE_EQUIPMENT", "CLIENT_PRIORITIES", "SURVEY_BOUNDARY", "ROADS_ACCESS", "DEVELOPMENT_CONTROLS", "INTENT_ROOM_BRIEF", "USER_HIERARCHY_MOVEMENT", "ARCHITECTURAL_DRAWING", "EQUIPMENT_SERVICES", "FUTURE_NEEDS", "PROJECT_TEAM", "MILESTONES"]) assert.match(framework, new RegExp(`"${value}"`));
  assert.match(framework, /EXISTING_SPACE:/);
  assert.match(framework, /NEW_CONSTRUCTION:/);
});

test("document metadata is additive and never stores embedded file bytes", () => {
  assert.match(domain, /interface CaseDocumentRecord/);
  assert.match(store, /caseDocuments: CaseDocumentRecord\[\]/);
  assert.match(store, /caseDocuments: \[\]/);
  assert.match(merge, /"caseDocuments"/);
  assert.doesNotMatch(domain.slice(domain.indexOf("export interface CaseDocumentRecord"), domain.indexOf("export interface FloorWorkspaceRecord")), /fileBytes|base64|dataUrl/);
  assert.match(functionBody(workflow, "upsertCaseDocument"), /opaque protected-file reference/);
});

test("document writes enforce role, allowlist, concurrency and rollback", () => {
  assert.match(actions, /"case-document-upsert"/);
  assert.match(switchCaseBody(actions, "case-document-upsert"), /canEvaluateCases\(actor\)/);
  assert.match(actions, /case-document-upsert.*recordId.*assetType.*evidenceRef.*revisionStatus/s);
  assert.match(actions, /Unknown assessment field/);
  assert.match(actions, /expectedRecordVersion/);
  assert.match(actions, /expectedRevision/);
  assert.match(actions, /setAppState\(rollbackState/);
});

test("current version transitions are unique, atomic, versioned and audited", () => {
  const body = functionBody(workflow, "upsertCaseDocument");
  assert.match(body, /That document version already exists/);
  assert.match(body, /item\.isCurrent = false/);
  assert.match(body, /item\.revisionStatus = "SUPERSEDED"/);
  assert.match(body, /caseRecord\.recordVersion/);
  assert.match(body, /idempotencyKey/);
  assert.match(body, /received: existing\?\.received \?\? stamp/);
  assert.match(body, /verified: revisionStatus === "VERIFIED"/);
  assert.match(body, /appendTimeline/);
  assert.match(body, /Every document requirement must retain one current version/);
  assert.match(body, /item\.caseRevisionNumber === revisionNumber && item\.serviceType === serviceType/);
});

test("verification fails closed on evidence, discrepancy, blocker, inactive revision or artifact", () => {
  const body = functionBody(workflow, "upsertCaseDocument");
  assert.match(body, /cannot be verified without evidence/);
  assert.match(body, /Resolve blockers and discrepancies before verification/);
  const context = functionBody(workflow, "assessmentContext");
  assert.match(context, /not the active case revision/);
  assert.match(context, /item\.artifact/);
});

test("document writes enforce service ownership, floor ownership, and opaque private references", () => {
  const body = functionBody(workflow, "upsertCaseDocument");
  assert.match(body, /serviceDocumentRequirements\[serviceType\]\.includes\(assetType\)/);
  assert.match(body, /item\.caseId === caseId && item\.floorLabel === floorLabel/);
  assert.match(body, /public path/);
  assert.match(body, /evidenceRef\.includes\("\.\."\)/);
});

test("evaluation uses the verified-current service checklist", () => {
  const readiness = functionBody(framework, "getCaseDocumentReadiness");
  assert.match(readiness, /item\.caseRevisionNumber === revisionNumber/);
  assert.match(readiness, /item\.serviceType === serviceType/);
  assert.match(readiness, /state\.floorWorkspaces/);
  assert.match(readiness, /floor\.floorLabel/);
  assert.match(readiness, /item\.isCurrent/);
  assert.match(readiness, /revisionStatus === "VERIFIED"/);
  assert.match(readiness, /!document\.blocker/);
  assert.match(readiness, /!document\.discrepancy/);
  const blockers = functionBody(framework, "getCaseEvaluationBlockers");
  assert.match(blockers, /getCaseDocumentReadiness/);
  assert.match(blockers, /Verify the current required case documents before evaluation/);
});
