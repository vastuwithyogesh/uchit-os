import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const parent = read("components/remediation-report-workspace.tsx");
const workspace = read("components/section-a-remediation-workspace.tsx");
const primitives = read("components/remediation-workspace-primitives.tsx");
const configuration = read("lib/remediation-workspace-view.ts");
const founder = read("components/founder-step-workspace.tsx");
const css = read("app/globals.css");

test("Founder step 13 opens one ordered remediation report workspace", () => {
  assert.match(founder, /stepNumber === 13[\s\S]*?RemediationReportWorkspace/);
  assert.equal((parent.match(/SectionARemediationWorkspace/g) ?? []).length >= 2, true);
  assert.equal((parent.match(/StageBRemedyWorkspace/g) ?? []).length >= 2, true);
});

test("navigation presents all seven Section A entries before all five frozen Remedy entries", () => {
  const keys = [...configuration.matchAll(/key: "([AB]:[A-Z_]+)"/g)].map((match) => match[1]);
  assert.deepEqual(keys, ["A:EXISTING_LAYOUT", "A:FINAL_REVISED_LAYOUT", "A:FURNITURE_ADDON", "A:FURNITURE_IMPLEMENTATION", "A:APPLIANCE", "A:APPLIANCE_IMPLEMENTATION", "A:COLOUR_FRAME", "B:DISHA_BALANCER", "B:DISHA_ACTIVATION", "B:TATTAV_BALANCER", "B:TATTAV_ACTIVATION", "B:EQUALISER"]);
  assert.match(parent, /aria-current=.*"page"/);
});

test("Existing Furniture Layout is server-derived and read-only except annotations", () => {
  assert.match(workspace, /authoritative Existing Layout will be resolved server-side from Stage A lineage/);
  assert.match(workspace, /Read-only source[^\n]+annotations only/);
  assert.match(workspace, /No CAD or main-furniture editing is available/);
});

test("Existing Layout exposes only the five approved annotation primitives", () => {
  assert.match(workspace, /\["CIRCLE", "ARROW", "HIGHLIGHT", "PEN", "TEXT"\]/);
  assert.doesNotMatch(workspace, /annotationTools[^\n]+RECTANGLE|annotationTools[^\n]+ERASER/);
});

test("annotation save and delete use the proven flat action channel", () => {
  assert.match(workspace, /action\("section-a-annotation-upsert"/);
  assert.match(workspace, /action\("section-a-annotation-delete"/);
  assert.match(workspace, /existingLayoutSnapshotId/);
});

test("Recommended Layout reuses existing Final Revised Layout selection behavior", () => {
  assert.match(workspace, /action\("stage-b-final-layout-select"/);
  assert.match(workspace, /Final Revised Layout selected\. Draft geometry is never remapped automatically/);
  assert.match(workspace, /baseLayout\?\.state === "LOCKED"/);
});

test("Furniture Add-ons bind only contextual FURNITURE_ADDON assets", () => {
  assert.match(workspace, /pageType\.startsWith\("FURNITURE"\) \? "FURNITURE_ADDON"/);
  assert.match(workspace, /sectionAssets\.filter\(\(item\) => item\.assetType === placementType\)/);
  assert.match(workspace, /placementType === "FURNITURE_ADDON" \? "FA"/);
});

test("Appliances bind only contextual APPLIANCE assets", () => {
  assert.match(workspace, /pageType\.startsWith\("APPLIANCE"\) \? "APPLIANCE"/);
  assert.match(workspace, /placementType === "APPLIANCE" \? "AP"/);
});

test("Furniture and Appliances reuse the exact shared placement layer", () => {
  assert.match(workspace, /<PlacementLayer/);
  assert.match(primitives, /automatic arrow|stage-b-arrow|markerEnd/);
  assert.match(primitives, /collisionSafeBox/);
  assert.match(primitives, /Locked placement point/);
});

test("shared placement interaction keeps normalized anchors and independently movable callouts", () => {
  assert.match(primitives, /anchor: \{ x: placement\.anchorX, y: placement\.anchorY \}/);
  assert.match(primitives, /onPointerMove/);
  assert.match(primitives, /Drag callout[^\n]+anchor fixed/);
  assert.match(primitives, /Use arrow keys to reposition/);
});

test("placement upsert and delete use approved Section A actions", () => {
  assert.match(workspace, /action\("section-a-placement-upsert"/);
  assert.match(workspace, /action\("section-a-placement-delete"/);
  assert.match(workspace, /completePlacement: true/);
});

test("add and delete refresh authoritative report-wide numbering including downstream Remedy pages", () => {
  assert.match(workspace, /await refresh\(\); setMessage\("Placement saved\. Authoritative report-wide/);
  assert.match(workspace, /await refresh\(\); setMessage\("Placement deleted\. Authoritative server numbering refreshed, including downstream Remedy pages/);
  assert.match(workspace, /Master No\. \{activePlacement\.masterNumber\}/);
  assert.doesNotMatch(workspace, /masterNumber:\s*(index|placements\.length)\s*\+\s*1/);
});

test("all Section A selectors preserve tombstones but exclude them from rendering", () => {
  assert.ok((workspace.match(/state !== "DELETED"/g) ?? []).length >= 4);
  assert.doesNotMatch(workspace, /filter\([^\n]+splice|physicalPlacements\.filter[^\n]+delete/);
});

test("implementation sheets are page-scoped one-row-per-live-placement projections", () => {
  assert.match(workspace, /placementImplementationRows\.filter\([^\n]+row\.pageId === physicalPage\.id/);
  assert.match(workspace, /placements\.some\(\(placement\) => placement\.id === row\.placementId\)/);
  assert.match(workspace, /<PlacementImplementationSheet/);
});

test("implementation client-completion fields stay blank and non-mutating", () => {
  assert.match(primitives, /Implemented blank field/);
  assert.match(primitives, /Date blank field/);
  assert.match(primitives, /Alternative Needed blank field/);
  assert.doesNotMatch(workspace, /setImplemented|setImplementationDate|setAlternativeNeeded/);
});

test("Colour Frame supplies every approved visual-only transform control", () => {
  for (const label of ["Width", "Height", "Preserve aspect ratio", "Rotate \\+90", "Reset", "Opacity", "Fit to printable boundary", "Lock composition"]) assert.match(workspace, new RegExp(label));
  assert.match(workspace, /onPointerDown=\{\(event\) => beginColourDrag/);
  assert.match(workspace, /\["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"\]/);
});

test("Colour Frames use canvas composition records and never PhysicalPlacement numbering", () => {
  assert.match(workspace, /action\("section-a-colour-frame-upsert"/);
  assert.match(workspace, /action\("section-a-colour-frame-delete"/);
  assert.match(workspace, /No anchor, callout, arrow, master number, row or appendix item/);
  assert.match(workspace, /Colour Frames are intentionally excluded/);
});

test("all UI mutations retain flat action CAS revision idempotency and conflict recovery", () => {
  assert.match(workspace, /fetch\("\/api\/actions", \{ method: "POST"/);
  assert.match(workspace, /action: name, \.\.\.fields, idempotencyKey/);
  assert.match(workspace, /expectedRecordVersion, expectedRevision: state\.persistenceRevision/);
  assert.match(workspace, /\[409, 428\]\.includes/);
});

test("workspace includes loading permission error exact-context and retry states", () => {
  assert.match(workspace, /Loading Section A workspace/);
  assert.match(workspace, /Section A access is restricted/);
  assert.match(workspace, /Section A could not be loaded/);
  assert.match(workspace, /Select an exact case and floor/);
  assert.ok((workspace.match(/Retry/g) ?? []).length >= 2);
});

test("Report Preview is backend-manifest truth in exact Section A then Section B order", () => {
  assert.match(workspace, /finalReport\?\.artifact\?\.sectionARenderManifest && finalReport\.artifact\.stageBRenderManifest/);
  assert.match(workspace, /<RemediationManifestPreview sectionA=/);
  const preview = workspace.slice(workspace.indexOf("function RemediationManifestPreview"), workspace.indexOf("export function SectionARemediationWorkspace"));
  assert.ok(preview.indexOf("sectionA.") < preview.indexOf("stageB.pages"));
  assert.match(preview, /section-a-render-manifest\/v1 \+ stage-b-render-manifest\/v1/);
});

test("shared workspace has accessible landmarks, keyboard controls and responsive navigation", () => {
  assert.match(parent, /aria-label="Remediation report pages"/);
  assert.match(workspace, /tabIndex=\{0\} role="application"/);
  assert.match(primitives, /onKeyDown/);
  assert.match(css, /@media\(max-width:650px\)[^}]+/);
  assert.match(css, /scroll-snap-type:x proximity/);
});

test("Section A UI does not introduce excluded feature families or external delivery", () => {
  assert.doesNotMatch(workspace, /Furniture Editor|CAD editor|Image Utility action|client delivery|external integration/i);
  assert.match(workspace, /Repository Administration and Image Utility remain out of scope/);
  assert.doesNotMatch(configuration, /EXTRAS|REPOSITORY_ADMIN|IMAGE_UTILITY/);
});
