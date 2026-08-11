import test from "node:test";
import assert from "node:assert/strict";
import { source, functionBody } from "./helpers/source-contracts.mjs";
import { getProjectProgress } from "../lib/project-model.ts";

function stateWith(overrides = {}) {
  return {
    floorWorkspaces: [],
    reportVersions: [],
    vastuCases: [],
    projects: [],
    ...overrides
  };
}

test("case creation opens one project and links every floor to it", () => {
  const workflow = source("lib/workflow-service.ts");
  const create = functionBody(workflow, "createVastuCase");
  const addFloor = functionBody(workflow, "addFloorWorkspace");
  assert.match(create, /const projectId = nextId\("project"\)/);
  assert.match(create, /state\.projects\.unshift/);
  assert.match(create, /activeCaseId: nextCase\.id/);
  assert.match(create, /projectId,/);
  assert.match(addFloor, /caseRecord\.projectId/);
  assert.match(addFloor, /projectId,/);
});

test("consultant assignment belongs to the project, never an individual floor", () => {
  const domain = source("lib/domain.ts");
  const project = domain.slice(domain.indexOf("export interface VastuProjectRecord"), domain.indexOf("export interface PlanVersionRecord"));
  const floor = domain.slice(domain.indexOf("export interface FloorWorkspaceRecord"), domain.indexOf("export interface RemedialWorkflowReservation"));
  assert.match(project, /assignedConsultantUserId\?: string/);
  assert.doesNotMatch(floor, /Consultant|assignedUser/);
});

test("partial floor completion never closes the overall project", () => {
  const progress = getProjectProgress(stateWith({
    floorWorkspaces: [
      { id: "f1", projectId: "p1", caseId: "c1", deliveredAt: "2026-08-11T00:00:00.000Z" },
      { id: "f2", projectId: "p1", caseId: "c2" }
    ],
    reportVersions: [
      { id: "r1", caseId: "c1", floorId: "f1", isPreview: false, status: "RELEASED", artifact: { immutable: true } },
      { id: "r2", caseId: "c2", floorId: "f2", isPreview: false, status: "DRAFT" }
    ]
  }), "p1");
  assert.equal(progress.status, "IN_PROGRESS");
  assert.equal(progress.totalFloors, 2);
  assert.equal(progress.deliveredFloors, 1);
  assert.equal(progress.incompleteFloors, 1);
});

test("a project completes only when every independent floor report is released and delivered", () => {
  const progress = getProjectProgress(stateWith({
    floorWorkspaces: [
      { id: "f1", projectId: "p1", caseId: "c1", deliveredAt: "2026-08-11T00:00:00.000Z" },
      { id: "f2", projectId: "p1", caseId: "c2", deliveredAt: "2026-08-11T01:00:00.000Z" }
    ],
    reportVersions: [
      { id: "r1", caseId: "c1", floorId: "f1", isPreview: false, status: "RELEASED", artifact: { immutable: true } },
      { id: "r2", caseId: "c2", floorId: "f2", isPreview: false, status: "RELEASED", artifact: { immutable: true } }
    ]
  }), "p1");
  assert.equal(progress.status, "COMPLETE");
  assert.equal(progress.releasedFloors, 2);
  assert.equal(progress.deliveredFloors, 2);
});

test("orientation and mapping reserve exact evidence-bound versions without inventing boundaries", () => {
  const domain = source("lib/domain.ts");
  assert.match(domain, /exactDegree: number/);
  assert.match(domain, /googleEarthEvidenceVersionId: string/);
  assert.match(domain, /orientationVersionId: string/);
  assert.match(domain, /planVersionId: string/);
  assert.match(domain, /BLOCKED_METHOD_INPUT/);
  assert.doesNotMatch(domain, /degreeBoundary|sectorStart|sectorEnd/);
});

test("Stage B is only a blocked reservation and contains no invented remedy selection", () => {
  const domain = source("lib/domain.ts");
  const reservation = domain.slice(domain.indexOf("export interface RemedialWorkflowReservation"), domain.indexOf("export interface ReportVersionRecord"));
  assert.match(reservation, /stageAReportId: string/);
  assert.match(reservation, /BLOCKED_METHOD_INPUT/);
  assert.doesNotMatch(reservation, /remedy|threshold|priority|sequence/i);
});
