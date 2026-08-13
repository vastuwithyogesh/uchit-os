import assert from "node:assert/strict";
import test from "node:test";
import { REMEDIATION_WORKSPACE_PAGES, visualWorkspacePage } from "./remediation-workspace-view.ts";

test("the shared remediation workspace exposes Section A then the frozen five-page Section B order", () => {
  assert.deepEqual(REMEDIATION_WORKSPACE_PAGES.map((page) => page.key), [
    "A:EXISTING_LAYOUT",
    "A:FINAL_REVISED_LAYOUT",
    "A:FURNITURE_ADDON",
    "A:FURNITURE_IMPLEMENTATION",
    "A:APPLIANCE",
    "A:APPLIANCE_IMPLEMENTATION",
    "A:COLOUR_FRAME",
    "B:DISHA_BALANCER",
    "B:DISHA_ACTIVATION",
    "B:TATTAV_BALANCER",
    "B:TATTAV_ACTIVATION",
    "B:EQUALISER"
  ]);
});

test("physical pages retain the approved report-wide numbering ordinals", () => {
  assert.deepEqual(
    REMEDIATION_WORKSPACE_PAGES.filter((page) => ["FURNITURE_ADDON", "APPLIANCE", "DISHA_BALANCER", "DISHA_ACTIVATION", "TATTAV_BALANCER", "TATTAV_ACTIVATION", "EQUALISER"].includes(page.pageType)).map((page) => page.ordinal),
    [3, 5, 8, 10, 12, 14, 16]
  );
});

test("visual scenarios select a real shared-workspace page without creating a second editor", () => {
  assert.equal(visualWorkspacePage("circle"), "A:EXISTING_LAYOUT");
  assert.equal(visualWorkspacePage("furniture-sheet"), "A:FURNITURE_IMPLEMENTATION");
  assert.equal(visualWorkspacePage("colour-rotate"), "A:COLOUR_FRAME");
  assert.equal(visualWorkspacePage("tattav-activation"), "B:TATTAV_ACTIVATION");
});
