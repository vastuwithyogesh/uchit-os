import type {
  CanonicalServiceStage,
  CaseInputReadiness,
  VastuCaseRecord,
  VastuCaseStatus,
  VastuServiceType
} from "@/lib/domain";

export const DEFAULT_SERVICE_TEMPLATE_VERSION = "uchit-service/v2";
export const DEFAULT_SCOPE_VERSION = "scope/v1";

export type ServiceReadinessItem = {
  key: keyof CaseInputReadiness | "currentDrawingVerified";
  label: string;
  guidance: string;
  ready: boolean;
};

const stageFromLegacyStatus: Record<VastuCaseStatus, CanonicalServiceStage> = {
  AWAITING_ADVANCE: "UNDERSTAND",
  CASE_CREATED: "UNDERSTAND",
  FLOOR_WORKSPACE_ACTIVE: "VERIFY",
  ORIENTATION_LOCKED: "EVALUATE",
  STAGE_A_READY: "PRIORITISE",
  BALANCE_PENDING: "PRIORITISE",
  FULL_PAYMENT_APPROVED: "RECOMMEND",
  REPORT_APPROVAL_PENDING: "RECOMMEND",
  REPORT_APPROVED: "IMPLEMENT",
  VERDICT_RELEASED: "IMPLEMENT",
  RECTIFICATION: "RECOMMEND"
};

export function normalizeCaseService(caseRecord: VastuCaseRecord) {
  return {
    serviceType: caseRecord.serviceType ?? "EXISTING_SPACE" as VastuServiceType,
    canonicalStage: caseRecord.canonicalStage ?? stageFromLegacyStatus[caseRecord.status],
    serviceTemplateVersion: caseRecord.serviceTemplateVersion ?? DEFAULT_SERVICE_TEMPLATE_VERSION,
    scopeVersion: caseRecord.scopeVersion ?? DEFAULT_SCOPE_VERSION
  };
}

export function serviceTypeLabel(serviceType: VastuServiceType) {
  return serviceType === "NEW_CONSTRUCTION" ? "New construction planning" : "Existing space assessment";
}

export function canonicalStageLabel(stage: CanonicalServiceStage) {
  return ({
    UNDERSTAND: "Understand the client and space",
    VERIFY: "Verify plans and directions",
    MAP: "Map the space",
    EVALUATE: "Evaluate the findings",
    PRIORITISE: "Choose what matters most",
    RECOMMEND: "Prepare practical recommendations",
    IMPLEMENT: "Support implementation"
  } satisfies Record<CanonicalServiceStage, string>)[stage];
}

export function getServiceReadinessChecklist(caseRecord: VastuCaseRecord): ServiceReadinessItem[] {
  const profile = normalizeCaseService(caseRecord);
  const readiness = caseRecord.inputReadiness ?? {};
  if (profile.serviceType === "NEW_CONSTRUCTION") {
    const currentDrawingVerified = Boolean(caseRecord.currentDrawing?.versionLabel && caseRecord.currentDrawing.verifiedAt && !caseRecord.currentDrawing.superseded && !caseRecord.currentDrawing.discrepancy);
    return [
      { key: "plotMeasurements", label: "Plot measurements and diagonals", guidance: "Add verified side lengths, diagonals, and survey details.", ready: Boolean(readiness.plotMeasurements) },
      { key: "boundaryDrawing", label: "Boundary drawing", guidance: "Upload the current survey plan or accurate boundary drawing.", ready: Boolean(readiness.boundaryDrawing) },
      { key: "siteLocation", label: "Location, roads, and access", guidance: "Confirm the map location, roads, gates, and approach.", ready: Boolean(readiness.siteLocation) },
      { key: "developmentControls", label: "Planning restrictions", guidance: "Record setbacks, height limits, approvals, and non-negotiable constraints.", ready: Boolean(readiness.developmentControls) },
      { key: "projectBrief", label: "Room and operations brief", guidance: "Confirm spaces, users, movement, equipment, and future needs.", ready: Boolean(readiness.projectBrief) },
      { key: "projectTeam", label: "Project team and decision-maker", guidance: "Identify the client decision-maker and architect or technical contacts.", ready: Boolean(readiness.projectTeam) },
      { key: "constructionSchedule", label: "Construction milestones", guidance: "Record concept, drawing-freeze, approvals, and construction dates.", ready: Boolean(readiness.constructionSchedule) },
      { key: "currentDrawingVerified", label: "Current drawing version verified", guidance: "Verify the latest drawing and resolve discrepancies before detailed planning.", ready: currentDrawingVerified }
    ];
  }

  return [
    { key: "floorPlans", label: "Dimensioned floor plans", guidance: "Upload plans with dimensions, room labels, and floor levels.", ready: Boolean(readiness.floorPlans) },
    { key: "siteLocation", label: "Site location", guidance: "Add a map pin, coordinates, or verified location.", ready: Boolean(readiness.siteLocation) },
    { key: "visualRecord", label: "Photos and walkthrough", guidance: "Add recent photos and a walkthrough of the property.", ready: Boolean(readiness.visualRecord) },
    { key: "currentUse", label: "Current use and fixed services", guidance: "Record room use, access, structure, water, electrical points, and major objects.", ready: Boolean(readiness.currentUse) },
    { key: "clientPriorities", label: "Client priorities", guidance: "Confirm concerns, intended changes, constraints, and pending decisions.", ready: Boolean(readiness.clientPriorities) }
  ];
}

export function getServiceReadiness(caseRecord: VastuCaseRecord) {
  const checklist = getServiceReadinessChecklist(caseRecord);
  const completed = checklist.filter((item) => item.ready).length;
  return { checklist, completed, total: checklist.length, ready: completed === checklist.length };
}
