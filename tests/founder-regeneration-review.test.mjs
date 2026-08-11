import test from "node:test";
import assert from "node:assert/strict";
import { functionBody, source, switchCaseBody } from "./helpers/source-contracts.mjs";

test("regeneration lifecycle is explicit, sequential, replacement-backed and append-only", () => {
  const domain = source("lib/domain.ts");
  const regeneration = source("lib/founder-regeneration.ts");
  const transition = functionBody(regeneration, "transitionFloorRegeneration");
  for (const state of ["VALID", "NEEDS_REGENERATION", "REPLACEMENT_REQUIRED", "REGENERATED", "READY_FOR_REVIEW"]) {
    assert.match(state === "VALID" ? regeneration : domain, new RegExp(state));
  }
  assert.match(transition, /NEEDS_REGENERATION: "REPLACEMENT_REQUIRED"/);
  assert.match(transition, /REPLACEMENT_REQUIRED: "REGENERATED"/);
  assert.match(transition, /REGENERATED: "READY_FOR_REVIEW"/);
  assert.match(transition, /replacementFor/);
  assert.match(transition, /regenerationResolutions\.unshift/);
  assert.match(transition, /actorUserId|actorDisplayName|reason|sourceVersionId|dependencyLinks|idempotencyKey|occurredAt/);
  assert.match(transition, /expectedRecordVersion/);
  assert.match(transition, /recordVersion.*\+ 1/);
});

test("replacement validation rejects foreign floor, stale lineage and self-clearing", () => {
  const body = functionBody(source("lib/founder-regeneration.ts"), "replacementFor");
  assert.match(body, /replacementId === invalidation\.targetId/);
  assert.match(body, /item\.floorId === invalidation\.floorId/);
  assert.match(body, /item\.planVersionId === currentPlan\.id/);
  assert.match(body, /item\.orientationVersionId === currentOrientation\.id/);
  assert.match(body, /item\.caseId === invalidation\.caseId/);
  assert.match(body, /item\.projectId === invalidation\.projectId/);
  assert.match(body, /methodologyVersionId/);
  assert.match(body, /uchit-verdict\/v3/);
  assert.match(body, /404/);
});

test("plan, evidence, orientation, mapping and methodology changes append exact floor invalidations", () => {
  const spatial = source("lib/spatial-workflow.ts");
  const methodology = source("lib/methodology-registry.ts");
  const append = functionBody(source("lib/founder-regeneration.ts"), "appendFloorInvalidations");
  for (const cause of ["PLAN", "EVIDENCE", "ORIENTATION", "MAPPING"]) assert.match(spatial, new RegExp(`causeType: "${cause}"`));
  assert.match(methodology, /causeType: "METHODOLOGY"/);
  for (const target of ["OPENING_MAPPING", "SPACE_MAPPING", "UTILITY_EVALUATION", "SHAKTI_EVALUATION", "FINDING", "DRAFT_REPORT"]) assert.match(append, new RegExp(`"${target}"`));
  assert.match(append, /item\.floorId === input\.floorId/);
  assert.match(append, /sourceVersionId/);
  assert.match(append, /status: "NEEDS_REGENERATION"/);
});

test("Stage A readiness is one-floor v3 and fails closed on every approved blocker class", () => {
  const blockers = functionBody(source("lib/founder-regeneration.ts"), "getStageAFloorReviewBlockers");
  assert.match(blockers, /uchit-verdict\/v3/);
  assert.match(blockers, /status === "CURRENT"/);
  assert.match(blockers, /HAND_MARKED_PLAN/);
  assert.match(blockers, /fullColour/);
  assert.match(blockers, /status === "LOCKED"/);
  assert.match(blockers, /MAIN_ENTRANCE/);
  assert.match(blockers, /REVIEW_REQUIRED/);
  assert.match(blockers, /BLOCKED_METHOD_INPUT/);
  assert.match(blockers, /NEEDS_REGENERATION/);
  assert.match(blockers, /methodologyVersionId/);
  assert.match(blockers, /UTILITY|Utility/);
  assert.match(blockers, /Shakti/);
  assert.match(blockers, /assessmentObservations/);
  assert.match(blockers, /recommendations/);
  assert.match(blockers, /openRegenerationStatuses/);
  assert.match(blockers, /DIRECTION_32|DIRECTION 32/);
  assert.match(blockers, /SITE_ENVIRONMENT|SITE ENVIRONMENT/);
});

test("immutable review snapshot and checkpoints bind exact lineage without rewriting report bytes", () => {
  const domain = source("lib/domain.ts");
  const binding = functionBody(source("lib/founder-regeneration.ts"), "reviewBinding");
  const checkpoint = functionBody(source("lib/founder-regeneration.ts"), "recordStageAFloorCheckpoint");
  for (const field of ["organisationId", "projectId", "caseId", "floorId", "reportId", "reportVersion", "planVersionId", "evidenceVersionIds", "orientationVersionId", "mappingVersionIds", "evaluationVersionIds", "methodologyVersionIds", "snapshotHash", "reportArtifactHash", "reviewerActorUserId"]) assert.match(domain, new RegExp(field));
  assert.match(binding, /artifact.*planVersionId/);
  assert.match(binding, /artifact.*orientationVersionId/);
  assert.match(binding, /methodologyVersionIds/);
  assert.match(checkpoint, /deterministicContentHash\(binding\)/);
  assert.match(checkpoint, /stageAFloorReviews\.unshift/);
  assert.match(checkpoint, /stageAFloorApprovalCheckpoints\.unshift/);
  assert.match(checkpoint, /FOUNDER_REVIEWED/);
  assert.match(checkpoint, /FOUNDER_APPROVED/);
  assert.match(checkpoint, /RELEASED/);
  assert.doesNotMatch(checkpoint, /artifact\.contentHash\s*=/);
});

test("Founder checkpoint integration preserves payment gates and partial floor release aggregation", () => {
  const workflow = source("lib/workflow-service.ts");
  const approve = functionBody(workflow, "approveReport");
  const release = functionBody(workflow, "releaseVerdict");
  assert.match(approve, /balanceApproved|fullPaymentApproved/);
  assert.match(approve, /recordStageAFloorCheckpoint/);
  assert.match(approve, /FOUNDER_REVIEWED|FOUNDER_APPROVED/);
  assert.match(release, /recordStageAFloorCheckpoint/);
  assert.match(release, /allFloorsReleased/);
  assert.match(release, /REPORT_APPROVAL_PENDING/);
  assert.match(release, /stageAFloorApprovalCheckpoints/);
  assert.doesNotMatch(release, /client.*delivery.*enabled/i);
});

test("protected action requires Founder ownership, exact scope and dual concurrency", () => {
  const route = source("app/api/actions/route.ts");
  const scope = source("lib/organisation-scope.ts");
  const action = switchCaseBody(route, "regeneration-transition");
  assert.match(route, /"regeneration-transition"[\s\S]*"invalidationId"[\s\S]*"expectedRecordVersion"[\s\S]*"expectedRevision"/);
  assert.match(action, /SUPER_ADMIN/);
  assert.match(action, /organisation_owner/);
  assert.match(action, /transitionFloorRegeneration/);
  assert.match(scope, /"invalidationId"/);
  assert.match(route, /status: 428/);
  assert.match(route, /globalRevisionStale/);
  assert.match(route, /rollbackState/);
});

test("Founder UI exposes separate per-floor queues and no merged report control", () => {
  const projection = functionBody(source("lib/founder-regeneration.ts"), "projectFounderFloorQueues");
  const ui = source("components/spatial-workspace.tsx");
  for (const queue of ["NEEDS_REGENERATION", "REVIEW_REQUIRED", "BLOCKED_METHOD_INPUT", "MISSING_EVIDENCE", "PENDING_FOUNDER_VERIFICATION", "READY_FOR_APPROVAL", "RELEASED"]) assert.match(projection, new RegExp(queue));
  assert.match(projection, /floorId: floor\.id/);
  assert.match(projection, /nextAction/);
  assert.match(projection, /blockerReason/);
  assert.match(ui, /Founder floor queues/);
  assert.match(ui, /Resolve one floor without changing another/);
  assert.match(ui, /regeneration-transition/);
  assert.match(ui, /aria-live="polite"/);
  assert.doesNotMatch(ui, /merge floor reports|merged floor report/i);
});
