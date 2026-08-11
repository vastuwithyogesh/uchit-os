import test from "node:test";
import assert from "node:assert/strict";
import { artifactStillMatches, canonicalReportPayload, createArtifactManifest } from "../lib/report-artifacts.ts";
import { renderPrintableReport } from "../lib/report-html.ts";
import { getStageAFloorReviewBlockers, recordStageAFloorCheckpoint } from "../lib/founder-regeneration.ts";
import { getProjectProgress } from "../lib/project-model.ts";
import { DEFAULT_FOUNDER_WORKFLOW_POLICY } from "../lib/foundation.ts";
import { inspectProtectedPdf, renderProtectedPdf } from "../lib/protected-pdf-renderer.ts";
import { pilotIds } from "./fixtures/founder-pilot-fixture.mjs";
import { buildReleaseableMultiFloorFounderPilotFixture, multiFloorIds } from "./fixtures/founder-multifloor-pilot-fixture.mjs";

async function prepareFloor(state, report, actor, key) {
  await createArtifactManifest(state, report, actor);
  assert.deepEqual(getStageAFloorReviewBlockers(state, report), []);
  recordStageAFloorCheckpoint(state, report, "FOUNDER_REVIEWED", actor, `Founder reviewed ${key} exact floor lineage.`, `${key}-reviewed`);
  recordStageAFloorCheckpoint(state, report, "FOUNDER_APPROVED", actor, `Founder approved ${key} exact floor report.`, `${key}-approved`);
  report.status = "RELEASED";
  recordStageAFloorCheckpoint(state, report, "RELEASED", actor, `Founder released ${key} protected report.`, `${key}-released`);
}

test("multi-floor pilot keeps one permanent client, project, case and project-level assignment", () => {
  const { state } = buildReleaseableMultiFloorFounderPilotFixture();
  assert.equal(state.clients.length, 1);
  assert.equal(state.projects.length, 1);
  assert.equal(state.vastuCases.length, 1);
  assert.equal(state.floorWorkspaces.length, 2);
  assert.deepEqual(new Set(state.floorWorkspaces.map((floor) => floor.caseId)), new Set([pilotIds.caseId]));
  state.projects[0].assignedConsultantUserId = pilotIds.founderId;
  assert.equal(state.projects[0].assignedConsultantUserId, pilotIds.founderId);
  assert.equal(state.floorWorkspaces.some((floor) => "assignedConsultantUserId" in floor), false);
  assert.equal(DEFAULT_FOUNDER_WORKFLOW_POLICY.policyJson.clientDeliveryEnabled, false);
});

test("every floor owns independent plan, evidence, evaluation, Site and report lineage", async () => {
  const { state, actor, ground, first } = buildReleaseableMultiFloorFounderPilotFixture();
  assert.notDeepEqual(ground.evidence.plan.bytes, ground.evidence.manual.bytes);
  assert.notDeepEqual(first.evidence.plan.bytes, first.evidence.manual.bytes);
  assert.notDeepEqual(ground.evidence.plan.bytes, first.evidence.plan.bytes);
  assert.notDeepEqual(ground.evidence.manual.bytes, first.evidence.manual.bytes);
  assert.match(ground.evidence.plan.checksumSha256, /^[0-9a-f]{64}$/);
  assert.match(ground.evidence.manual.checksumSha256, /^[0-9a-f]{64}$/);
  assert.match(first.evidence.plan.checksumSha256, /^[0-9a-f]{64}$/);
  assert.match(first.evidence.manual.checksumSha256, /^[0-9a-f]{64}$/);
  await createArtifactManifest(state, ground.report, actor);
  await createArtifactManifest(state, first.report, actor);
  assert.notEqual(ground.report.artifact.contentHash, first.report.artifact.contentHash);
  assert.equal(ground.report.artifact.floorId, pilotIds.floorId);
  assert.equal(first.report.artifact.floorId, multiFloorIds.floorId);
  assert.equal(ground.report.artifact.planVersionId, pilotIds.planId);
  assert.equal(first.report.artifact.planVersionId, multiFloorIds.planId);
  assert.notEqual(ground.report.artifact.evaluationSnapshotId, first.report.artifact.evaluationSnapshotId);
  assert.notEqual(ground.report.artifact.shaktiSnapshotId, first.report.artifact.shaktiSnapshotId);
  assert.notEqual(ground.report.artifact.manualUtilitySheetDocumentId, first.report.artifact.manualUtilitySheetDocumentId);
  assert.notEqual(ground.report.artifact.siteAnalysisId, first.report.artifact.siteAnalysisId);
  assert.notEqual(ground.report.artifact.postSiteFindingsId, first.report.artifact.postSiteFindingsId);
  assert.match(renderPrintableReport(state, ground.report), /Ground floor/);
  assert.doesNotMatch(renderPrintableReport(state, ground.report), /First floor/);
  assert.match(renderPrintableReport(state, first.report), /First floor/);
  assert.doesNotMatch(renderPrintableReport(state, first.report), /Ground floor/);
  const ownerSecret = "synthetic-multi-floor-owner-secret-32-plus";
  const groundPdf = await renderProtectedPdf({ reportVersionId: ground.report.id, sourceSnapshotHash: ground.report.artifact.contentHash,
    html: renderPrintableReport(state, ground.report), evidence: ground.evidence.manual, ownerSecret });
  const firstPdf = await renderProtectedPdf({ reportVersionId: first.report.id, sourceSnapshotHash: first.report.artifact.contentHash,
    html: renderPrintableReport(state, first.report), evidence: { ...first.evidence.manual, fileName: "synthetic-first-floor-manual-sheet.jpg" }, ownerSecret });
  assert.notDeepEqual(groundPdf.bytes, firstPdf.bytes);
  assert.equal(inspectProtectedPdf(groundPdf.bytes).pageExtractionBlocked, true);
  assert.equal(inspectProtectedPdf(firstPdf.bytes).pageExtractionBlocked, true);
});

test("a mutation on one floor never changes the other floor payload, bytes or artifact integrity", async () => {
  const { state, actor, ground, first } = buildReleaseableMultiFloorFounderPilotFixture();
  await createArtifactManifest(state, ground.report, actor);
  await createArtifactManifest(state, first.report, actor);
  const firstPayload = JSON.stringify(canonicalReportPayload(state, first.report));
  const firstHtml = renderPrintableReport(state, first.report);
  const firstHash = first.report.artifact.contentHash;
  state.planVersions.find((plan) => plan.id === pilotIds.planId).versionLabel = "Ground-floor plan changed after its draft";
  assert.equal(JSON.stringify(canonicalReportPayload(state, first.report)), firstPayload);
  assert.equal(renderPrintableReport(state, first.report), firstHtml);
  assert.equal(first.report.artifact.contentHash, firstHash);
  assert.equal(await artifactStillMatches(state, first.report), true);
  assert.equal(await artifactStillMatches(state, ground.report), false);
});

test("partial floor release and delivery can never complete the overall project", async () => {
  const { state, actor, ground, first } = buildReleaseableMultiFloorFounderPilotFixture();
  await prepareFloor(state, ground.report, actor, "ground-floor");
  let progress = getProjectProgress(state, pilotIds.projectId);
  assert.deepEqual(progress, { projectId: pilotIds.projectId, totalFloors: 2, releasedFloors: 1, deliveredFloors: 0, incompleteFloors: 2, status: "IN_PROGRESS" });

  const partialDelivery = structuredClone(state);
  partialDelivery.floorWorkspaces.find((floor) => floor.id === pilotIds.floorId).deliveredAt = "2026-08-11T07:00:00.000Z";
  progress = getProjectProgress(partialDelivery, pilotIds.projectId);
  assert.equal(progress.status, "IN_PROGRESS");
  assert.equal(progress.deliveredFloors, 1);
  assert.equal(progress.incompleteFloors, 1);

  await prepareFloor(state, first.report, actor, "first-floor");
  progress = getProjectProgress(state, pilotIds.projectId);
  assert.equal(progress.releasedFloors, 2);
  assert.equal(progress.deliveredFloors, 0);
  assert.equal(progress.status, "IN_PROGRESS");

  const hypotheticalAuthorisedDelivery = structuredClone(state);
  hypotheticalAuthorisedDelivery.floorWorkspaces.forEach((floor, index) => { floor.deliveredAt = `2026-08-11T0${8 + index}:00:00.000Z`; });
  assert.equal(getProjectProgress(hypotheticalAuthorisedDelivery, pilotIds.projectId).status, "COMPLETE");
  assert.equal(DEFAULT_FOUNDER_WORKFLOW_POLICY.policyJson.clientDeliveryEnabled, false);
});

test("missing or cross-floor evidence blocks only the intended floor and fails closed", async () => {
  const { state, actor, ground, first } = buildReleaseableMultiFloorFounderPilotFixture();
  await createArtifactManifest(state, ground.report, actor);
  await createArtifactManifest(state, first.report, actor);
  state.spatialEvidenceVersions = state.spatialEvidenceVersions.filter((item) => item.id !== multiFloorIds.marked16Id);
  assert.match(getStageAFloorReviewBlockers(state, first.report).join(" "), /16-direction/i);
  assert.doesNotMatch(getStageAFloorReviewBlockers(state, ground.report).join(" "), /16-direction/i);

  const wrongScope = buildReleaseableMultiFloorFounderPilotFixture();
  wrongScope.state.planVersions.find((plan) => plan.id === multiFloorIds.planId).floorId = pilotIds.floorId;
  await assert.rejects(() => createArtifactManifest(wrongScope.state, wrongScope.first.report, wrongScope.actor), /exact current plan|floor report requires/i);
});

test("multi-floor approvals and audit records are immutable and non-duplicating", async () => {
  const { state, actor, ground, first } = buildReleaseableMultiFloorFounderPilotFixture();
  await prepareFloor(state, ground.report, actor, "ground-audit");
  await prepareFloor(state, first.report, actor, "first-audit");
  assert.equal(state.stageAFloorApprovalCheckpoints.length, 6);
  assert.equal(new Set(state.stageAFloorApprovalCheckpoints.map((record) => record.idempotencyKey)).size, 6);
  assert.equal(new Set(state.auditEvents.map((record) => record.idempotencyKey)).size, state.auditEvents.length);
  assert.equal(new Set(state.timelineEvents.map((record) => record.id)).size, state.timelineEvents.length);
  const replay = recordStageAFloorCheckpoint(state, first.report, "RELEASED", actor, "Founder released first-audit protected report.", "first-audit-released");
  assert.equal(replay.checkpoint.idempotencyKey, "first-audit-released");
  assert.equal(state.stageAFloorApprovalCheckpoints.length, 6);
});
