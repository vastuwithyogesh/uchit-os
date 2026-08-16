import assert from "node:assert/strict";
import test from "node:test";
import { createStageBInputV1 } from "../lib/stage-b-input-v1.ts";
import { ensureStageBReservation } from "../lib/stage-b-remediation.ts";
import { createNativeV1BaseFixture } from "./helpers/native-v1-evaluation-fixture.ts";

test("cumulative fixture finalizes StageBInputV1 from the exact READY Handoff and reserves V1 Stage-B", () => {
  const fixture = createNativeV1BaseFixture();
  assert.equal(fixture.stageBInput.status, "FINALIZED");
  assert.equal(fixture.stageBInput.architectureVersion, "V1");
  assert.equal(fixture.stageBInput.sourceEvaluationRemedyHandoffId, fixture.remedyTypeHandoff.id);
  assert.equal(fixture.stageBInput.sourceEvaluationRemedyHandoffHash, fixture.remedyTypeHandoff.contentHash);
  assert.equal(fixture.stageBInput.sourceElementalEvaluationSnapshotId, fixture.elementalEvaluation.id);
  assert.equal(fixture.stageBInput.sourceElementalEvaluationHash, fixture.elementalEvaluation.outputHash);
  assert.deepEqual(fixture.stageBInput.decisions.map((item) => item.element), ["WATER", "AIR", "FIRE", "EARTH", "SPACE"]);
  assert.equal(fixture.stageBReservation?.status, "READY_FOR_CONFIGURATION");
  assert.equal(fixture.stageBReservation?.organisationId, fixture.organisationId);
  assert.equal(fixture.stageBReservation?.caseId, fixture.caseRecord.id);
  assert.equal(fixture.stageBReservation?.projectId, fixture.project.id);
  assert.equal(fixture.stageBReservation?.floorId, fixture.floor.id);
  assert.equal((fixture.stageBReservation as any)?.stageASourceId, fixture.directionalStageAPresentation.id);
  assert.equal(fixture.stageBReservation?.methodologyVersionId, fixture.stageBMethodology.id);
  assert.equal(fixture.state.stageBRemediations.length, 0);
});

test("StageBInput rejects a stale or cross-scope Handoff source", () => {
  const stale = createNativeV1BaseFixture();
  assert.throws(() => createStageBInputV1({ state: stale.state, handoffId: "stale-handoff", actor: stale.owner, expectedRecordVersion: 1, idempotencyKey: "native-v1-stale-stage-b-input" }), /SOURCE_HANDOFF_INVALID/);
  const crossFloor = createNativeV1BaseFixture();
  crossFloor.remedyTypeHandoff.floorId = "floor-native-v1-other";
  assert.throws(() => createStageBInputV1({ state: crossFloor.state, handoffId: crossFloor.remedyTypeHandoff.id, actor: crossFloor.owner, expectedRecordVersion: crossFloor.remedyTypeHandoff.recordVersion, idempotencyKey: "native-v1-cross-floor-stage-b-input" }), /Case, project, or floor lineage mismatch/);
});

test("reservation rejects missing StageBInput and commercial-gate failures", () => {
  const missingInput = createNativeV1BaseFixture();
  missingInput.state.stageBInputsV1.length = 0;
  assert.equal(ensureStageBReservation({ state: missingInput.state, caseId: missingInput.caseRecord.id, floorId: missingInput.floor.id, actor: missingInput.owner }), null);
  const commercial = createNativeV1BaseFixture();
  commercial.caseRecord.fullPaymentApproved = false;
  assert.equal(ensureStageBReservation({ state: commercial.state, caseId: commercial.caseRecord.id, floorId: commercial.floor.id, actor: commercial.owner }), null);
  commercial.caseRecord.fullPaymentApproved = true;
  commercial.caseRecord.balanceApproved = false;
  assert.equal(ensureStageBReservation({ state: commercial.state, caseId: commercial.caseRecord.id, floorId: commercial.floor.id, actor: commercial.owner }), null);
  commercial.caseRecord.balanceApproved = true;
  assert.equal(ensureStageBReservation({ state: commercial.state, caseId: commercial.caseRecord.id, floorId: commercial.floor.id, actor: commercial.owner })?.status, "READY_FOR_CONFIGURATION");
});

test("reservation does not accept another Floor's V1 authority", () => {
  const fixture = createNativeV1BaseFixture();
  const otherFloor = { ...fixture.floor, id: "floor-native-v1-other", floorLabel: "Other Floor" };
  fixture.state.floorWorkspaces.push(otherFloor as any);
  assert.equal(ensureStageBReservation({ state: fixture.state, caseId: fixture.caseRecord.id, floorId: otherFloor.id, actor: fixture.owner }), null);
});

test("finalized V1 input plus accepted zero-value complimentary contract reaches configuration readiness", () => {
  const fixture = createNativeV1BaseFixture();
  fixture.caseRecord.balanceApproved = false;
  fixture.caseRecord.fullPaymentApproved = false;
  const proposal = fixture.state.founderProposalVersions[0] as any;
  proposal.content.commercial = { engagementClassification: "INTERNAL_COMPLIMENTARY", professionalFeePaise: 0, referenceFeePaise: 100, gstReferenceBasisPoints: 1800, gstAppliedBasisPoints: 0, gstAmountPaise: 0, totalPayablePaise: 0, agreedAdvancePaise: 0, remainingBalancePaise: 0, advanceExceptionApproved: true, classificationReason: "Accepted test contract", paymentMilestones: [] };
  fixture.state.remedialWorkflowReservations.length = 0;
  const reservation = ensureStageBReservation({ state: fixture.state, caseId: fixture.caseRecord.id, floorId: fixture.floor.id, actor: fixture.owner });
  assert.equal(reservation?.status, "READY_FOR_CONFIGURATION");
  assert.equal(fixture.state.stageBRemediations.length, 0);
  assert.equal(fixture.state.payments.length, 0);
});
