import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error The disposable fixture is intentionally JavaScript and is executed by Node's strip-types runner.
import { buildReleaseableFounderPilotFixture, founderPilotActor, pilotIds } from "./fixtures/founder-pilot-fixture.mjs";
import { setAppState } from "../lib/store.ts";
import { requestEvaluationReplacement, transitionFloorRegeneration } from "../lib/founder-regeneration.ts";
import { buildFounderScorecard } from "../lib/founder-scorecard.ts";

function evaluationState() {
  const fixture = buildReleaseableFounderPilotFixture();
  fixture.state.reportVersions = [];
  fixture.state.siteAnalyses = [];
  fixture.state.postSiteFindings = [];
  fixture.state.assessmentObservations = [];
  fixture.state.recommendations = [];
  fixture.state.implementationTasks = [];
  fixture.state.dependencyInvalidations = [];
  setAppState(fixture.state);
  return fixture.state;
}

test("Founder creates, binds and verifies a Shakti successor without mutating history", () => {
  const state = evaluationState();
  const prior = structuredClone(state.shaktiSnapshots[0]);
  const request = requestEvaluationReplacement({ caseId: pilotIds.caseId, floorId: pilotIds.floorId, targetType: "SHAKTI_EVALUATION", snapshotId: prior.id,
    reason: "TEST_ONLY correct the sixteen-value source after Founder review.", idempotencyKey: "test-shakti-successor-request", expectedRecordVersion: state.vastuCases[0].recordVersion ?? 0, actor: founderPilotActor });
  const invalidation = request.invalidations.find((item: { targetType: string }) => item.targetType === "SHAKTI_EVALUATION")!;
  assert.equal(invalidation.status, "REPLACEMENT_REQUIRED");
  const regenerationScorecard = buildFounderScorecard(state, founderPilotActor, pilotIds.clientId, pilotIds.caseId, pilotIds.floorId);
  assert.equal(regenerationScorecard.modules[4].status, "COMPLETE", "evaluation successor must not reopen layout");
  assert.equal(regenerationScorecard.modules[5].status, "COMPLETE", "evaluation successor must not reopen gridding");
  assert.equal(regenerationScorecard.modules[6].status, "COMPLETE", "evaluation successor must not reopen the approved manual sheet");
  assert.equal(regenerationScorecard.modules[7].status, "NEEDS_REGENERATION");
  assert.deepEqual(state.shaktiSnapshots.find((item: { id: string }) => item.id === prior.id), prior);
  assert.equal(requestEvaluationReplacement({ caseId: pilotIds.caseId, floorId: pilotIds.floorId, targetType: "SHAKTI_EVALUATION", snapshotId: prior.id,
    reason: "TEST_ONLY correct the sixteen-value source after Founder review.", idempotencyKey: "test-shakti-successor-request", expectedRecordVersion: state.vastuCases[0].recordVersion ?? 0, actor: founderPilotActor }).replayed, true);
  assert.throws(() => requestEvaluationReplacement({ caseId: pilotIds.caseId, floorId: pilotIds.floorId, targetType: "SHAKTI_EVALUATION", snapshotId: prior.id,
    reason: "TEST_ONLY changed body must conflict and never mutate history.", idempotencyKey: "test-shakti-successor-request", expectedRecordVersion: state.vastuCases[0].recordVersion ?? 0, actor: founderPilotActor }), /different replacement request/);

  const replacement = structuredClone(prior);
  replacement.id = "test-shakti-successor-snapshot";
  replacement.inputValues = [8, 8, 7, 7, 6, 9, 9, 7, 6, 7, 8, 9, 8, 7, 6, 9];
  replacement.idempotencyKey = "test-shakti-successor-snapshot-key";
  replacement.provenance = { ...replacement.provenance!, inputHash: "sha256:test-successor-input", outputHash: "sha256:test-successor-output" };
  state.shaktiSnapshots.unshift(replacement);
  assert.notEqual(replacement.id, prior.id);
  assert.equal(state.shaktiSnapshots.length, 2);
  transitionFloorRegeneration({ invalidationId: invalidation.id, toStatus: "REGENERATED", replacementVersionId: replacement.id, reason: "TEST_ONLY bind the exact Shakti successor to current lineage.", idempotencyKey: "test-shakti-successor-bind", expectedRecordVersion: 0, actor: founderPilotActor });
  transitionFloorRegeneration({ invalidationId: invalidation.id, toStatus: "READY_FOR_REVIEW", replacementVersionId: replacement.id, reason: "TEST_ONLY verify the exact Shakti successor lineage.", idempotencyKey: "test-shakti-successor-verify", expectedRecordVersion: 1, actor: founderPilotActor });
  const step = buildFounderScorecard(state, founderPilotActor, pilotIds.clientId, pilotIds.caseId, pilotIds.floorId).modules[7];
  assert.equal(step.status, "COMPLETE");
  assert.equal(step.explanation, "Utility and Shakti snapshots are frozen and traceable.");
});

test("replacement request rejects non-Founder and wrong-floor context", () => {
  const state = evaluationState();
  const base = { caseId: pilotIds.caseId, floorId: pilotIds.floorId, targetType: "SHAKTI_EVALUATION", snapshotId: pilotIds.shaktiId,
    reason: "TEST_ONLY request must remain owner and floor scoped.", idempotencyKey: "test-shakti-denial", expectedRecordVersion: state.vastuCases[0].recordVersion ?? 0 };
  assert.throws(() => requestEvaluationReplacement({ ...base, actor: { ...founderPilotActor, role: "CONSULTANT" as const } }), /Only the active organisation owner/);
  assert.throws(() => requestEvaluationReplacement({ ...base, floorId: "wrong-floor", actor: founderPilotActor }), /Floor not found/);
});
