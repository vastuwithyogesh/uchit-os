import test from "node:test";
import assert from "node:assert/strict";
import { buildFounderScorecard } from "../lib/founder-scorecard.ts";
import { canOpenFounderFlowStep, getCurrentFounderFlowStep } from "../lib/founder-flow.ts";
import { createNativeV1BaseFixture, nativeV1Owner } from "./helpers/native-v1-evaluation-fixture.ts";

function removeDirectionalWork(fixture: ReturnType<typeof createNativeV1BaseFixture>) {
  fixture.state.directionalInputVersions.length = 0;
  fixture.state.directionalEvaluationSnapshots.length = 0;
  fixture.state.directionalReportCardSnapshots.length = 0;
  fixture.state.directionalStageAPresentations.length = 0;
  Object.assign(fixture.propertyContext.propertyContext, { serviceInterest: "EXISTING_SPACE", propertyStatus: "OCCUPIED" });
  fixture.state.clientIntakeProfiles.push({ id: "intake-native-v1", clientId: fixture.client.id, organisationId: fixture.organisationId, needs: { mainChallenge: "TEST_ONLY directional workflow certification", desiredOutcome: "TEST_ONLY deterministic evaluation" }, recordVersion: 1 } as never);
}

test("V1 Step 08 is READY and renders its input workspace after spatial authority is complete", () => {
  const fixture = createNativeV1BaseFixture();
  removeDirectionalWork(fixture);

  const scorecard = buildFounderScorecard(fixture.state, { role: nativeV1Owner.role }, undefined, fixture.caseRecord.id, fixture.floor.id);
  const supportingEvidence = scorecard.modules.find((item) => item.number === 7);
  const directionalEvaluation = scorecard.modules.find((item) => item.number === 8);

  assert.equal(supportingEvidence?.status, "READY");
  assert.equal(directionalEvaluation?.status, "READY");
  assert.equal(getCurrentFounderFlowStep(scorecard)?.id, "evaluation");
  assert.equal(canOpenFounderFlowStep(scorecard, 8), true);
});

test("V1 Step 08 remains blocked when finalized spatial authority is absent", () => {
  const fixture = createNativeV1BaseFixture();
  removeDirectionalWork(fixture);
  fixture.state.d16UtilityMappingVersions.length = 0;

  const scorecard = buildFounderScorecard(fixture.state, { role: nativeV1Owner.role }, undefined, fixture.caseRecord.id, fixture.floor.id);
  const directionalEvaluation = scorecard.modules.find((item) => item.number === 8);

  assert.equal(directionalEvaluation?.status, "BLOCKED");
  assert.equal(canOpenFounderFlowStep(scorecard, 8), false);
});
