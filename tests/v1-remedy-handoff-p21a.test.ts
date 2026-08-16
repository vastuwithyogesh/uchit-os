import assert from "node:assert/strict";
import test from "node:test";
import { createV1RemedyHandoff } from "../lib/elemental-report-snapshot-v1.ts";
import { createNativeV1BaseFixture } from "./helpers/native-v1-evaluation-fixture.ts";

function cleanFixture(stageBRemedyPattern = false) {
  const fixture = createNativeV1BaseFixture({ stageBRemedyPattern });
  fixture.state.evaluationRemedyHandoffs = [];
  fixture.state.combinedEvaluationReportSnapshots = [];
  fixture.state.stageBInputsV1 = [];
  fixture.state.remedialWorkflowReservations = [];
  fixture.state.stageBRemediations = [];
  return fixture;
}

test("P21A handoff requires the current approved clearance and finalized bound report", () => {
  const fixture = cleanFixture(true);
  const handoff = createV1RemedyHandoff({ state: fixture.state, organisationId: fixture.organisationId, caseId: fixture.caseRecord.id, projectId: fixture.project.id, floorId: fixture.floor.id, actor: fixture.owner, expectedRecordVersion: fixture.elementalEvaluation.recordVersion, idempotencyKey: "p21a-valid-handoff" });
  assert.equal(handoff.status, "READY");
  assert.equal(handoff.elementalEvaluationSnapshotId, fixture.elementalEvaluation.id);
  assert.equal(handoff.elementalReportSnapshotId, fixture.elementalReport.id);
  assert.equal(handoff.fullBalanceClearanceId, fixture.fullBalanceClearance.id);
  assert.deepEqual((handoff.handoff as any).decisions.map((item: any) => [item.element, item.verdict, item.remedyType]), fixture.elementalEvaluation.elements.map((item: any) => [item.element, item.verdict, item.remedyType]));
});

test("P21A rejects missing, wrong-source and non-finalized report packages", () => {
  const missing = cleanFixture();
  missing.state.v1FullBalanceClearances = [];
  assert.throws(() => createV1RemedyHandoff({ state: missing.state, organisationId: missing.organisationId, caseId: missing.caseRecord.id, projectId: missing.project.id, floorId: missing.floor.id, actor: missing.owner, expectedRecordVersion: missing.elementalEvaluation.recordVersion, idempotencyKey: "p21a-no-clearance" }), /Full Balance Clearance/);

  const wrong = cleanFixture();
  wrong.state.v1FullBalanceClearances[0].elementalReportSnapshotId = "historical-report";
  assert.throws(() => createV1RemedyHandoff({ state: wrong.state, organisationId: wrong.organisationId, caseId: wrong.caseRecord.id, projectId: wrong.project.id, floorId: wrong.floor.id, actor: wrong.owner, expectedRecordVersion: wrong.elementalEvaluation.recordVersion, idempotencyKey: "p21a-wrong-report" }), /Full Balance Clearance/);

  const draft = cleanFixture();
  draft.state.elementalReportSnapshots.find((item) => item.id === draft.elementalReport.id)!.status = "DRAFT";
  assert.throws(() => createV1RemedyHandoff({ state: draft.state, organisationId: draft.organisationId, caseId: draft.caseRecord.id, projectId: draft.project.id, floorId: draft.floor.id, actor: draft.owner, expectedRecordVersion: draft.elementalEvaluation.recordVersion, idempotencyKey: "p21a-draft-report" }), /FINALIZED Elemental Report/);
});

test("P21A handoff replay is safe and changed source with the same key is rejected", () => {
  const fixture = cleanFixture();
  const input = { state: fixture.state, organisationId: fixture.organisationId, caseId: fixture.caseRecord.id, projectId: fixture.project.id, floorId: fixture.floor.id, actor: fixture.owner, expectedRecordVersion: fixture.elementalEvaluation.recordVersion, idempotencyKey: "p21a-replay-handoff" } as const;
  const first = createV1RemedyHandoff(input);
  assert.equal(createV1RemedyHandoff(input).id, first.id);
  fixture.state.elementalReportSnapshots.find((item) => item.id === fixture.elementalReport.id)!.contentHash = "sha256:changed";
  assert.throws(() => createV1RemedyHandoff(input), /Full Balance Clearance|different Remedy-Type Handoff sources/);
});
