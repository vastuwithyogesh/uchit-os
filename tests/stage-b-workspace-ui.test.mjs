import assert from "node:assert/strict";
import test from "node:test";
import { source } from "./helpers/source-contracts.mjs";

const workspace = source("components/stage-b-remedy-workspace.tsx");
const placementPrimitives = source("components/remediation-workspace-primitives.tsx");
const viewModel = source("lib/stage-b-workspace-view.ts");
const css = source("app/globals.css");

test("Founder step 13 renders one shared five-page Stage B workspace", () => {
  const step = source("components/founder-step-workspace.tsx");
  assert.match(step, /stepNumber === 13/); assert.match(step, /StageBRemedyWorkspace/);
  assert.equal((workspace.match(/export function StageBRemedyWorkspace\(/g) ?? []).length, 1);
  for (const label of ["Disha Balancer", "Disha Activation", "Tattav Balancer", "Tattav Activation", "Equaliser"]) assert.match(viewModel, new RegExp(label));
  assert.match(workspace, /STAGE_B_WORKSPACE_PAGES\.map/); assert.match(workspace, /aria-current=.*page/);
  assert.match(css, /stage-b-page-nav\{display:grid/);
});

test("workspace uses only frozen Stage B actions and exact concurrency", () => {
  for (const action of ["stage-b-remediation-initialise", "stage-b-final-layout-select", "stage-b-remedy-resolve", "stage-b-remedy-placement-upsert", "stage-b-remedy-placement-delete", "stage-b-page-finalise"]) assert.match(workspace, new RegExp(`"${action}"`));
  assert.match(workspace, /expectedRecordVersion/); assert.match(workspace, /expectedRevision/); assert.match(workspace, /actionKeys\.current\[name\] \?\?= crypto\.randomUUID/); assert.match(workspace, /idempotencyKey: actionKeys\.current\[name\]/);
  assert.doesNotMatch(workspace, /fetch\([^)]*(?:external|repository admin)/i);
});

test("consultant choice is required before a Stage-B remedy can be placed", () => {
  assert.doesNotMatch(workspace, /eligible\[0\]/);
  assert.match(workspace, /const selected = eligible\.find\(\(item\) => item\.resolution\.id === selectedResolutionId\) \?\? eligible\.find\(\(item\) => item\.resolution\.id === activePlacement\?\.eligibilityResolutionId\)/);
  assert.match(workspace, /setSelectedResolutionId\(first\?\.eligibilityResolutionId \?\? ""\)/);
  assert.match(workspace, /Click the exact placement point/);
});

test("active page binds eligibility, verdict and placements without cross-page leakage", () => {
  assert.match(workspace, /eligibleRemediesForPage\(state\.remedyEligibilityResolutions, state\.remedyRepositoryRecords, remediation\.id, activeConfiguration\.pageType\)/);
  assert.match(workspace, /item\.solutionFraming === activeConfiguration\.sourceFraming/); assert.match(workspace, /remedialType: activeConfiguration\.pageType/);
  assert.match(workspace, /const eligibilitySource = verdict \?\? v1StageBInput/); assert.match(workspace, /disabled=\{!eligibilitySource/);
  assert.match(workspace, /livePagePlacements\(state\.physicalPlacements, remediation\.id, page\.id\)/);
  assert.match(viewModel, /resolution\.remedialType === pageType/); assert.match(viewModel, /item\.remedialType === pageType/);
  assert.match(viewModel, /TATTAV_BALANCER[\s\S]*Tattva Balancer/); assert.match(viewModel, /TATTAV_ACTIVATION[\s\S]*Tattva Activation/);
});

test("deleted tombstones are filtered from every UI projection", () => {
  assert.match(viewModel, /placement\.state !== "DELETED"/); assert.match(workspace, /page\.placements\.filter\(\(placement\) => placement\.state !== "DELETED"\)/);
  assert.match(workspace, /manifest\.appendixRows\.filter\(\(row\) => liveIds\.has\(row\.placementId\)\)/); assert.match(workspace, /implementationRowsForPage/);
  assert.doesNotMatch(workspace, /physicalPlacements\.find\([^\n]*pageId/);
});

test("server numbering is displayed and deletion refreshes authoritative state", () => {
  assert.match(workspace, /placement\.masterNumber/); assert.match(workspace, /Master No\. \{activePlacement\.masterNumber/); assert.match(placementPrimitives, /Master No\.<\/th>/);
  assert.match(workspace, /numbers\.join\(", "\)/); assert.match(workspace, /row\.masterNumber/);
  assert.match(workspace, /window\.confirm/); assert.match(workspace, /stage-b-remedy-placement-delete/); assert.match(workspace, /await refresh\(\)/); assert.match(workspace, /Server numbering refreshed/);
});

test("page switching preserves server state and only autosaves an active canvas draft", () => {
  assert.match(workspace, /async function switchPage/); assert.match(workspace, /if \(dirty && !\(await savePlacement\(true\)\)\) return/); assert.match(workspace, /setInternalPageType\(pageType\)/);
  assert.doesNotMatch(workspace, /setState\([^)]*physicalPlacements/); assert.match(workspace, /setActivePlacementId\(first\?\.id \?\? ""\)/);
});

test("all pages retain the approved placement editor behavior and recovery states", () => {
  for (const label of ["Clean View", "Report Preview", "Implementation Sheet", "Load eligible remedies", "Refresh eligible remedies", "Swap remedy", "Move Placement Point", "Delete draft", "Zoom +", "Zoom −", "Fit", "Grid", "Save & lock"]) assert.match(workspace, new RegExp(label));
  for (const state of ["Loading remedy workspace", "could not be loaded", "Retry loading", "access is restricted", "Stage B is not ready", "No revised-layout candidate", "No standard remedies available for this section", "Workspace changed", "Reload latest"]) assert.match(workspace, new RegExp(state, "i"));
  assert.match(workspace, /automaticCallout/); assert.match(placementPrimitives, /collisionSafeBox/); assert.match(placementPrimitives, /pointFromRect/); assert.match(workspace, /URL\.createObjectURL/); assert.match(workspace, /mimeType === "application\/pdf"/);
  assert.match(workspace, /tabIndex=\{0\}/); assert.match(placementPrimitives, /event\.key === "ArrowLeft"/); assert.match(workspace, /role="status"/); assert.match(css, /print-sheet\.is-awaiting-placement/);
});

test("real base-layout rendering is required before placement", () => {
  assert.match(workspace, /const \[layoutStatus, setLayoutStatus\]/);
  assert.match(workspace, /layoutStatus !== "ready"/);
  assert.match(workspace, /Final Revised Layout could not be loaded\. Placement is unavailable\./);
  assert.match(workspace, /visualFixture \? <div className="stage-b-layout-fallback"/);
  assert.match(workspace, /URL\.createObjectURL/);
  assert.match(workspace, /Final Revised Layout loaded\. Physical placement is bound to the real layout bounds\./);
});

test("Focus mode fades completed work and restores controls after save", () => {
  assert.match(workspace, /const focusMode = Boolean\(awaitingPlacement \|\| dirty \|\| tool === "move-callout"\)/); assert.match(workspace, /prior: focusMode/); assert.match(placementPrimitives, /Completed · locked/);
  assert.match(workspace, /setDirty\(false\); setAwaitingPlacement\(false\); setTool\("select"\)/); assert.doesNotMatch(workspace, />Focus Mode<\/button>/);
  assert.match(css, /stage-b-placement-layer\.is-prior\{opacity:\.42/); assert.match(css, /stage-b-placement-layer\.is-prior .*pointer-events:none/);
});

test("zero-result and zero-placement finalisation remain valid UI paths", () => {
  assert.match(workspace, /No standard remedies available for this section/); assert.match(workspace, /disabled=\{page\?\.state === "FINALISED" \|\| busy\}/);
  assert.doesNotMatch(workspace, /disabled=\{!placement[^}]*Finalise/); assert.doesNotMatch(workspace, /if \(!placement\).*finalise/);
  assert.match(workspace, /same Final Revised Layout/); assert.match(workspace, /Base \{baseLayout\.state === "LOCKED"/);
});

test("implementation sheet is page-scoped and client completion fields are blank only", () => {
  assert.match(workspace, /implementationRowsForPage/); assert.match(placementPrimitives, /Master No\./); assert.match(placementPrimitives, /Item\/Remedy Name/); assert.match(placementPrimitives, /Purpose\/Attribute/); assert.match(placementPrimitives, /Location Reference/);
  assert.match(placementPrimitives, /Implemented/); assert.match(placementPrimitives, /Alternative Needed/); assert.match(placementPrimitives, /blank client-facing fields/);
  assert.doesNotMatch(placementPrimitives, /setImplemented|setImplementationDate|setAlternativeNeeded/); assert.doesNotMatch(placementPrimitives, />Zone<\/th>/);
});

test("Report Preview uses the backend multi-page v5 manifest in approved order", () => {
  assert.match(workspace, /finalReport\.artifact\.stageBRenderManifest/); assert.match(workspace, /manifest\.pages\.map/); assert.match(workspace, /Backend v5 render manifest/); assert.match(workspace, /Master Appendix/);
  assert.doesNotMatch(workspace, /pages:\s*STAGE_B_WORKSPACE_PAGES\.map/); assert.match(workspace, /result\.manifest/);
});

test("remedy search and Upload Remedy remain shared across all page configurations", () => {
  assert.match(workspace, /type="search"/); assert.match(workspace, /filteredEligible\.map/); assert.match(workspace, /\+ Upload Remedy/); assert.match(workspace, /One-Time Use — This Case/); assert.match(workspace, /Permanent Scope/);
  assert.match(css, /stage-b-upload-button\{position:sticky/);
});

test("workspace excludes deferred feature families and keeps the approved responsive shell", () => {
  assert.doesNotMatch(workspace, /Furniture Add-ons|Appliances|Colour Frames|Extras|Repository Admin|Image Utility|WhatsApp|email/i);
  assert.match(css, /@media\(max-width:900px\).*stage-b-page-nav/); assert.match(css, /@media\(max-width:560px\).*stage-b-page-nav/); assert.match(css, /scroll-snap-type:x proximity/);
});
