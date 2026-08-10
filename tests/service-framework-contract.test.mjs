import test from "node:test";
import assert from "node:assert/strict";
import { source, functionBody } from "./helpers/source-contracts.mjs";

test("service metadata is additive and legacy cases have safe defaults", () => {
  const domain = source("lib/domain.ts");
  const framework = source("lib/service-framework.ts");
  assert.match(domain, /serviceType\?: VastuServiceType/);
  assert.match(domain, /canonicalStage\?: CanonicalServiceStage/);
  assert.match(domain, /serviceTemplateVersion\?: string/);
  assert.match(domain, /scopeVersion\?: string/);
  assert.match(framework, /caseRecord\.serviceType \?\? "EXISTING_SPACE"/);
  assert.match(framework, /stageFromLegacyStatus\[caseRecord\.status\]/);
});

test("existing space and new construction use different readiness checklists", () => {
  const framework = source("lib/service-framework.ts");
  const checklist = functionBody(framework, "getServiceReadinessChecklist");
  assert.match(checklist, /serviceType === "NEW_CONSTRUCTION"/);
  assert.match(checklist, /Plot measurements and diagonals/);
  assert.match(checklist, /Current drawing version verified/);
  assert.match(checklist, /Dimensioned floor plans/);
  assert.match(checklist, /Photos and walkthrough/);
});

test("all seven canonical stages are encoded without changing commercial gates", () => {
  const domain = source("lib/domain.ts");
  const framework = source("lib/service-framework.ts");
  assert.match(domain, /"UNDERSTAND", "VERIFY", "MAP", "EVALUATE", "PRIORITISE", "RECOMMEND", "IMPLEMENT"/);
  assert.match(framework, /AWAITING_ADVANCE: "UNDERSTAND"/);
  assert.match(framework, /REPORT_APPROVAL_PENDING: "RECOMMEND"/);
  assert.match(framework, /REPORT_APPROVED: "IMPLEMENT"/);
  assert.doesNotMatch(framework, /fetch\(|saveState|setAppState|\bPAYMENT_APPROVED\b|approvals\s*=/);
});

test("case setup and staff workspace expose service, stage, readiness, and versions", () => {
  const master = source("components/case-master-console.tsx");
  const workspace = source("lib/case-workspace.ts");
  const workspaceUi = source("components/case-workspace.tsx");
  assert.match(master, /Service setup/);
  assert.match(master, /Current stage/);
  assert.match(master, /Service template/);
  assert.match(master, /const draftChecklist = draftCase \? getServiceReadinessChecklist\(draftCase\) : \[\]/);
  assert.match(master, /Required information/);
  assert.match(workspace, /serviceType: serviceTypeLabel/);
  assert.match(workspace, /canonicalStage: canonicalStageLabel/);
  assert.match(workspace, /inputs ready/);
  assert.match(workspaceUi, /Service: \{item\.serviceType\}/);
  assert.match(workspaceUi, /Stage: \{item\.canonicalStage\}/);
  assert.match(workspaceUi, /Information: \{item\.readiness\}/);
  assert.match(workspaceUi, /Internal status:/);
});

test("client remains excluded from the staff workspace projection", () => {
  const projection = functionBody(source("lib/case-workspace.ts"), "buildCaseWorkspaceProjection");
  assert.match(projection, /actor\.role === "CLIENT"/);
});
