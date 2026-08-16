import test from "node:test";
import assert from "node:assert/strict";
import { source, functionBody } from "./helpers/source-contracts.mjs";

function stepSixProjection() {
  const ui = source("components/spatial-workspace.tsx");
  const start = ui.indexOf('if (focus === "gridding")');
  const end = ui.indexOf("\n  return <section", start + 1);
  assert.ok(start > -1 && end > start, "dedicated Step 06 projection must precede the legacy spatial console");
  return ui.slice(start, end);
}

test("Step 06 exposes exactly three operator tasks and one universal navigation path", () => {
  const step = stepSixProjection();
  for (const label of ["Task 1 of 3", "Task 2 of 3", "Task 3 of 3", "Confirm 32-sector marked evidence", "Confirm 16-direction marked evidence", "Classify applicable entrance zones"]) assert.match(step, new RegExp(label));
  assert.doesNotMatch(step, /Step [2345](?:\s|·)/);
  assert.doesNotMatch(step, /Continue to evaluation readiness|href="\/founder\/continue"/);
  assert.match(step, /Details · deferred computed mapping/);
  assert.match(step, /does not infer geometry, sectors, or direction labels/);
});

test("both marked evidence tasks have direct protected upload and library selection", () => {
  const step = stepSixProjection();
  for (const id of ["marked-32-file", "marked-16-file"]) assert.match(step, new RegExp(`id="${id}" type="file"`));
  assert.equal((step.match(/Upload securely/g) ?? []).length, 2);
  assert.equal((step.match(/Choose from protected file library/g) ?? []).length, 2);
  assert.equal((step.match(/PDF, PNG, JPG or WebP · 1 byte to 20 MB/g) ?? []).length, 2);
  for (const state of ["SELECTED", "UPLOADING", "UPLOADED_NOT_RECORDED", "RECORDED", "FAILED"]) assert.match(source("components/spatial-workspace.tsx"), new RegExp(state));
  assert.match(source("components/spatial-workspace.tsx"), /Confirm replacement 32-sector evidence/);
  assert.match(source("components/spatial-workspace.tsx"), /Confirm replacement 16-direction evidence/);
});

test("same-file dual use is explicit, durable and server-enforced", () => {
  const ui = stepSixProjection();
  const domain = source("lib/domain.ts");
  const route = source("app/api/actions/route.ts");
  const service = functionBody(source("lib/spatial-workflow.ts"), "createSpatialEvidenceVersion");
  assert.match(ui, /dualPurposeMarkedLayersConfirmed/);
  assert.match(ui, /both distinct 32-sector and 16-direction marked layers/);
  assert.match(domain, /dualPurposeMarkedLayersConfirmed\?: boolean/);
  assert.match(route, /"dualPurposeMarkedLayersConfirmed"/);
  assert.match(service, /sameFileOppositeEvidence/);
  assert.match(service, /input\.dualPurposeMarkedLayersConfirmed !== true/);
  assert.match(service, /assertCaseFileEvidenceScope/);
  assert.match(service, /idempotency key is already used for a different evidence version/);
});

test("entrance task uses two canonical zone selectors and keeps legacy markers read-only", () => {
  const step = stepSixProjection();
  for (const value of ["Property main gate zone", "Floor gate / primary floor entrance zone", "property-main-gate-zone", "floor-gate-zone", "Confirm entrance zones"]) assert.match(step, new RegExp(value.replace(/[\/]/g, "\\/")));
  assert.match(source("components/spatial-workspace.tsx"), /getApprovedEntranceZoneCatalog/);
  assert.match(source("components/spatial-workspace.tsx"), /Choose a property main gate or floor entrance zone/);
  assert.match(step, /Legacy percentage marker evidence/);
  assert.match(step, /not interpreted as entrance zones/);
  assert.match(step, /griddingComplete/);
  assert.match(step, /owner interpretation/);
  assert.match(step, /not approved client-facing presentation copy/);
  assert.match(step, /zone\.code} — {zone\.name/);
});

test("the superseded percentage-marker task is not rendered in focused Step 06", () => {
  assert.match(source("app/globals.css"), /spatial-step-six article\[aria-labelledby="task-entrance-title"\][^{]*\{[^}]*display:\s*none/);
});

test("the legacy percentage-marker API is fail-closed", () => {
  const route = source("app/api/actions/route.ts");
  assert.match(route, /Legacy percentage opening markers are read-only/);
  assert.match(route, /case "entrance-zones-confirm"/);
});

test("V1 Step 06 exposes the existing native D16 draft and finalize actions", () => {
  const ui = source("components/spatial-workspace.tsx");
  assert.match(ui, /Native D16 Floor Utility Mapping/);
  assert.match(ui, /\/api\/utility\/master/);
  assert.match(ui, /d16-mapping-draft-v1/);
  assert.match(ui, /d16-mapping-finalize-v1/);
  assert.match(ui, /utilitymaster-row-/);
  assert.match(ui, /d16UtilityZones/);
  assert.match(ui, /same-zone utilities remain independent|same-zone utilities/i);
  assert.match(ui, /Legacy Manual Utility Sheet, Shakti and marked-plan controls are not V1 gates/);
});
