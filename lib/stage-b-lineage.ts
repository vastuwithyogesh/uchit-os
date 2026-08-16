import type { AppState } from "./store.ts";
import type { StageBRemediationRecord } from "./domain.ts";

export type StageBReportLineage =
  | { architectureVersion: "LEGACY"; sourceKind: "LEGACY_REPORT"; reportId: string; reportVersionId?: string }
  | { architectureVersion: "V1"; sourceKind: "V1_COMBINED_EVALUATION_REPORT"; reportSourceId: string; reportSourceHash: string; reportTemplateVersion?: string };

export class StageBReportLineageError extends Error {}

export function validateStageBReportLineage(lineage: StageBReportLineage): StageBReportLineage {
  if (lineage.architectureVersion === "LEGACY") {
    if (lineage.sourceKind !== "LEGACY_REPORT" || !lineage.reportId) throw new StageBReportLineageError("Legacy Stage-B lineage requires reportId.");
    return lineage;
  }
  if (lineage.sourceKind !== "V1_COMBINED_EVALUATION_REPORT" || !lineage.reportSourceId || !lineage.reportSourceHash) throw new StageBReportLineageError("V1 Stage-B lineage requires reportSourceId and reportSourceHash.");
  return lineage;
}

export function resolveStageBReportLineage(state: AppState, remediation: StageBRemediationRecord): StageBReportLineage {
  if (remediation.architectureVersion === "V1" || remediation.reportSourceKind === "V1_COMBINED_EVALUATION_REPORT") {
    const lineage = validateStageBReportLineage({ architectureVersion: "V1", sourceKind: "V1_COMBINED_EVALUATION_REPORT", reportSourceId: remediation.reportSourceId ?? "", reportSourceHash: remediation.reportSourceHash ?? "", reportTemplateVersion: remediation.reportTemplateVersion }) as Extract<StageBReportLineage, { architectureVersion: "V1" }>;
    const source = state.combinedEvaluationReportSnapshots?.find((item) => item.id === lineage.reportSourceId
      && item.organisationId === remediation.organisationId
      && item.caseId === remediation.caseId
      && item.projectId === remediation.projectId
      && item.floorId === remediation.floorId
      && item.architectureVersion === "V1"
      && item.status === "FINALIZED");
    if (!source) throw new StageBReportLineageError("V1 Stage-B lineage requires the finalized Combined Evaluation Report in the exact organization, project, case, and floor scope.");
    if (source.contentHash !== lineage.reportSourceHash) throw new StageBReportLineageError("V1 Stage-B reportSourceHash does not match the canonical finalized Combined Evaluation Report contentHash.");
    return lineage;
  }
  const reportId = remediation.reportId ?? remediation.reportSourceId;
  if (!reportId) throw new StageBReportLineageError("Legacy Stage-B lineage requires reportId.");
  const report = state.reportVersions.find((item) => item.id === reportId);
  return validateStageBReportLineage({ architectureVersion: "LEGACY", sourceKind: "LEGACY_REPORT", reportId, reportVersionId: report?.id });
}

export function stageBLineageFields(lineage: StageBReportLineage) {
  return lineage.architectureVersion === "V1" ? { architectureVersion: "V1" as const, sourceKind: lineage.sourceKind, reportSourceId: (lineage as Extract<StageBReportLineage, { architectureVersion: "V1" }>).reportSourceId, reportSourceHash: (lineage as Extract<StageBReportLineage, { architectureVersion: "V1" }>).reportSourceHash, ...(lineage.reportTemplateVersion ? { reportTemplateVersion: lineage.reportTemplateVersion } : {}) } : { architectureVersion: "LEGACY" as const, sourceKind: lineage.sourceKind, reportId: lineage.reportId, ...(lineage.reportVersionId ? { reportVersionId: lineage.reportVersionId } : {}) };
}

export function stageBLineageForRemediation(state: AppState, remediation: StageBRemediationRecord): StageBReportLineage {
  return resolveStageBReportLineage(state, remediation);
}

export function stageBRecordLineageFields(state: AppState, remediation: StageBRemediationRecord) {
  const lineage = resolveStageBReportLineage(state, remediation);
  return lineage.architectureVersion === "V1"
    ? { stageBLineage: lineage, reportSourceKind: "V1_COMBINED_EVALUATION_REPORT" as const, reportSourceId: (lineage as Extract<StageBReportLineage, { architectureVersion: "V1" }>).reportSourceId, reportSourceHash: (lineage as Extract<StageBReportLineage, { architectureVersion: "V1" }>).reportSourceHash }
    : { stageBLineage: lineage, reportId: (lineage as Extract<StageBReportLineage, { architectureVersion: "LEGACY" }>).reportId };
}

export function sameStageBLineage(left: StageBReportLineage | undefined, right: StageBReportLineage): boolean {
  if (!left || left.architectureVersion !== right.architectureVersion || left.sourceKind !== right.sourceKind) return false;
  return left.architectureVersion === "V1"
    ? (left as Extract<StageBReportLineage, { architectureVersion: "V1" }>).reportSourceId === (right as Extract<StageBReportLineage, { architectureVersion: "V1" }>).reportSourceId && (left as Extract<StageBReportLineage, { architectureVersion: "V1" }>).reportSourceHash === (right as Extract<StageBReportLineage, { architectureVersion: "V1" }>).reportSourceHash
    : (left as Extract<StageBReportLineage, { architectureVersion: "LEGACY" }>).reportId === (right as Extract<StageBReportLineage, { architectureVersion: "LEGACY" }>).reportId;
}
export function stageBChildMatchesRemediation(state: AppState, remediation: StageBRemediationRecord, child: { reportId?: string; stageBLineage?: StageBReportLineage; caseId?: string; floorId?: string }): boolean {
  const expected = resolveStageBReportLineage(state, remediation);
  if (child.caseId !== undefined && child.caseId !== remediation.caseId) return false;
  if (child.floorId !== undefined && child.floorId !== remediation.floorId) return false;
  return child.stageBLineage ? sameStageBLineage(child.stageBLineage, expected) : expected.architectureVersion === "LEGACY" && child.reportId === expected.reportId;
}
