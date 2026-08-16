import assert from "node:assert/strict";
import test from "node:test";
import { approveV1FullBalanceClearance, getCurrentV1FullBalanceClearance } from "../lib/v1-full-balance-clearance.ts";
import { resolveV1FloorWorkflowReadiness } from "../lib/founder-v1-readiness.ts";
import { createNativeV1BaseFixture } from "./helpers/native-v1-evaluation-fixture.ts";

test("native V1 Full Balance Clearance binds to the current Evaluation and finalized Report", () => {
  const fixture = createNativeV1BaseFixture();
  fixture.state.v1FullBalanceClearances = [];
  const before = resolveV1FloorWorkflowReadiness(fixture.state, fixture.caseRecord.id, fixture.floor.id);
  assert.equal(before.fullBalanceClearance, "READY");
  const clearance = approveV1FullBalanceClearance({ state: fixture.state, organisationId: fixture.organisationId, caseId: fixture.caseRecord.id, projectId: fixture.project.id, floorId: fixture.floor.id, actor: fixture.owner, expectedRecordVersion: 0, idempotencyKey: "native-v1-clearance-approval-1" });
  assert.equal(clearance.scope, "FULL_BALANCE_CLEARANCE_V1");
  assert.equal(clearance.elementalEvaluationSnapshotId, fixture.elementalEvaluation.id);
  assert.equal(clearance.elementalReportSnapshotId, fixture.elementalReport.id);
  assert.equal(getCurrentV1FullBalanceClearance(fixture.state, fixture.organisationId, fixture.caseRecord.id, fixture.project.id, fixture.floor.id)?.id, clearance.id);
  assert.equal(resolveV1FloorWorkflowReadiness(fixture.state, fixture.caseRecord.id, fixture.floor.id).fullBalanceClearance, "COMPLETE");
  assert.equal(fixture.state.postSiteFindings.length, 0);
});

test("native V1 Full Balance Clearance replay is idempotent and changed source is rejected", () => {
  const fixture = createNativeV1BaseFixture();
  fixture.state.v1FullBalanceClearances = [];
  const input = { state: fixture.state, organisationId: fixture.organisationId, caseId: fixture.caseRecord.id, projectId: fixture.project.id, floorId: fixture.floor.id, actor: fixture.owner, expectedRecordVersion: 0, idempotencyKey: "native-v1-clearance-approval-2" } as const;
  const first = approveV1FullBalanceClearance(input);
  assert.equal(approveV1FullBalanceClearance(input).id, first.id);
  assert.throws(() => approveV1FullBalanceClearance({ ...input, expectedRecordVersion: 1, idempotencyKey: "native-v1-clearance-approval-3" }), /already exists|changed/);
});
