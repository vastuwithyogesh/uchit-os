import type {
  CaseUsedRemedyRecord, PhysicalPlacementRecord, PlacementImplementationRowRecord, RemedyEligibilityResolutionRecord,
  RemedyRepositoryRecord, StageBRemedyType
} from "./domain.ts";

export const STAGE_B_WORKSPACE_PAGES = [
  { pageType: "DISHA_BALANCER", ordinal: 8, label: "Disha Balancer", sourceFraming: "Disha Balancer", shortLabel: "DB" },
  { pageType: "DISHA_ACTIVATION", ordinal: 10, label: "Disha Activation", sourceFraming: "Disha Activation", shortLabel: "DA" },
  { pageType: "TATTAV_BALANCER", ordinal: 12, label: "Tattav Balancer", sourceFraming: "Tattva Balancer", shortLabel: "TB" },
  { pageType: "TATTAV_ACTIVATION", ordinal: 14, label: "Tattav Activation", sourceFraming: "Tattva Activation", shortLabel: "TA" },
  { pageType: "EQUALISER", ordinal: 16, label: "Equaliser", sourceFraming: "Equaliser", shortLabel: "EQ" }
] as const satisfies ReadonlyArray<{ pageType: StageBRemedyType; ordinal: number; label: string; sourceFraming: string; shortLabel: string }>;

export type StageBWorkspacePage = (typeof STAGE_B_WORKSPACE_PAGES)[number];

export function liveRemediationPlacements(placements: readonly PhysicalPlacementRecord[], remediationId: string) {
  return placements.filter((placement) => placement.remediationId === remediationId && placement.state !== "DELETED");
}

export function livePagePlacements(placements: readonly PhysicalPlacementRecord[], remediationId: string, pageId: string) {
  return liveRemediationPlacements(placements, remediationId).filter((placement) => placement.pageId === pageId)
    .sort((left, right) => (left.masterNumber ?? Number.MAX_SAFE_INTEGER) - (right.masterNumber ?? Number.MAX_SAFE_INTEGER) || left.id.localeCompare(right.id));
}

export function eligibleRemediesForPage(
  resolutions: readonly RemedyEligibilityResolutionRecord[],
  remedies: readonly RemedyRepositoryRecord[],
  remediationId: string,
  pageType: StageBRemedyType
) {
  return resolutions.filter((resolution) => resolution.remediationId === remediationId && resolution.status === "ELIGIBLE" && resolution.remedialType === pageType)
    .flatMap((resolution) => {
      const remedy = remedies.find((item) => item.id === resolution.remedyId && item.status === "APPROVED" && item.remedialType === pageType);
      return remedy ? [{ resolution, remedy }] : [];
    });
}

export function eligibleCaseUsedRemediesForPage(
  resolutions: readonly RemedyEligibilityResolutionRecord[],
  remedies: readonly CaseUsedRemedyRecord[],
  remediationId: string,
  pageId: string,
  pageType: StageBRemedyType
) {
  return resolutions.filter((resolution) => resolution.remediationId === remediationId && resolution.status === "ELIGIBLE" && resolution.remedialType === pageType)
    .flatMap((resolution) => {
      const remedy = remedies.find((item) => item.id === resolution.remedyId && item.remediationId === remediationId && item.pageId === pageId
        && item.status === "ACTIVE" && item.remedialType === pageType && (item.recordVersion ?? 0) === resolution.remedyRecordVersion);
      return remedy ? [{ resolution, remedy }] : [];
    });
}

export function implementationRowsForPage(
  rows: readonly PlacementImplementationRowRecord[],
  livePlacements: readonly PhysicalPlacementRecord[],
  remediationId: string,
  pageId: string
) {
  const placementIds = new Set(livePlacements.filter((placement) => placement.remediationId === remediationId && placement.pageId === pageId && placement.state !== "DELETED").map((placement) => placement.id));
  return rows.filter((row) => row.remediationId === remediationId && row.pageId === pageId && placementIds.has(row.placementId))
    .sort((left, right) => left.masterNumber - right.masterNumber || left.id.localeCompare(right.id));
}
