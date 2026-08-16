import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyAppState } from "../lib/store.ts";
import { createStageBInputV1, finalizeStageBInputV1, normalizeStageBInputV1, normalizeStageBInputsV1 } from "../lib/stage-b-input-v1.ts";
import { translateEvaluationRemedyHandoffV1ToStageB } from "../lib/evaluation-remedy-stage-b-adapter-v1.ts";

const actor: any = { id: "founder", fullName: "Founder", role: "SUPER_ADMIN", organisationId: "org-1" };
const decisions = [
  ["WATER", "GROUND", "SPECIFIC_DIRECTION", "N"], ["AIR", "PROMOTE", "SPECIFIC_DIRECTION", "E"],
  ["FIRE", "SUPPRESS", "WHOLE_ELEMENT"], ["EARTH", "UPLIFT", "WHOLE_ELEMENT"], ["SPACE", "BALANCE", "WHOLE_ELEMENT"]
].map(([element, verdict, correctionScope, targetDirection], index) => ({ element, verdict, correctionScope, ...(targetDirection ? { targetDirection } : {}), remedyType: ({ GROUND: "DISHA_BALANCER", PROMOTE: "DISHA_ACTIVATION", SUPPRESS: "TATTAV_BALANCER", UPLIFT: "TATTAV_ACTIVATION", BALANCE: "EQUALISER" } as any)[verdict as string], reasonCode: verdict, statementId: `statement-${index}`, statementContentHash: `hash-${index}` }));
const handoff: any = { version: "evaluation-remedy-handoff/v1", organisationId: "org-1", caseId: "case-1", projectId: "project-1", floorId: "floor-1", elementalEvaluationSnapshotId: "elemental-1", elementalEvaluationOutputHash: "elemental-hash", methodologyVersionId: "method-1", methodologyContentHash: "method-hash", decisions, deterministicContentHash: "handoff-hash" };

function state() { const s: any = createEmptyAppState(); s.vastuCases.push({ id: "case-1", organisationId: "org-1", clientId: "client-1", projectId: "project-1" }); s.projects.push({ id: "project-1", organisationId: "org-1", activeCaseId: "case-1" }); s.floorWorkspaces.push({ id: "floor-1", organisationId: "org-1", caseId: "case-1", projectId: "project-1" }); s.evaluationRemedyHandoffs.push({ id: "handoff-1", ...handoff, handoff, contentHash: handoff.deterministicContentHash, status: "READY", recordVersion: 1 }); s.combinedEvaluationReportSnapshots.push({ id: "combined-1", organisationId: "org-1", caseId: "case-1", projectId: "project-1", floorId: "floor-1", architectureVersion: "V1", status: "FINALIZED", reportVersion: 1, remedyHandoffId: "handoff-1", remedyHandoffContentHash: handoff.deterministicContentHash, contentHash: "combined-hash" }); return s; }

test("StageBInputV1 preserves five decisions and native direction scope without a legacy verdict", () => {
  const s = state(); const draft = createStageBInputV1({ state: s, handoffId: "handoff-1", actor, idempotencyKey: "input-1", expectedRecordVersion: 1 });
  assert.equal(draft.status, "DRAFT"); assert.equal(draft.decisions.length, 5); assert.equal(draft.decisions.find((x) => x.verdict === "GROUND")?.specificDirection, "N");
  assert.equal(draft.decisions.find((x) => x.verdict === "SUPPRESS")?.specificDirection, undefined);
  const final = finalizeStageBInputV1({ state: s, recordId: draft.id, actor, expectedRecordVersion: draft.recordVersion ?? 0, idempotencyKey: "final-1" });
  assert.equal(final.status, "FINALIZED"); assert.equal(normalizeStageBInputV1(final, "DISHA_BALANCER")?.directions?.[0], "N");
  assert.equal(normalizeStageBInputV1(final, "TATTAV_BALANCER")?.directions, undefined);
});

test("StageBInputV1 normalization preserves every same-type elemental context", () => {
  const s = state(); const draft = createStageBInputV1({ state: s, handoffId: "handoff-1", actor, idempotencyKey: "input-multi", expectedRecordVersion: 1 });
  draft.decisions[1] = { ...draft.decisions[1], stageBRemedyType: "DISHA_BALANCER", element: "AIR", specificDirection: "E" } as any;
  draft.decisions[3] = { ...draft.decisions[3], stageBRemedyType: "DISHA_BALANCER", element: "EARTH", specificDirection: "SW" } as any;
  finalizeStageBInputV1({ state: s, recordId: draft.id, actor, expectedRecordVersion: draft.recordVersion ?? 0, idempotencyKey: "final-multi" });
  assert.deepEqual(normalizeStageBInputsV1(draft, "DISHA_BALANCER").map((item) => [item.element, item.directions]), [["WATER", ["N"]], ["AIR", ["E"]], ["EARTH", ["SW"]]]);
});

test("StageBInputV1 fails closed without the current finalized Combined Evaluation", () => {
  const s: any = state(); s.combinedEvaluationReportSnapshots = [];
  assert.throws(() => createStageBInputV1({ state: s, handoffId: "handoff-1", actor, idempotencyKey: "input-no-combined", expectedRecordVersion: 1 }), /CURRENT_FINALIZED_COMBINED_REQUIRED/);
});

test("V1 adapter remains non-fabricating and native readiness is finalized-input based", () => {
  const translated = translateEvaluationRemedyHandoffV1ToStageB({ handoff });
  assert.equal(translated.stageBReady, false); assert.equal(translated.reason, "LEGACY_UTILITY_VERDICT_REQUIRED");
  assert.equal((translated.decisions.find((x) => x.verdict === "GROUND") as any).specificDirection, "N");
});
