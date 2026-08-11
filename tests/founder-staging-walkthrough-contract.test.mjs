import test from "node:test";
import assert from "node:assert/strict";
import { buildFounderStagingDryRunPlan, FOUNDER_STAGING_BLOCKED_ACTIONS, FOUNDER_STAGING_RECOVERY_MATRIX, FOUNDER_STAGING_STEPS, FOUNDER_STAGING_UI_STATES } from "../lib/founder-staging-walkthrough.ts";
import { source } from "./helpers/source-contracts.mjs";

test("Founder walkthrough is ordered from advance through protected report and floor history", () => {
  assert.deepEqual(FOUNDER_STAGING_STEPS.map((step) => step.order), [...Array(FOUNDER_STAGING_STEPS.length)].map((_, index) => index + 1));
  assert.equal(FOUNDER_STAGING_STEPS[0].id, "advance-confirmation");
  assert.equal(FOUNDER_STAGING_STEPS.at(-1).id, "delivery-history");
  for (const step of FOUNDER_STAGING_STEPS) {
    assert.ok(step.route); assert.ok(step.component); assert.ok(step.actions.length); assert.ok(step.prerequisite); assert.ok(step.scope); assert.ok(step.gate);
    assert.deepEqual(step.uiStates, FOUNDER_STAGING_UI_STATES);
    assert.ok(step.manualChecks.length >= 2); assert.ok(step.blockedChecks.length >= 1);
  }
  assert.ok(FOUNDER_STAGING_STEPS.find((step) => step.id === "manual-gridding").blockedChecks.some((item) => /geometry|boundary|inference/i.test(item)));
  assert.ok(FOUNDER_STAGING_STEPS.find((step) => step.id === "approval-pdf").actions.some((item) => /pdf/i.test(item)));
});

test("dry-run plan is scope-bound, concurrency-aware, and side-effect free", () => {
  const plan = buildFounderStagingDryRunPlan({ organisationId: "org-synthetic", clientId: "client-synthetic", projectId: "project-synthetic", caseId: "case-synthetic", floorIds: ["floor-ground", "floor-first"], expectedRevision: 7, expectedRecordVersions: { "case-synthetic": 3, "floor-ground": 2, "floor-first": 2 } });
  assert.equal(plan.mode, "FOUNDER_STAGING_DRY_RUN");
  assert.equal(plan.writes, false); assert.equal(plan.externalWrites, false); assert.equal(plan.clientDeliveryEnabled, false);
  assert.deepEqual(plan.scope.floorIds, ["floor-ground", "floor-first"]);
  assert.deepEqual(plan.concurrency.expectedRecordVersions, { "case-synthetic": 3, "floor-ground": 2, "floor-first": 2 });
  assert.ok(plan.steps.some((step) => step.actions.includes("case-create")));
  assert.ok(plan.steps.some((step) => step.actions.includes("GET /api/reports/:reportId/pdf?mode=export|print")));
  assert.ok(plan.blockedActions.some((item) => /client portal/i.test(item)));
  assert.equal(plan.recoveryMatrix.length, FOUNDER_STAGING_RECOVERY_MATRIX.length);
});

test("safe and blocked route/action contracts remain visible in the implementation", () => {
  const route = source("app/api/actions/route.ts");
  const pdfRoute = source("app/api/reports/[reportId]/pdf/route.ts");
  const printRoute = source("app/api/reports/[reportId]/print/route.ts");
  const spatial = source("components/spatial-workspace.tsx");
  const site = source("components/site-analysis-console.tsx");
  const report = source("components/report-console.tsx");
  for (const action of ["advance-pay", "advance-proof-verify", "case-create", "client-intake-upsert", "floor-create", "plan-version-create", "spatial-evidence-create", "orientation-version-lock", "utility-evaluate", "utility-verdict", "shakti-rank", "stage-a-present", "site-analysis-upsert", "post-site-findings-upsert", "balance-pay", "balance-proof-verify", "report-approve", "verdict-release"]) assert.match(route, new RegExp(action));
  assert.match(spatial, /Upload protected plan/); assert.match(spatial, /exact degree/); assert.match(spatial, /Computed 16D geometry.*deferred/i);
  assert.match(site, /never reruns evaluation/i); assert.match(site, /Founder review/); assert.match(site, /Founder approve/);
  assert.match(report, /watermarked/i); assert.match(report, /stage-a-present/);
  assert.match(pdfRoute, /RELEASED|release/i); assert.match(pdfRoute, /no-store/i); assert.match(printRoute, /isPreview|preview/i);
  assert.ok(FOUNDER_STAGING_BLOCKED_ACTIONS.some((item) => /Stage B/i.test(item)));
});

test("recovery matrix covers every required operator failure class", () => {
  const text = FOUNDER_STAGING_RECOVERY_MATRIX.map((item) => item.condition).join(" | ");
  for (const expected of ["Missing required file", "stale", "Cross-floor", "Payment pending", "Founder review", "Methodology", "Needs Regeneration", "Unauthorised", "Durable storage"]) assert.match(text, new RegExp(expected, "i"));
  assert.ok(FOUNDER_STAGING_RECOVERY_MATRIX.every((item) => [400, 403, 404, 409, 428, 503].includes(item.expectedStatus) && item.operatorAction && item.stateImpact));
});
