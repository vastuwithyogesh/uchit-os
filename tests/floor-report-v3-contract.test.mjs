import test from "node:test";
import assert from "node:assert/strict";
import { artifactStillMatches, canonicalReportPayload, createArtifactManifest, REPORT_TEMPLATE_VERSION } from "../lib/report-artifacts.ts";
import { renderPrintableReport } from "../lib/report-html.ts";
import { functionBody, source, switchCaseBody } from "./helpers/source-contracts.mjs";

const actor = { id: "founder-1", fullName: "Founder", email: "founder@example.test", role: "SUPER_ADMIN", color: "#000" };

function fixture() {
  return {
    clients: [{ id: "client-1", displayName: "Client One", city: "Pune" }], leadQualifications: [], clientIntakeProfiles: [],
    vastuCases: [{ id: "case-1", clientId: "client-1", projectId: "project-1", caseNumber: "UV-1", serviceType: "EXISTING_SPACE" }],
    floorWorkspaces: [
      { id: "floor-a", caseId: "case-1", projectId: "project-1", floorLabel: "Ground floor", status: "LOCKED", locked: true, evidenceUploads: [] },
      { id: "floor-b", caseId: "case-1", projectId: "project-1", floorLabel: "First floor", status: "LOCKED", locked: true, evidenceUploads: [] }
    ],
    planVersions: [
      { id: "plan-a", projectId: "project-1", caseId: "case-1", floorId: "floor-a", versionLabel: "A1", status: "CURRENT", protectedFileRef: "file-a" },
      { id: "plan-b", projectId: "project-1", caseId: "case-1", floorId: "floor-b", versionLabel: "B1", status: "CURRENT", protectedFileRef: "file-b" }
    ],
    orientationVersions: [{ id: "orientation-1", projectId: "project-1", caseId: "case-1", exactDegree: 42.5, googleEarthEvidenceVersionId: "earth-1", status: "LOCKED" }],
    spatialEvidenceVersions: [
      { id: "marked-a", projectId: "project-1", caseId: "case-1", floorId: "floor-a", planVersionId: "plan-a", kind: "HAND_MARKED_PLAN", protectedFileRef: "private-a", fullColour: true, status: "CURRENT" },
      { id: "marked-b", projectId: "project-1", caseId: "case-1", floorId: "floor-b", planVersionId: "plan-b", kind: "HAND_MARKED_PLAN", protectedFileRef: "private-b", fullColour: true, status: "CURRENT" }
    ],
    openingMappings: [{ id: "opening-a", projectId: "project-1", caseId: "case-1", floorId: "floor-a", planVersionId: "plan-a", orientationVersionId: "orientation-1", kind: "MAIN_ENTRANCE", markerX: 10, markerY: 20, verified: true, methodologyStatus: "APPROVED", directionCode: "D-A", evidenceVersionId: "marked-a" }],
    spaceMappings: [{ id: "space-a", projectId: "project-1", caseId: "case-1", floorId: "floor-a", planVersionId: "plan-a", orientationVersionId: "orientation-1", spaceLabel: "Kitchen", polygon: [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 1 }], verified: true, methodologyStatus: "APPROVED", directionCode: "S-A", evidenceVersionId: "marked-a" }],
    evaluationSnapshots: [
      { id: "eval-a", caseId: "case-1", floorId: "floor-a", planVersionId: "plan-a", orientationVersionId: "orientation-1", snapshotName: "Floor A", sourceVersion: "utility/v1", generatedMatrix: [{ code: "A", verdict: "APPROVED", confidence: 90, ruleId: "rule-a" }], provenance: { inputHash: "in-a", outputHash: "out-a", algorithmVersion: "utility/a1", methodologyVersionId: "method-a" } },
      { id: "eval-b", caseId: "case-1", floorId: "floor-b", planVersionId: "plan-b", orientationVersionId: "orientation-1", snapshotName: "Floor B", sourceVersion: "utility/v1", generatedMatrix: [{ code: "B", verdict: "APPROVED", confidence: 80, ruleId: "rule-b" }], provenance: { inputHash: "in-b", outputHash: "out-b", algorithmVersion: "utility/a1", methodologyVersionId: "method-b" } }
    ],
    shaktiSnapshots: [
      { id: "shakti-a", caseId: "case-1", floorId: "floor-a", planVersionId: "plan-a", orientationVersionId: "orientation-1", inputValues: [1], elementAverages: { Earth: 1 }, rankedVerdicts: [], tieBreakUsed: false, provenance: { inputHash: "sin-a", outputHash: "sout-a", algorithmVersion: "shakti/a1", methodologyVersionId: "shakti-method-a" } },
      { id: "shakti-b", caseId: "case-1", floorId: "floor-b", planVersionId: "plan-b", orientationVersionId: "orientation-1", inputValues: [2], elementAverages: { Earth: 2 }, rankedVerdicts: [], tieBreakUsed: false, provenance: { inputHash: "sin-b", outputHash: "sout-b", algorithmVersion: "shakti/a1", methodologyVersionId: "shakti-method-b" } }
    ],
    assessmentObservations: [], recommendations: [], implementationTasks: []
  };
}

test("v3 artifact binds exactly one floor and all mandatory lineage", async () => {
  const state = fixture();
  const report = { id: "report-a", caseId: "case-1", floorId: "floor-a", versionLabel: "Ground floor report", isPreview: true, status: "PAYMENT_BLOCKED", approvals: [] };
  report.artifact = await createArtifactManifest(state, report, actor);
  assert.equal(report.artifact.templateVersion, REPORT_TEMPLATE_VERSION);
  assert.deepEqual({ floor: report.artifact.floorId, plan: report.artifact.planVersionId, orientation: report.artifact.orientationVersionId, evidence: report.artifact.handMarkedEvidenceVersionId, evaluation: report.artifact.evaluationSnapshotId, shakti: report.artifact.shaktiSnapshotId },
    { floor: "floor-a", plan: "plan-a", orientation: "orientation-1", evidence: "marked-a", evaluation: "eval-a", shakti: "shakti-a" });
  assert.equal(await artifactStillMatches(state, report), true);
  const payload = JSON.stringify(canonicalReportPayload(state, report));
  assert.match(payload, /Ground floor|eval-a|marked-a|D-A|S-A/);
  assert.doesNotMatch(payload, /First floor|eval-b|marked-b|private-a|private-b/);
  const html = renderPrintableReport(state, report);
  assert.match(html, /Ground floor|42\.5°|Full-colour hand-marked evidence/);
  assert.doesNotMatch(html, /First floor|Download \/ Print PDF|private-a/);
});

test("other-floor changes do not mutate a floor artifact, but bound lineage changes do", async () => {
  const state = fixture();
  const report = { id: "report-a", caseId: "case-1", floorId: "floor-a", versionLabel: "Ground floor report", isPreview: false, status: "READY_FOR_APPROVAL", approvals: [] };
  report.artifact = await createArtifactManifest(state, report, actor);
  state.evaluationSnapshots[1].generatedMatrix[0].verdict = "CHANGED OTHER FLOOR";
  assert.equal(await artifactStillMatches(state, report), true);
  state.evaluationSnapshots[0].generatedMatrix[0].verdict = "CHANGED BOUND FLOOR";
  assert.equal(await artifactStillMatches(state, report), false);
});

test("Stage A preview remains byte and hash stable when downstream Site/Post-Site records are later added", async () => {
  const state = fixture();
  const report = { id: "preview-a", caseId: "case-1", floorId: "floor-a", versionLabel: "Ground floor preview", isPreview: true, status: "PAYMENT_BLOCKED", approvals: [] };
  report.artifact = await createArtifactManifest(state, report, actor);
  const before = JSON.stringify(canonicalReportPayload(state, report));
  state.siteAnalyses = [{ id: "site-a", caseId: "case-1", floorId: "floor-a", status: "FOUNDER_APPROVED", version: 1, needsRegeneration: false }];
  state.postSiteFindings = [{ id: "post-a", caseId: "case-1", floorId: "floor-a", status: "FOUNDER_APPROVED", version: 1, needsRegeneration: false }];
  assert.equal(await artifactStillMatches(state, report), true);
  assert.equal(JSON.stringify(canonicalReportPayload(state, report)), before);
});

test("v3 artifact generation fails closed without mandatory marked evidence", async () => {
  const state = fixture();
  state.spatialEvidenceVersions = state.spatialEvidenceVersions.filter((item) => item.id !== "marked-a");
  const report = { id: "report-a", caseId: "case-1", floorId: "floor-a", versionLabel: "Ground floor report", isPreview: false, status: "READY_FOR_APPROVAL", approvals: [] };
  await assert.rejects(createArtifactManifest(state, report, actor), /full-colour marked evidence/);
});

test("report workflow and route require floor and optimistic concurrency", () => {
  const actions = source("app/api/actions/route.ts");
  const workflow = source("lib/workflow-service.ts");
  for (const actionName of ["preview-report", "final-report-prepare", "stage-a-present"]) {
    const action = switchCaseBody(actions, actionName);
    assert.match(action, /body\.floorId/);
    assert.match(action, /body\.expectedRecordVersion/);
    assert.match(actions, new RegExp(`"${actionName}": \\[([^\\]]*"floorId"[^\\]]*"expectedRevision"[^\\]]*)\\]`));
  }
  assert.match(functionBody(workflow, "generatePreviewReport"), /item\.floorId === floor\.id/);
  assert.match(functionBody(workflow, "recordStageAVerdictPresentation"), /allFloorsPresented/);
  assert.match(functionBody(workflow, "prepareFinalReport"), /item\.floorId === floor\.id/);
  assert.match(functionBody(workflow, "releaseVerdict"), /allFloorsReleased/);
  assert.match(source("app/api/reports/[reportId]/print/route.ts"), /report\.isPreview[\s\S]*status: 403/);
});
