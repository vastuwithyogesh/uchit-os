import type {
  CanonicalServiceStage,
  CaseInputReadiness,
  CaseDocumentType,
  VastuCaseRecord,
  VastuCaseStatus,
  VastuServiceType
} from "@/lib/domain";
import type { AppState } from "@/lib/store";

export const DEFAULT_SERVICE_TEMPLATE_VERSION = "uchit-service/v2";
export const DEFAULT_SCOPE_VERSION = "scope/v1";

export const serviceDocumentRequirements: Record<VastuServiceType, readonly CaseDocumentType[]> = {
  EXISTING_SPACE: ["DIMENSIONED_PLAN", "LOCATION_MAP", "PHOTO_VIDEO", "ENTRANCE_ACCESS", "CURRENT_USE", "STRUCTURE_SERVICES", "FURNITURE_EQUIPMENT", "CLIENT_PRIORITIES"],
  NEW_CONSTRUCTION: ["SURVEY_BOUNDARY", "ROADS_ACCESS", "DEVELOPMENT_CONTROLS", "INTENT_ROOM_BRIEF", "USER_HIERARCHY_MOVEMENT", "ARCHITECTURAL_DRAWING", "EQUIPMENT_SERVICES", "FUTURE_NEEDS", "PROJECT_TEAM", "MILESTONES"]
};

export function getCaseDocumentReadiness(state: AppState, caseRecord: VastuCaseRecord) {
  const serviceType = normalizeCaseService(caseRecord).serviceType;
  const revisionNumber = caseRecord.revisionNumber ?? 1;
  const documents = state.caseDocuments.filter((item) => item.caseId === caseRecord.id && item.caseRevisionNumber === revisionNumber && item.serviceType === serviceType);
  const requirementKeys: Array<{ assetType: CaseDocumentType; floorLabel?: string }> = [];
  for (const assetType of serviceDocumentRequirements[serviceType]) {
    if (assetType !== "DIMENSIONED_PLAN") requirementKeys.push({ assetType });
    else {
      const floors = state.floorWorkspaces.filter((item) => item.caseId === caseRecord.id);
      if (floors.length) requirementKeys.push(...floors.map((floor) => ({ assetType, floorLabel: floor.floorLabel })));
      else requirementKeys.push({ assetType });
    }
  }
  const requirements = requirementKeys.map(({ assetType, floorLabel }) => {
    const document = documents.find((item) => item.assetType === assetType && item.isCurrent && (floorLabel === undefined || item.floorLabel === floorLabel));
    return { assetType, floorLabel, ready: Boolean(document && document.revisionStatus === "VERIFIED" && document.verified && !document.blocker && !document.discrepancy), document };
  });
  return { serviceType, requirements, ready: requirements.every((item) => item.ready) };
}

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

export function getActiveCaseForClient(state: Pick<AppState, "vastuCases">, clientId: string) {
  return state.vastuCases
    .filter((item) => item.clientId === clientId)
    .sort((left, right) => (right.revisionNumber ?? 1) - (left.revisionNumber ?? 1))[0];
}

export function getCaseAssessmentReadiness(state: AppState, caseId: string) {
  const observationCount = state.assessmentObservations.filter((item) => item.caseId === caseId).length;
  const recommendationCount = state.recommendations.filter((item) => item.caseId === caseId).length;
  const implementationTaskCount = state.implementationTasks.filter((item) => item.caseId === caseId).length;
  return { observationCount, recommendationCount, implementationTaskCount, readyForStructuredReport: observationCount > 0 && recommendationCount > 0 };
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

export class CaseReadinessError extends Error {
  readonly statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = "CaseReadinessError";
  }
}

export function getCaseEvaluationBlockers(state: AppState, caseId: string) {
  const caseRecord = state.vastuCases.find((item) => item.id === caseId);
  if (!caseRecord) return ["Case not found. Return to the case workspace and select a valid case."];
  const blockers: string[] = [];
  if (!caseRecord.orientationLocked) blockers.push("Lock the orientation after completing direction verification.");
  if (state.reportVersions.some((report) => report.caseId === caseId && report.artifact)) blockers.push("An immutable report already exists. Start the formal rectification workflow before creating new evidence.");
  const documentReadiness = getCaseDocumentReadiness(state, caseRecord);
  if (!documentReadiness.ready) {
    const missing = documentReadiness.requirements.filter((item) => !item.ready).map((item) => item.floorLabel ? `${item.assetType} (${item.floorLabel})` : item.assetType).join(", ");
    blockers.push(`Verify the current required case documents before evaluation: ${missing}.`);
  }

  const readiness = getServiceReadiness(caseRecord);
  if (!readiness.ready) {
    const missing = readiness.checklist.filter((item) => !item.ready).map((item) => item.label).join(", ");
    blockers.push(`Complete required information in Service setup: ${missing}.`);
  }

  const floors = state.floorWorkspaces.filter((floor) => floor.caseId === caseId);
  if (!floors.length) blockers.push("Add at least one floor workspace and lock it.");
  else if (floors.some((floor) => !floor.locked)) blockers.push("Lock every floor workspace after review.");

  return blockers;
}

export function assertCaseReadyForEvaluation(state: AppState, caseId: string) {
  const blockers = getCaseEvaluationBlockers(state, caseId);
  if (blockers.length) throw new CaseReadinessError(`Evaluation is blocked. ${blockers.join(" ")}`);
  const caseRecord = state.vastuCases.find((item) => item.id === caseId)!;
  const readiness = getServiceReadiness(caseRecord);
  const floors = state.floorWorkspaces.filter((floor) => floor.caseId === caseId);

  return { caseRecord, floors, readiness };
}
