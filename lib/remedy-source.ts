import type { CaseUsedRemedyRecord, RemedyRepositoryRecord, StageBRemedyType } from "./domain.ts";
import type { AppState } from "./store.ts";

export interface RemedySourceScope {
  organisationId: string;
  caseId: string;
  floorId: string;
  remediationId: string;
  pageId: string;
  remedialType: StageBRemedyType;
}

export type ResolvedRemedySource =
  | { sourceKind: "PERMANENT"; record: RemedyRepositoryRecord }
  | { sourceKind: "CASE_USED"; record: CaseUsedRemedyRecord };

/**
 * The single trust boundary for resolving a Stage B remedy identifier.
 * Permanent records retain their organisation-wide APPROVED semantics. A
 * case-used record is visible only inside its exact page scope.
 */
export function resolveRemedySource(state: AppState, remedyId: string, scope: RemedySourceScope): ResolvedRemedySource | undefined {
  const permanent = state.remedyRepositoryRecords.find((item) => item.id === remedyId
    && item.organisationId === scope.organisationId
    && item.status === "APPROVED"
    && item.remedialType === scope.remedialType);
  if (permanent) return { sourceKind: "PERMANENT", record: permanent };

  const caseUsed = state.caseUsedRemedyRecords.find((item) => item.id === remedyId
    && item.organisationId === scope.organisationId
    && item.caseId === scope.caseId
    && item.floorId === scope.floorId
    && item.remediationId === scope.remediationId
    && item.pageId === scope.pageId
    && item.remedialType === scope.remedialType
    && item.status === "ACTIVE");
  return caseUsed ? { sourceKind: "CASE_USED", record: caseUsed } : undefined;
}
