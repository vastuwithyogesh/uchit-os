import assert from "node:assert/strict";
import { artifactStillMatches, canonicalReportPayload, createArtifactManifest } from "../lib/report-artifacts.ts";
import { getStageAFloorReviewBlockers, recordStageAFloorCheckpoint } from "../lib/founder-regeneration.ts";
import { getProjectProgress } from "../lib/project-model.ts";
import { DEFAULT_FOUNDER_WORKFLOW_POLICY } from "../lib/foundation.ts";
import { buildFounderStagingDryRunPlan } from "../lib/founder-staging-walkthrough.ts";
import { buildReleaseableMultiFloorFounderPilotFixture, multiFloorIds } from "../tests/fixtures/founder-multifloor-pilot-fixture.mjs";
import { pilotIds } from "../tests/fixtures/founder-pilot-fixture.mjs";

// This is a safe, dependency-light staging-like walkthrough. It creates no D1/R2
// rows, does not call a deployed route, and never enables client delivery.
const pilot = buildReleaseableMultiFloorFounderPilotFixture();
const { state, actor, ground, first } = pilot;
const dryRunPlan = buildFounderStagingDryRunPlan({
  organisationId: actor.organisationId,
  clientId: "10000000-0000-4000-8000-000000000003",
  projectId: "10000000-0000-4000-8000-000000000005",
  caseId: "10000000-0000-4000-8000-000000000006",
  floorIds: ["10000000-0000-4000-8000-000000000007", multiFloorIds.floorId],
  expectedRevision: 0,
  expectedRecordVersions: { "10000000-0000-4000-8000-000000000006": 1 }
});
assert.equal(dryRunPlan.writes, false);

assert.equal(state.clients.length, 1);
assert.equal(state.floorWorkspaces.length, 2);
assert.notDeepEqual(ground.evidence.plan.bytes, first.evidence.plan.bytes);
assert.notDeepEqual(ground.evidence.manual.bytes, first.evidence.manual.bytes);
assert.notDeepEqual(ground.evidence.plan.bytes, ground.evidence.manual.bytes);
assert.notDeepEqual(first.evidence.plan.bytes, first.evidence.manual.bytes);
await createArtifactManifest(state, ground.report, actor);
await createArtifactManifest(state, first.report, actor);
assert.deepEqual(getStageAFloorReviewBlockers(state, ground.report), []);
assert.deepEqual(getStageAFloorReviewBlockers(state, first.report), []);
const groundHash = ground.report.artifact.contentHash;
const firstHash = first.report.artifact.contentHash;
const firstPayload = JSON.stringify(canonicalReportPayload(state, first.report));

for (const [key, report] of [["ground", ground.report], ["first", first.report]]) {
  recordStageAFloorCheckpoint(state, report, "FOUNDER_REVIEWED", actor, `Synthetic ${key} floor Founder review.`, `walkthrough-${key}-reviewed`);
  recordStageAFloorCheckpoint(state, report, "FOUNDER_APPROVED", actor, `Synthetic ${key} floor Founder approval.`, `walkthrough-${key}-approved`);
  recordStageAFloorCheckpoint(state, report, "RELEASED", actor, `Synthetic ${key} floor release checkpoint.`, `walkthrough-${key}-released`);
  report.status = "RELEASED";
}

assert.equal(state.stageAFloorApprovalCheckpoints.length, 6);
assert.equal(ground.report.artifact.contentHash, groundHash);
assert.equal(first.report.artifact.contentHash, firstHash);
state.planVersions.find((item) => item.id === pilotIds.planId).versionLabel = "Ground plan changed in isolated walkthrough";
assert.equal(JSON.stringify(canonicalReportPayload(state, first.report)), firstPayload);
assert.equal(await artifactStillMatches(state, first.report), true);
assert.equal(await artifactStillMatches(state, ground.report), false);
assert.equal(getProjectProgress(state, pilotIds.projectId).status, "IN_PROGRESS");
assert.equal(DEFAULT_FOUNDER_WORKFLOW_POLICY.policyJson.clientDeliveryEnabled, false);

console.log(JSON.stringify({
  mode: "CONTROLLED_SYNTHETIC_STAGING_WALKTHROUGH",
  status: "PASS",
  syntheticOnly: true,
  externalWrites: false,
  clientDeliveryEnabled: false,
  floors: [pilotIds.floorId, multiFloorIds.floorId],
  checks: {
    dryRunPlan: dryRunPlan.mode,
    independentPlanFiles: true,
    independentManualSheets: true,
    exactFloorReviewQueuesClear: true,
    immutableFounderCheckpoints: 6,
    partialReleaseRemainsInProgress: true,
    isolatedMutationInvalidatesOnlyTargetFloor: true,
    stageB: "BLOCKED_METHOD_INPUT"
  }
}));
