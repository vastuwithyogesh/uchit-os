import type { AppUser, PhysicalPlacementRecord, ReportPlacementPageRecord } from "./domain.ts";
import type { AppState } from "./store.ts";

export const REPORT_WIDE_PLACEMENT_PAGES = [
  { section: "A", pageType: "FURNITURE_ADDON", placementType: "FURNITURE_ADDON", ordinal: 3 },
  { section: "A", pageType: "APPLIANCE", placementType: "APPLIANCE", ordinal: 5 },
  { section: "B", pageType: "DISHA_BALANCER", placementType: "REMEDY", ordinal: 8 },
  { section: "B", pageType: "DISHA_ACTIVATION", placementType: "REMEDY", ordinal: 10 },
  { section: "B", pageType: "TATTAV_BALANCER", placementType: "REMEDY", ordinal: 12 },
  { section: "B", pageType: "TATTAV_ACTIVATION", placementType: "REMEDY", ordinal: 14 },
  { section: "B", pageType: "EQUALISER", placementType: "REMEDY", ordinal: 16 }
] as const;

export function isReportWidePlacementPage(page: ReportPlacementPageRecord) {
  return REPORT_WIDE_PLACEMENT_PAGES.some((item) => item.section === page.section && item.pageType === page.pageType && item.ordinal === page.ordinal);
}

export function reportWidePlacementPages(state: AppState, remediationId: string) {
  return state.reportPlacementPages.filter((page) => page.remediationId === remediationId && isReportWidePlacementPage(page))
    .sort((a, b) => a.ordinal - b.ordinal || a.id.localeCompare(b.id));
}

export function liveReportPlacements(state: AppState, remediationId: string) {
  const pageIds = new Set(reportWidePlacementPages(state, remediationId).map((page) => page.id));
  return state.physicalPlacements.filter((placement) => placement.remediationId === remediationId && placement.state !== "DELETED" && pageIds.has(placement.pageId));
}

export function sortReportPlacements(state: AppState, remediationId: string, placements: PhysicalPlacementRecord[] = liveReportPlacements(state, remediationId)) {
  const ordinals = new Map(reportWidePlacementPages(state, remediationId).map((page) => [page.id, page.ordinal]));
  return [...placements].sort((a, b) => (ordinals.get(a.pageId) ?? Number.MAX_SAFE_INTEGER) - (ordinals.get(b.pageId) ?? Number.MAX_SAFE_INTEGER)
    || (a.masterNumber ?? Number.MAX_SAFE_INTEGER) - (b.masterNumber ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id));
}

export function resequenceReportPlacements(state: AppState, remediationId: string, actor: AppUser) {
  const placements = sortReportPlacements(state, remediationId);
  placements.forEach((placement, index) => {
    const masterNumber = index + 1;
    if (placement.masterNumber !== masterNumber) {
      placement.masterNumber = masterNumber; placement.updatedByActorUserId = actor.id; placement.recordVersion = (placement.recordVersion ?? 0) + 1;
    }
    const row = state.placementImplementationRows.find((item) => item.remediationId === remediationId && item.placementId === placement.id);
    if (row && row.masterNumber !== masterNumber) {
      row.masterNumber = masterNumber; row.updatedByActorUserId = actor.id; row.recordVersion = (row.recordVersion ?? 0) + 1;
    }
    const appendix = state.masterAppendixRows.find((item) => item.remediationId === remediationId && item.placementId === placement.id);
    if (appendix && appendix.masterNumber !== masterNumber) {
      appendix.masterNumber = masterNumber; appendix.updatedByActorUserId = actor.id; appendix.recordVersion = (appendix.recordVersion ?? 0) + 1;
    }
  });
  return placements;
}

export function reportWideMasterNumber(state: AppState, remediationId: string, placementId: string) {
  const index = sortReportPlacements(state, remediationId).findIndex((placement) => placement.id === placementId);
  return index < 0 ? undefined : index + 1;
}

export function completeRemediationReconciliation(input: {
  state: AppState; invalidationId: string; targetType: "STAGE_B_PLACEMENT" | "SECTION_A_PLACEMENT" | "COLOUR_FRAME_COMPOSITION"; targetId: string;
  sourceVersionId: string; replacementVersionId: string; actor: AppUser; reason: string;
}) {
  const invalidation = input.state.dependencyInvalidations.find((item) => item.id === input.invalidationId && item.targetType === input.targetType
    && item.targetId === input.targetId && item.status === "NEEDS_REGENERATION");
  if (!invalidation) return undefined;
  const transitions = [["NEEDS_REGENERATION", "REPLACEMENT_REQUIRED"], ["REPLACEMENT_REQUIRED", "REGENERATED"], ["REGENERATED", "READY_FOR_REVIEW"]] as const;
  for (const [fromStatus, toStatus] of transitions) {
    input.state.regenerationResolutions.unshift({ id: `regeneration-resolution_${crypto.randomUUID()}`, organisationId: invalidation.organisationId,
      createdByActorUserId: input.actor.id, updatedByActorUserId: input.actor.id, recordVersion: 1, invalidationId: invalidation.id,
      projectId: invalidation.projectId, caseId: invalidation.caseId, floorId: invalidation.floorId!, fromStatus, toStatus,
      sourceVersionId: invalidation.sourceVersionId ?? input.sourceVersionId, replacementVersionId: input.replacementVersionId,
      dependencyLinks: [...new Set([...(invalidation.dependencyLinks ?? []), input.replacementVersionId])], actorUserId: input.actor.id,
      actorDisplayName: input.actor.fullName, actorRole: input.actor.role, reason: input.reason,
      idempotencyKey: `${invalidation.id}:${toStatus}`, occurredAt: new Date().toISOString() });
    invalidation.status = toStatus;
  }
  invalidation.replacementVersionId = input.replacementVersionId; invalidation.updatedAt = new Date().toISOString();
  invalidation.updatedByActorUserId = input.actor.id; invalidation.recordVersion = (invalidation.recordVersion ?? 0) + 1;
  return invalidation;
}
