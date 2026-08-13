import test from "node:test";
import assert from "node:assert/strict";
import { source } from "./helpers/source-contracts.mjs";

test("spatial workspace presents one plain sequential founder workflow", () => {
  const ui = source("components/spatial-workspace.tsx");
  for (const step of ["Current digital plan", "Original hand-marked evidence", "Google Earth evidence and exact orientation", "Entrances and windows", "Mapped spaces"]) assert.match(ui, new RegExp(step));
  assert.doesNotMatch(ui, /role="tab"|tablist|activeTab/);
  assert.match(ui, /exact permission-validated route/);
  assert.match(ui, /item\.floorId === floor\?\.id/);
  assert.match(ui, /Resolve one floor without changing another/i);
});

test("UI uses only protected uploads and canonical spatial actions", () => {
  const ui = source("components/spatial-workspace.tsx");
  assert.match(ui, /\/api\/case-files/);
  for (const action of ["plan-version-create", "spatial-evidence-create", "orientation-version-lock", "opening-mapping-create"]) assert.match(ui, new RegExp(`"${action}"`));
  assert.match(ui, /Computed 16D mapping is deferred/);
  assert.doesNotMatch(ui, /run\("space-mapping-create"/);
  assert.match(ui, /expectedRecordVersion/);
  assert.match(ui, /expectedRevision/);
  assert.match(ui, /idempotencyKey/);
  assert.match(ui, /Nothing was silently retried/);
});

test("mapping UI does not invent directions or methodology", () => {
  const ui = source("components/spatial-workspace.tsx");
  assert.match(ui, /methodology version is approved/);
  assert.doesNotMatch(ui, /directionCode|NNE|SSW|north-east|south-west/i);
});

test("legacy operations screen sends users to protected spatial setup", () => {
  const workflow = source("components/workflow-console.tsx");
  assert.match(workflow, /href="\/spatial"/);
  assert.doesNotMatch(workflow, /action: "orientation-lock"/);
  assert.doesNotMatch(workflow, /action: "floor-evidence-add"/);
});

test("spatial page is staff-protected and directly navigable", () => {
  const page = source("app/spatial/page.tsx");
  const access = source("lib/access-policy.ts");
  assert.match(page, /requirePageAccess\("CONSULTANT"\)/);
  assert.match(access, /href: "\/spatial", label: "Spatial Setup"/);
});
