import test from "node:test";
import assert from "node:assert/strict";
import { source, functionBody } from "./helpers/source-contracts.mjs";

test("plan and spatial evidence writes are protected, scoped, concurrent and idempotent", () => {
  const route = source("app/api/actions/route.ts");
  const spatial = source("lib/spatial-workflow.ts");
  for (const action of ["plan-version-create", "spatial-evidence-create", "orientation-version-lock"]) {
    assert.match(route, new RegExp(`"${action}"`));
  }
  assert.match(route, /canEditFloorWorkspaces/);
  assert.match(route, /expectedRecordVersion/);
  assert.match(route, /expectedRevision/);
  assert.match(spatial, /getActiveCaseForClient/);
  assert.match(spatial, /assertCaseFileEvidenceScope/);
  assert.match(spatial, /organisationId/);
  assert.match(spatial, /idempotencyKey/);
});

test("each floor has one current immutable plan version and full-colour marked evidence", () => {
  const spatial = source("lib/spatial-workflow.ts");
  const plan = functionBody(spatial, "createPlanVersion");
  const evidence = functionBody(spatial, "createSpatialEvidenceVersion");
  assert.match(plan, /item\.floorId === floor!\.id && item\.status === "CURRENT"/);
  assert.match(plan, /current\.status = "SUPERSEDED"/);
  assert.match(plan, /floor!\.status = "NEEDS_REGENERATION"/);
  assert.match(plan, /floor!\.locked = true/);
  assert.doesNotMatch(plan, /floor!\.locked = false/);
  assert.match(evidence, /HAND_MARKED_PLAN/);
  assert.match(evidence, /input\.fullColourConfirmed !== true/);
  assert.match(evidence, /plan\.status !== "CURRENT"/);
  assert.match(evidence, /fullColour: true/);
});

test("orientation requires exact numeric degree and current Google Earth evidence", () => {
  const body = functionBody(source("lib/spatial-workflow.ts"), "lockExactOrientation");
  assert.match(body, /Number\.isFinite\(exactDegree\)/);
  assert.match(body, /exactDegree < 0 \|\| exactDegree >= 360/);
  assert.match(body, /GOOGLE_EARTH_ORIENTATION/);
  assert.match(body, /item\.status === "CURRENT" && item\.fullColour/);
  assert.match(body, /reason\.length < 20/);
  assert.match(body, /lockedByActorUserId: input\.actor\.id/);
  assert.doesNotMatch(body, /NNE|SSW|sector|boundary/i);
});

test("orientation change preserves the prior version and records regeneration dependencies", () => {
  const spatial = source("lib/spatial-workflow.ts");
  const lock = functionBody(spatial, "lockExactOrientation");
  const invalidations = functionBody(source("lib/founder-regeneration.ts"), "appendFloorInvalidations");
  assert.match(lock, /previous\.status = "SUPERSEDED"/);
  assert.match(lock, /appendFloorInvalidations/);
  for (const target of ["OPENING_MAPPING", "SPACE_MAPPING", "UTILITY_EVALUATION", "SHAKTI_EVALUATION", "FINDING", "DRAFT_REPORT"]) {
    assert.match(invalidations, new RegExp(`"${target}"`));
  }
  assert.match(invalidations, /status: "NEEDS_REGENERATION"/);
});

test("legacy unversioned orientation endpoint fails closed", () => {
  const route = source("app/api/actions/route.ts");
  assert.match(route, /case "orientation-lock":[\s\S]*versioned orientation lock with exact degree and immutable Google Earth evidence/);
});

test("32D opening markers fail closed across floor, plan, orientation and evidence scope", () => {
  const spatial = source("lib/spatial-workflow.ts");
  const references = functionBody(spatial, "currentSpatialReferences");
  const opening = functionBody(spatial, "createOpeningMapping");
  assert.match(references, /item\.floorId === floor!\.id && item\.status === "CURRENT"/);
  assert.match(references, /item\.status === "LOCKED"/);
  assert.match(references, /item\.kind === "HAND_MARKED_PLAN"/);
  assert.match(opening, /normalizedCoordinate/);
  assert.match(opening, /input\.verified !== true/);
  assert.match(opening, /kind === "MAIN_ENTRANCE"/);
  assert.match(opening, /methodologyStatus: "BLOCKED_METHOD_INPUT"/);
  assert.doesNotMatch(opening, /directionCode:/);
});

test("16D spaces are verified bounded polygons tied to one floor plan", () => {
  const space = functionBody(source("lib/spatial-workflow.ts"), "createSpaceMapping");
  assert.match(space, /input\.polygon\.length < 3/);
  assert.match(space, /Object\.keys\(point\)/);
  assert.match(space, /normalizedCoordinate/);
  assert.match(space, /input\.verified !== true/);
  assert.match(space, /methodologyStatus: "BLOCKED_METHOD_INPUT"/);
});

test("evaluation gate requires project, current plans, marked evidence, locked orientation and main entrances", () => {
  const blockers = functionBody(source("lib/service-framework.ts"), "getCaseEvaluationBlockers");
  assert.match(blockers, /Create the project and link every floor/);
  assert.match(blockers, /Lock an exact orientation version using current Google Earth evidence/);
  assert.match(blockers, /Add a current plan version/);
  assert.match(blockers, /full-colour hand-marked evidence/);
  assert.match(blockers, /Verify the main entrance/);
  assert.match(blockers, /dependencyInvalidations/);
});
