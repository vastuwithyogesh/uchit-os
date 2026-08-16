import type {
  CanonicalServiceStage,
  CaseInputReadiness,
  CaseDocumentType,
  VastuCaseRecord,
  VastuCaseStatus,
  VastuServiceType
} from "./domain.ts";
import type { AppState } from "./store.ts";
import { getMethodologyReadiness } from "./methodology-readiness.ts";
import { getUtilityMasterMethodologyBinding } from "./utility-master.ts";
import { getApprovedEntranceZoneCatalog } from "./entrance-zone-catalog.ts";

export const DEFAULT_SERVICE_TEMPLATE_VERSION = "uchit-service/v2";
export const DEFAULT_SCOPE_VERSION = "scope/v1";

export const serviceDocumentRequirements: Record<VastuServiceType, readonly CaseDocumentType[]> = {
  EXISTING_SPACE: ["DIMENSIONED_PLAN", "LOCATION_MAP", "PHOTO_VIDEO", "ENTRANCE_ACCESS", "CURRENT_USE", "STRUCTURE_SERVICES", "FURNITURE_EQUIPMENT", "CLIENT_PRIORITIES", "MANUAL_UTILITY_SHEET"],
  NEW_CONSTRUCTION: ["SURVEY_BOUNDARY", "ROADS_ACCESS", "DEVELOPMENT_CONTROLS", "INTENT_ROOM_BRIEF", "USER_HIERARCHY_MOVEMENT", "ARCHITECTURAL_DRAWING", "EQUIPMENT_SERVICES", "FUTURE_NEEDS", "PROJECT_TEAM", "MILESTONES", "MANUAL_UTILITY_SHEET"]
};

export function getCaseDocumentReadiness(state: AppState, caseRecord: VastuCaseRecord, floorId?: string) {
  const serviceType = normalizeCaseService(caseRecord).serviceType;
  const revisionNumber = caseRecord.revisionNumber ?? 1;
  const documents = state.caseDocuments.filter((item) => item.caseId === caseRecord.id && item.caseRevisionNumber === revisionNumber && item.serviceType === serviceType);
  const requirementKeys: Array<{ assetType: CaseDocumentType; floorLabel?: string }> = [];
  for (const assetType of serviceDocumentRequirements[serviceType]) {
    if (assetType !== "DIMENSIONED_PLAN" && assetType !== "MANUAL_UTILITY_SHEET") requirementKeys.push({ assetType });
    else {
      const floors = state.floorWorkspaces.filter((item) => item.caseId === caseRecord.id && (!floorId || item.id === floorId));
      if (floors.length) requirementKeys.push(...floors.map((floor) => ({ assetType, floorLabel: floor.floorLabel })));
      else requirementKeys.push({ assetType });
    }
  }
  const requirements = requirementKeys.map(({ assetType, floorLabel }) => {
    const document = documents.find((item) => item.assetType === assetType && item.isCurrent && (floorLabel === undefined || item.floorLabel === floorLabel));
    return { assetType, floorLabel, ready: Boolean(document && document.revisionStatus === "VERIFIED" && document.verified && !document.blocker && !document.discrepancy
      && (assetType !== "MANUAL_UTILITY_SHEET" || document.founderApprovalStatus === "APPROVED")), document };
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

export function getCaseEvaluationBlockers(state: AppState, caseId: string, floorId?: string, options?: { ignoreRegenerationTargetTypes?: string[] }) {
  const caseRecord = state.vastuCases.find((item) => item.id === caseId);
  if (!caseRecord) return ["Case not found. Return to the case workspace and select a valid case."];
  const blockers: string[] = [];
  if (!caseRecord.orientationLocked) blockers.push("Lock the orientation after completing direction verification.");
  if (state.reportVersions.some((report) => report.caseId === caseId && report.artifact && (!floorId || !report.floorId || report.floorId === floorId))) blockers.push("An immutable report already exists for this floor. Start the formal rectification workflow before creating new evidence.");
  const selectedFloor = floorId ? state.floorWorkspaces.find((item) => item.id === floorId && item.caseId === caseId) : undefined;
  if (floorId && !selectedFloor) blockers.push("Select a floor that belongs to this active case.");
  const documentReadiness = getCaseDocumentReadiness(state, caseRecord, floorId);
  if (!documentReadiness.ready) {
    const missing = documentReadiness.requirements.filter((item) => !item.ready).map((item) => item.floorLabel ? `${item.assetType} (${item.floorLabel})` : item.assetType).join(", ");
    blockers.push(`Verify the current required case documents before evaluation: ${missing}.`);
  }

  const readiness = getServiceReadiness(caseRecord);
  if (!readiness.ready) {
    const missing = readiness.checklist.filter((item) => !item.ready).map((item) => item.label).join(", ");
    blockers.push(`Complete required information in Service setup: ${missing}.`);
  }

  const floors = state.floorWorkspaces.filter((floor) => floor.caseId === caseId && (!floorId || floor.id === floorId));
  if (!floors.length) blockers.push("Add at least one floor workspace and lock it.");
  else if (floors.some((floor) => !floor.locked)) blockers.push("Lock every floor workspace after review.");

  const project = caseRecord.projectId ? state.projects.find((item) => item.id === caseRecord.projectId) : undefined;
  if (!project) blockers.push("Create the project and link every floor before spatial evaluation.");
  const orientation = project ? state.orientationVersions.find((item) => item.projectId === project.id && item.caseId === caseId && item.status === "LOCKED") : undefined;
  if (project && !orientation) blockers.push("Lock an exact orientation version using current Google Earth evidence.");
  if (project) {
    for (const floor of floors) {
      const plan = state.planVersions.find((item) => item.projectId === project.id && item.caseId === caseId && item.floorId === floor.id && item.status === "CURRENT");
      if (!plan) { blockers.push(`Add a current plan version for ${floor.floorLabel}.`); continue; }
      const markedEvidence = state.spatialEvidenceVersions.find((item) => item.projectId === project.id && item.caseId === caseId && item.floorId === floor.id
        && item.planVersionId === plan.id && item.kind === "HAND_MARKED_PLAN" && item.status === "CURRENT" && item.fullColour);
      if (!markedEvidence) blockers.push(`Add current full-colour hand-marked evidence for ${floor.floorLabel}.`);
      const marked32DEvidence = state.spatialEvidenceVersions.find((item) => item.projectId === project.id && item.caseId === caseId && item.floorId === floor.id
        && item.planVersionId === plan.id && item.kind === "HAND_MARKED_PLAN" && item.classification === "MARKED_32D_CHAKRA_V1"
        && item.has32SectorChakra === true && item.status === "CURRENT" && item.fullColour);
      if (!marked32DEvidence) blockers.push(`Add Founder-confirmed 32-sector chakra evidence for ${floor.floorLabel}.`);
      const marked16DEvidence = state.spatialEvidenceVersions.find((item) => item.projectId === project.id && item.caseId === caseId && item.floorId === floor.id
        && item.planVersionId === plan.id && item.kind === "HAND_MARKED_PLAN" && item.classification === "MARKED_16D_MAPPING_V1"
        && item.has16DirectionMapping === true && item.status === "CURRENT" && item.fullColour);
      if (!marked16DEvidence) blockers.push(`Add Founder-confirmed 16-direction marked mapping for ${floor.floorLabel}.`);
      const propertyMainGate = (state.entranceZoneVersions ?? []).find((item) => item.projectId === project.id && item.caseId === caseId && item.scope === "PROPERTY_MAIN_GATE" && item.status === "CURRENT");
      const floorGate = (state.entranceZoneVersions ?? []).find((item) => item.projectId === project.id && item.caseId === caseId && item.floorId === floor.id && item.scope === "FLOOR_PRIMARY_ENTRANCE" && item.status === "CURRENT");
      if (!propertyMainGate && !floorGate) blockers.push(`Confirm at least one applicable property or floor entrance zone for ${floor.floorLabel}.`);
    }
  }
  if (state.dependencyInvalidations.some((item) => item.caseId === caseId && (!floorId || !item.floorId || item.floorId === floorId)
    && ["NEEDS_REGENERATION", "REPLACEMENT_REQUIRED", "REGENERATED"].includes(item.status)
    && !options?.ignoreRegenerationTargetTypes?.includes(item.targetType))) {
    blockers.push("Regenerate stale mappings and evaluations after the upstream change.");
  }
  if (!caseRecord.organisationId) blockers.push("Adopt this case into the active organisation before methodology-controlled evaluation.");
  else {
    for (const module of ["DIRECTION_32", "DIRECTION_16", "SITE_ENVIRONMENT", "UTILITY", "SHAKTI_ELEMENT"] as const) {
      const methodology = module === "UTILITY"
        ? getUtilityMasterMethodologyBinding(state, caseRecord.organisationId)
        : module === "DIRECTION_32" ? getApprovedEntranceZoneCatalog(state, caseRecord.organisationId)
        : getMethodologyReadiness(state, caseRecord.organisationId, module);
      if (!methodology.ready) blockers.push(`${module.replaceAll("_", " ")} is ${methodology.status.replaceAll("_", " ")}: ${methodology.reason}`);
    }
  }

  return blockers;
}

export function assertCaseReadyForEvaluation(state: AppState, caseId: string, floorId?: string) {
  const blockers = getCaseEvaluationBlockers(state, caseId, floorId);
  if (blockers.length) throw new CaseReadinessError(`Evaluation is blocked. ${blockers.join(" ")}`);
  const caseRecord = state.vastuCases.find((item) => item.id === caseId)!;
  const readiness = getServiceReadiness(caseRecord);
  const floors = state.floorWorkspaces.filter((floor) => floor.caseId === caseId && (!floorId || floor.id === floorId));

  return { caseRecord, floors, readiness };
}
