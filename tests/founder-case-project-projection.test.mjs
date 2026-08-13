import test from "node:test";
import assert from "node:assert/strict";
import { buildFounderScorecard } from "../lib/founder-scorecard.ts";
import { canOpenFounderFlowStep, getCurrentFounderFlowStep } from "../lib/founder-flow.ts";
import { buildReleaseableFounderPilotFixture, pilotIds } from "./fixtures/founder-pilot-fixture.mjs";

function scorecardWithoutLegacyCommercialProjection() {
  const { state, actor } = buildReleaseableFounderPilotFixture();
  state.commercialProposals = [];
  state.advanceVerifications = [];
  return buildFounderScorecard(state, actor, pilotIds.clientId, pilotIds.caseId, pilotIds.floorId);
}

test("an existing exact case/project remains complete without a legacy proposal or advance projection", () => {
  const scorecard = scorecardWithoutLegacyCommercialProjection();
  const caseStep = scorecard.modules[0];
  assert.equal(caseStep.status, "COMPLETE");
  assert.match(caseStep.purpose, /confirmed advance or an approved Internal Complimentary exception/i);
  assert.notEqual(getCurrentFounderFlowStep(scorecard)?.number, 1);
});

test("the next floor step stays accessible when it is complete and step one is historical", () => {
  const scorecard = scorecardWithoutLegacyCommercialProjection();
  assert.equal(scorecard.modules[1].status, "COMPLETE");
  assert.equal(canOpenFounderFlowStep(scorecard, 2), true);
});

test("a missing case remains blocked instead of being inferred from downstream records", () => {
  const { state, actor } = buildReleaseableFounderPilotFixture();
  state.vastuCases = [];
  state.projects = [];
  state.floorWorkspaces = [];
  const scorecard = buildFounderScorecard(state, actor, pilotIds.clientId);
  assert.equal(scorecard.modules[0].status, "BLOCKED");
  assert.equal(getCurrentFounderFlowStep(scorecard)?.number, 1);
});
