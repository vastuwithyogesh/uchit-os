import test from "node:test";
import assert from "node:assert/strict";
import { getAllowedPipelineTransitions, legacyPipelineStage, normalizeClientPipeline } from "../lib/crm-pipeline.ts";

test("allowed transitions exactly match the normal server workflow", () => {
  assert.deepEqual(getAllowedPipelineTransitions("NEW"), ["CONTACTED", "VSL_SENT", "DISQUALIFIED"]);
  assert.deepEqual(getAllowedPipelineTransitions("CONTACTED"), ["VSL_SENT", "PAID_REVIEW_PENDING", "PRE_CASE_FOLLOW_UP", "DISQUALIFIED"]);
  assert.deepEqual(getAllowedPipelineTransitions("QUALIFIED"), ["PROPOSAL_SCOPE", "PRE_CASE_FOLLOW_UP", "DISQUALIFIED"]);
  assert.deepEqual(getAllowedPipelineTransitions("WON"), ["ONBOARDING"]);
  assert.deepEqual(getAllowedPipelineTransitions("FOLLOW_UP"), ["CLOSED_REFERRAL"]);
  assert.deepEqual(getAllowedPipelineTransitions("CLOSED_REFERRAL"), []);
  assert.deepEqual(getAllowedPipelineTransitions("DISQUALIFIED"), []);
});

test("returned transition arrays cannot mutate the canonical map", () => {
  const transitions = getAllowedPipelineTransitions("NEW");
  transitions.push("WON");
  assert.deepEqual(getAllowedPipelineTransitions("NEW"), ["CONTACTED", "VSL_SENT", "DISQUALIFIED"]);
});

test("legacy normalization remains deterministic and record-version safe", () => {
  assert.equal(legacyPipelineStage("CONVERTED"), "WON");
  assert.equal(legacyPipelineStage("DISQUALIFIED"), "DISQUALIFIED");
  assert.deepEqual(normalizeClientPipeline({ id: "c", displayName: "C", city: "", source: "", assignedSetterId: "", email: "", phone: "", stage: "QUALIFYING" }), { stage: "CONTACTED", owner: undefined, nextAction: undefined, recordVersion: 0 });
});

test("pre-case nurture is distinct from legacy post-case follow-up", () => {
  assert.deepEqual(getAllowedPipelineTransitions("PRE_CASE_FOLLOW_UP"), ["CONTACTED", "PAID_REVIEW_PENDING", "DISQUALIFIED"]);
  assert.deepEqual(getAllowedPipelineTransitions("FOLLOW_UP"), ["CLOSED_REFERRAL"]);
});
