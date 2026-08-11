import test from "node:test";
import assert from "node:assert/strict";
import { source, functionBody } from "./helpers/source-contracts.mjs";

test("spatial evidence stores separate versioned Founder confirmations", () => {
  const domain = source("lib/domain.ts");
  const spatial = source("lib/spatial-workflow.ts");
  assert.match(domain, /classification\?: "STANDARD" \| "MARKED_32D_CHAKRA_V1" \| "MARKED_16D_MAPPING_V1"/);
  assert.match(domain, /has32SectorChakra\?: boolean/);
  assert.match(domain, /has16DirectionMapping\?: boolean/);
  const create = functionBody(spatial, "createSpatialEvidenceVersion");
  for (const value of ["MARKED_32D_CHAKRA_V1", "MARKED_16D_MAPPING_V1"]) assert.match(create, new RegExp(value));
  assert.match(create, /founderCanConfirmEvidence/);
  assert.match(create, /input\.has32SectorChakra !== true/);
  assert.match(create, /input\.has16DirectionMapping !== true/);
  assert.match(create, /item\.classification === classification/);
});

test("32D and 16D evidence are exact floor/plan scoped and readiness blockers", () => {
  const spatial = source("lib/spatial-workflow.ts");
  const refs = functionBody(spatial, "currentSpatialReferences");
  assert.match(refs, /item\.floorId === floor!\.id/);
  assert.match(refs, /item\.planVersionId === plan\.id/);
  assert.match(refs, /classification === "MARKED_32D_CHAKRA_V1"/);
  assert.match(refs, /has32SectorChakra === true/);
  const serviceBlockers = functionBody(source("lib/service-framework.ts"), "getCaseEvaluationBlockers");
  assert.match(serviceBlockers, /Founder-confirmed 32-sector chakra evidence/);
  assert.match(serviceBlockers, /Founder-confirmed 16-direction marked mapping/);
});

test("Founder UI requires both confirmations and keeps computed 16D deferred", () => {
  const ui = source("components/spatial-workspace.tsx");
  assert.match(ui, /has-32-sector-chakra/);
  assert.match(ui, /has-16-direction-mapping/);
  assert.match(ui, /MARKED_32D_CHAKRA_V1/);
  assert.match(ui, /MARKED_16D_MAPPING_V1/);
  assert.match(ui, /Computed 16D mapping is deferred/);
  assert.doesNotMatch(ui, /run\("space-mapping-create"/);
});

test("API allowlist and Stage A binding include the new evidence metadata", () => {
  const route = source("app/api/actions/route.ts");
  const regen = source("lib/founder-regeneration.ts");
  assert.match(route, /"classification"/);
  assert.match(route, /"has32SectorChakra"/);
  assert.match(route, /"has16DirectionMapping"/);
  assert.match(regen, /marked32DEvidenceId/);
  assert.match(regen, /marked16DEvidenceId/);
  assert.match(regen, /evidenceVersionIds/);
});
