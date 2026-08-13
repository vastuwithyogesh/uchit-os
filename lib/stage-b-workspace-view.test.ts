import assert from "node:assert/strict";
import test from "node:test";
import { eligibleRemediesForPage, implementationRowsForPage, livePagePlacements, STAGE_B_WORKSPACE_PAGES } from "./stage-b-workspace-view.ts";

test("workspace exposes the five approved remedy pages in immutable report order", () => {
  assert.deepEqual(STAGE_B_WORKSPACE_PAGES.map((page) => [page.pageType, page.ordinal]), [
    ["DISHA_BALANCER", 8], ["DISHA_ACTIVATION", 10], ["TATTAV_BALANCER", 12], ["TATTAV_ACTIVATION", 14], ["EQUALISER", 16]
  ]);
  assert.equal(STAGE_B_WORKSPACE_PAGES.find((page) => page.pageType === "TATTAV_BALANCER")?.sourceFraming, "Tattva Balancer");
  assert.equal(STAGE_B_WORKSPACE_PAGES.find((page) => page.pageType === "TATTAV_ACTIVATION")?.sourceFraming, "Tattva Activation");
});

test("active-page selectors exclude tombstones and never leak page or remedy types", () => {
  const placements = [
    { id: "p-1", remediationId: "r-1", pageId: "page-db", state: "LOCKED", masterNumber: 1 },
    { id: "p-deleted", remediationId: "r-1", pageId: "page-db", state: "DELETED", masterNumber: 2 },
    { id: "p-3", remediationId: "r-1", pageId: "page-da", state: "LOCKED", masterNumber: 2 },
    { id: "p-other-floor", remediationId: "r-2", pageId: "page-db", state: "LOCKED", masterNumber: 99 }
  ] as any;
  assert.deepEqual(livePagePlacements(placements, "r-1", "page-db").map((item) => item.id), ["p-1"]);
  const resolutions = [
    { id: "e-db", remediationId: "r-1", status: "ELIGIBLE", remedialType: "DISHA_BALANCER", remedyId: "remedy-db" },
    { id: "e-da", remediationId: "r-1", status: "ELIGIBLE", remedialType: "DISHA_ACTIVATION", remedyId: "remedy-da" }
  ] as any;
  const remedies = [
    { id: "remedy-db", status: "APPROVED", remedialType: "DISHA_BALANCER" },
    { id: "remedy-da", status: "APPROVED", remedialType: "DISHA_ACTIVATION" }
  ] as any;
  assert.deepEqual(eligibleRemediesForPage(resolutions, remedies, "r-1", "DISHA_BALANCER").map((item) => item.resolution.id), ["e-db"]);
});

test("implementation projection is page-scoped and ignores deleted placements", () => {
  const placements = [
    { id: "p-1", remediationId: "r-1", pageId: "page-tb", state: "LOCKED" },
    { id: "p-deleted", remediationId: "r-1", pageId: "page-tb", state: "DELETED" },
    { id: "p-other", remediationId: "r-1", pageId: "page-eq", state: "LOCKED" }
  ] as any;
  const rows = [
    { id: "row-1", remediationId: "r-1", pageId: "page-tb", placementId: "p-1", masterNumber: 4 },
    { id: "row-deleted", remediationId: "r-1", pageId: "page-tb", placementId: "p-deleted", masterNumber: 5 },
    { id: "row-other", remediationId: "r-1", pageId: "page-eq", placementId: "p-other", masterNumber: 5 }
  ] as any;
  assert.deepEqual(implementationRowsForPage(rows, placements, "r-1", "page-tb").map((row) => row.id), ["row-1"]);
});
