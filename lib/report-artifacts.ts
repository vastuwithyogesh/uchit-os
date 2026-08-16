import type { AppState } from "./store.ts";
import { resolveDocumentTemplateSnapshot } from "./document-branding.ts";
import type { AppUser, ClientSafeIntakeSnapshot, ReportArtifactManifest, ReportVersionRecord } from "./domain.ts";
import { buildStageBRenderManifest } from "./stage-b-remediation.ts";
import { buildSectionARenderManifest, validateRemediationReportIntegrity } from "./section-a-remediation.ts";
import { buildSectionCRenderManifest } from "./section-c-extras.ts";
import { getAouReadiness, selectAouSnapshotForVerdicts } from "./aou-methodology.ts";

export const LEGACY_REPORT_TEMPLATE_VERSION = "uchit-verdict/v1";
export const V2_REPORT_TEMPLATE_VERSION = "uchit-verdict/v2";
export const V3_REPORT_TEMPLATE_VERSION = "uchit-verdict/v3";
export const V4_REPORT_TEMPLATE_VERSION = "uchit-verdict/v4";
export const V5_REPORT_TEMPLATE_VERSION = "uchit-verdict/v5";
/** New Founder reports use v4; v1-v3 remain dispatchable historical contracts. */
export const REPORT_TEMPLATE_VERSION = V4_REPORT_TEMPLATE_VERSION;
export const PREVIEW_WATERMARK = "PREVIEW ONLY · NOT FOR FINAL USE";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonicalize(entry)]));
  }
  return value;
}

function qualificationAnswer(state: AppState, clientId: string | undefined, patterns: RegExp[]) {
  const qualification = state.leadQualifications.find((item) => item.clientId === clientId);
  const answer = qualification?.conversationalForm.find((item) => patterns.some((pattern) => pattern.test(item.label)))?.answer?.trim();
  return answer || null;
}

const stableTextOrder = (left: { title: string }, right: { title: string }) => left.title < right.title ? -1 : left.title > right.title ? 1 : 0;

function isFounderConfirmed32DEvidence(item: { kind: string; classification?: string; has32SectorChakra?: boolean; status: string; fullColour: boolean }) {
  return item.kind === "HAND_MARKED_PLAN" && item.status === "CURRENT" && item.fullColour &&
    ((item.classification === "MARKED_32D_CHAKRA_V1" && item.has32SectorChakra === true) || item.classification === undefined);
}

function currentApprovedManualUtilitySheet(state: AppState, caseRecord: AppState["vastuCases"][number] | undefined, floor: AppState["floorWorkspaces"][number] | undefined) {
  if (!caseRecord || !floor) return undefined;
  return (state.caseDocuments ?? []).find((item) => item.caseId === caseRecord.id
    && item.caseRevisionNumber === (caseRecord.revisionNumber ?? 1)
    && item.serviceType === (caseRecord.serviceType ?? "EXISTING_SPACE")
    && item.assetType === "MANUAL_UTILITY_SHEET" && item.floorLabel === floor.floorLabel && item.isCurrent
    && item.revisionStatus === "VERIFIED" && Boolean(item.verified) && !item.blocker && !item.discrepancy
    && item.founderApprovalStatus === "APPROVED");
}

function latestApprovedSiteRecords(state: AppState, report: ReportVersionRecord, floor: AppState["floorWorkspaces"][number] | undefined) {
  // A Stage A preview is created before Site Analysis. Once its artifact is frozen,
  // later Site/Post-Site records must not be absorbed into that historical preview.
  if (report.artifact && !report.artifact.siteAnalysisId && !report.artifact.postSiteFindingsId) return { analysis: undefined, findings: undefined };
  const analysis = [...(state.siteAnalyses ?? [])].filter((item) => item.caseId === report.caseId && item.floorId === floor?.id
    && (!report.artifact?.siteAnalysisId || item.id === report.artifact.siteAnalysisId) && item.status === "FOUNDER_APPROVED" && !item.needsRegeneration)
    .sort((left, right) => right.version - left.version)[0];
  const findings = [...(state.postSiteFindings ?? [])].filter((item) => item.caseId === report.caseId && item.floorId === floor?.id
    && (!report.artifact?.postSiteFindingsId || item.id === report.artifact.postSiteFindingsId) && item.status === "FOUNDER_APPROVED" && !item.needsRegeneration)
    .sort((left, right) => right.version - left.version)[0];
  return { analysis, findings };
}

export function buildClientSafeIntakeProjection(state: AppState, clientId: string | undefined): ClientSafeIntakeSnapshot {
  const profile = (state.clientIntakeProfiles ?? []).find((item) => item.clientId === clientId);
  return { mainChallenge: profile?.needs?.mainChallenge ?? null, desiredOutcome: profile?.needs?.desiredOutcome ?? null, serviceInterest: profile?.propertyContext?.serviceInterest ?? null, propertyType: profile?.propertyContext?.propertyType ?? null, propertyStatus: profile?.propertyContext?.propertyStatus ?? null, cityCountry: profile?.propertyContext?.cityCountry ?? null, constraints: profile?.propertyContext?.constraints ?? null };
}

const EMPTY_CLIENT_SAFE_INTAKE: ClientSafeIntakeSnapshot = { mainChallenge: null, desiredOutcome: null, serviceInterest: null, propertyType: null, propertyStatus: null, cityCountry: null, constraints: null };

export function resolveReportIntakeProjection(state: AppState, report: ReportVersionRecord, clientId: string | undefined): ClientSafeIntakeSnapshot {
  if (report.artifact) return report.artifact.intakeSnapshot ?? EMPTY_CLIENT_SAFE_INTAKE;
  return buildClientSafeIntakeProjection(state, clientId);
}

/** Client-safe, revision-bound assessment content used by both the v2 hash and renderer. */
export function buildClientSafeAssessmentComposition(state: AppState, caseRecord: AppState["vastuCases"][number] | undefined) {
  if (!caseRecord) return { observations: [], recommendations: [], implementationTasks: [] };
  const revisionNumber = caseRecord.revisionNumber ?? 1;
  const serviceType = caseRecord.serviceType;
  const belongsToReportRevision = (item: { caseId: string; caseRevisionNumber: number; serviceType: string }) =>
    item.caseId === caseRecord.id && item.caseRevisionNumber === revisionNumber && (!serviceType || item.serviceType === serviceType);
  return {
    observations: state.assessmentObservations.filter(belongsToReportRevision).map((item) => ({
      title: item.title,
      observation: item.observation,
      alignmentStatus: item.alignmentStatus,
      energyStatus: item.energyStatus,
      placementStatus: item.placementStatus
    })).sort(stableTextOrder),
    recommendations: state.recommendations.filter(belongsToReportRevision).map((item) => ({
      title: item.title,
      rationale: item.rationale,
      action: item.action,
      decisionPriority: item.decisionPriority,
      attentionClass: item.attentionClass,
      implementationHorizon: item.implementationHorizon,
      level: item.level
    })).sort(stableTextOrder),
    implementationTasks: state.implementationTasks.filter(belongsToReportRevision).map((item) => ({
      title: item.title,
      status: item.status,
      implementationHorizon: item.implementationHorizon,
      ownerRole: item.ownerRole,
      ownerName: item.ownerName
    })).sort(stableTextOrder)
  };
}

export function buildVerifiedDocumentComposition(state: AppState, caseRecord: AppState["vastuCases"][number] | undefined) {
  if (!caseRecord) return [];
  const revisionNumber = caseRecord.revisionNumber ?? 1;
  const serviceType = caseRecord.serviceType;
  return (state.caseDocuments ?? []).filter((item) =>
    item.caseId === caseRecord.id && item.caseRevisionNumber === revisionNumber && (!serviceType || item.serviceType === serviceType) &&
    item.isCurrent && item.revisionStatus === "VERIFIED" && Boolean(item.verified) && !item.blocker && !item.discrepancy
  ).map((item) => ({
    assetType: item.assetType,
    floorLabel: item.floorLabel ?? null,
    versionLabel: item.versionLabel,
    documentDate: item.documentDate ?? null,
    verificationStatus: "VERIFIED" as const
  })).sort((left, right) => {
    const leftKey = `${left.assetType}\u0000${left.floorLabel ?? ""}\u0000${left.versionLabel}`;
    const rightKey = `${right.assetType}\u0000${right.floorLabel ?? ""}\u0000${right.versionLabel}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
}

export function buildPreDeliveryMilestoneComposition(state: AppState, caseRecord: AppState["vastuCases"][number] | undefined) {
  if (!caseRecord) return [];
  const revisionNumber = caseRecord.revisionNumber ?? 1;
  const serviceType = caseRecord.serviceType;
  return (state.deliveryMilestones ?? []).filter((item) =>
    item.caseId === caseRecord.id && item.caseRevisionNumber === revisionNumber && (!serviceType || item.serviceType === serviceType) &&
    (item.kind === "REVIEW_ROUND" || item.kind === "FINAL_COMPLIANCE_CHECK") && item.status === "COMPLETED"
  ).map((item) => ({
    kind: item.kind,
    sequence: item.sequence,
    roundLabel: item.roundLabel,
    title: item.title,
    completedAt: item.completedAt ?? null,
    observationSummary: item.observationSummary ?? null,
    actionSummary: item.actionSummary ?? null,
    drawingVersion: item.drawingRef?.version ?? null
  })).sort((left, right) => left.kind < right.kind ? -1 : left.kind > right.kind ? 1 : left.sequence - right.sequence || (left.title < right.title ? -1 : left.title > right.title ? 1 : 0));
}

export function buildReportComposition(state: AppState, report: ReportVersionRecord, intakeOverride?: ClientSafeIntakeSnapshot) {
  const caseRecord = state.vastuCases.find((item) => item.id === report.caseId);
  const client = state.clients.find((item) => item.id === caseRecord?.clientId);
  const evaluation = report.artifact?.evaluationSnapshotId
    ? state.evaluationSnapshots.find((item) => item.id === report.artifact?.evaluationSnapshotId)
    : state.evaluationSnapshots.find((item) => item.caseId === report.caseId);
  const shakti = report.artifact?.shaktiSnapshotId
    ? state.shaktiSnapshots.find((item) => item.id === report.artifact?.shaktiSnapshotId)
    : state.shaktiSnapshots.find((item) => item.caseId === report.caseId);
  const objective = qualificationAnswer(state, client?.id, [/main challenge/i, /desired outcome/i, /requirement/i]);
  const propertyType = qualificationAnswer(state, client?.id, [/property type/i]);
  const propertyStatus = qualificationAnswer(state, client?.id, [/property status/i, /construction stage/i, /project stage/i]);
  const floors = state.floorWorkspaces.filter((item) => item.caseId === report.caseId).map((floor) => ({
    id: floor.id,
    floorLabel: floor.floorLabel,
    locked: floor.locked,
    status: floor.status,
    evidenceUploads: [...floor.evidenceUploads]
  }));
  const assessment = buildClientSafeAssessmentComposition(state, caseRecord);
  const verifiedDocuments = buildVerifiedDocumentComposition(state, caseRecord);
  const preDeliveryMilestones = buildPreDeliveryMilestoneComposition(state, caseRecord);
  const includeIntake = intakeOverride !== undefined || !report.artifact || report.artifact.intakeSnapshot !== undefined;
  const intake = intakeOverride ?? resolveReportIntakeProjection(state, report, client?.id);
  return {
    report: { id: report.id, caseId: report.caseId, versionLabel: report.versionLabel, isPreview: report.isPreview },
    case: caseRecord ? {
      id: caseRecord.id,
      caseNumber: caseRecord.caseNumber,
      orientationLocked: caseRecord.orientationLocked,
      serviceType: caseRecord.serviceType ?? null,
      canonicalStage: caseRecord.canonicalStage ?? null,
      serviceTemplateVersion: caseRecord.serviceTemplateVersion ?? null,
      scopeVersion: caseRecord.scopeVersion ?? null,
      currentDrawing: caseRecord.currentDrawing ?? null
    } : null,
    client: client ? { id: client.id, displayName: client.displayName, city: client.city } : null,
    qualification: { objective, propertyType, propertyStatus },
    ...(includeIntake ? { intake } : {}),
    floors,
    evaluation: evaluation ?? null,
    shakti: shakti ?? null,
    assessment,
    verifiedDocuments,
    preDeliveryMilestones,
    templateVersion: V2_REPORT_TEMPLATE_VERSION,
    watermark: report.isPreview ? PREVIEW_WATERMARK : null
  };
}

/**
 * Founder Edition v3 is deliberately one-floor-per-report. It never falls back
 * to another floor or a case-wide snapshot when an exact floor lineage is absent.
 */
export function buildFloorReportComposition(state: AppState, report: ReportVersionRecord, intakeOverride?: ClientSafeIntakeSnapshot) {
  const caseRecord = state.vastuCases.find((item) => item.id === report.caseId);
  const client = state.clients.find((item) => item.id === caseRecord?.clientId);
  const floor = report.floorId
    ? state.floorWorkspaces.find((item) => item.id === report.floorId && item.caseId === report.caseId && item.projectId === caseRecord?.projectId)
    : undefined;
  const plan = report.artifact?.planVersionId
    ? state.planVersions.find((item) => item.id === report.artifact?.planVersionId && item.floorId === floor?.id && item.caseId === report.caseId)
    : state.planVersions.find((item) => item.floorId === floor?.id && item.caseId === report.caseId && item.status === "CURRENT");
  const orientation = report.artifact?.orientationVersionId
    ? state.orientationVersions.find((item) => item.id === report.artifact?.orientationVersionId && item.caseId === report.caseId)
    : state.orientationVersions.find((item) => item.caseId === report.caseId && item.status === "LOCKED");
  const markedEvidence = report.artifact?.handMarkedEvidenceVersionId
    ? state.spatialEvidenceVersions.find((item) => item.id === report.artifact?.handMarkedEvidenceVersionId && item.floorId === floor?.id && item.planVersionId === plan?.id)
    : state.spatialEvidenceVersions.find((item) => item.caseId === report.caseId && item.floorId === floor?.id && item.planVersionId === plan?.id && isFounderConfirmed32DEvidence(item));
  const griddingEvidence = (report.artifact?.griddingEvidenceVersionIds?.length
    ? report.artifact.griddingEvidenceVersionIds.map((id) => state.spatialEvidenceVersions.find((item) => item.id === id && item.caseId === report.caseId && item.floorId === floor?.id && item.planVersionId === plan?.id))
    : state.spatialEvidenceVersions.filter((item) => item.caseId === report.caseId && item.floorId === floor?.id && item.planVersionId === plan?.id
      && item.status === "CURRENT" && Boolean(item.manualEvidencePurpose)))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .map((item) => ({ id: item.id, purpose: item.manualEvidencePurpose!, fullColour: item.fullColour, status: item.status }))
    .sort((left, right) => left.purpose.localeCompare(right.purpose));
  const evaluation = report.artifact?.evaluationSnapshotId
    ? state.evaluationSnapshots.find((item) => item.id === report.artifact?.evaluationSnapshotId && item.floorId === floor?.id)
    : state.evaluationSnapshots.find((item) => item.caseId === report.caseId && item.floorId === floor?.id && item.planVersionId === plan?.id && item.orientationVersionId === orientation?.id);
  const shakti = report.artifact?.shaktiSnapshotId
    ? state.shaktiSnapshots.find((item) => item.id === report.artifact?.shaktiSnapshotId && item.floorId === floor?.id)
    : state.shaktiSnapshots.find((item) => item.caseId === report.caseId && item.floorId === floor?.id && item.planVersionId === plan?.id && item.orientationVersionId === orientation?.id);
  const openings = state.openingMappings.filter((item) => item.caseId === report.caseId && item.floorId === floor?.id && item.planVersionId === plan?.id && item.orientationVersionId === orientation?.id).map((item) => ({
    kind: item.kind, markerX: item.markerX, markerY: item.markerY, verified: item.verified,
    methodologyStatus: item.methodologyStatus, methodologyVersionId: item.methodologyVersionId ?? null, directionCode: item.directionCode ?? null
  })).sort((left, right) => left.kind.localeCompare(right.kind) || left.markerX - right.markerX || left.markerY - right.markerY);
  const entranceZones = (report.artifact?.entranceZoneVersionIds?.length
    ? report.artifact.entranceZoneVersionIds.map((id) => (state.entranceZoneVersions ?? []).find((item) => item.id === id && item.caseId === report.caseId && item.status === "CURRENT" && (item.scope === "PROPERTY_MAIN_GATE" || item.floorId === floor?.id)))
    : (state.entranceZoneVersions ?? []).filter((item) => item.caseId === report.caseId && item.status === "CURRENT" && (item.scope === "PROPERTY_MAIN_GATE" || item.floorId === floor?.id)))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .map((item) => ({ id: item.id, scope: item.scope, zoneCode: item.zoneCode, classification: item.classificationSnapshot ?? item.zoneNameSnapshot,
      catalogVersionId: item.catalogVersionId ?? item.methodologyVersionId, catalogContentHash: item.catalogContentHash ?? item.methodologyContentHash, ownerInterpretationHash: item.ownerInterpretationHash ?? null,
      methodologyVersionId: item.methodologyVersionId, marked32EvidenceVersionId: item.marked32DEvidenceVersionId, planVersionId: item.planVersionId, sourceFloorId: item.sourceFloorId }))
    .sort((left, right) => left.scope.localeCompare(right.scope));
  const spaces = state.spaceMappings.filter((item) => item.caseId === report.caseId && item.floorId === floor?.id && item.planVersionId === plan?.id && item.orientationVersionId === orientation?.id).map((item) => ({
    spaceLabel: item.spaceLabel, polygon: item.polygon, verified: item.verified,
    methodologyStatus: item.methodologyStatus, methodologyVersionId: item.methodologyVersionId ?? null, directionCode: item.directionCode ?? null
  })).sort((left, right) => left.spaceLabel.localeCompare(right.spaceLabel));
  const manualUtilitySheet = report.artifact?.manualUtilitySheetDocumentId
    ? (state.caseDocuments ?? []).find((item) => item.id === report.artifact?.manualUtilitySheetDocumentId && item.caseId === report.caseId && item.floorLabel === floor?.floorLabel)
    : currentApprovedManualUtilitySheet(state, caseRecord, floor);
  const { analysis: siteAnalysis, findings: postSiteFindings } = latestApprovedSiteRecords(state, report, floor);
  const belongsToFloor = (item: { caseId: string; floorId?: string }) => item.caseId === report.caseId && item.floorId === floor?.id;
  const assessment = {
    observations: state.assessmentObservations.filter(belongsToFloor).map((item) => ({ title: item.title, observation: item.observation, alignmentStatus: item.alignmentStatus, energyStatus: item.energyStatus, placementStatus: item.placementStatus })).sort(stableTextOrder),
    recommendations: state.recommendations.filter(belongsToFloor).map((item) => ({ title: item.title, rationale: item.rationale, action: item.action, decisionPriority: item.decisionPriority, attentionClass: item.attentionClass, implementationHorizon: item.implementationHorizon, level: item.level })).sort(stableTextOrder),
    implementationTasks: state.implementationTasks.filter(belongsToFloor).map((item) => ({ title: item.title, status: item.status, implementationHorizon: item.implementationHorizon, ownerRole: item.ownerRole, ownerName: item.ownerName })).sort(stableTextOrder)
  };
  const includeIntake = intakeOverride !== undefined || !report.artifact || report.artifact.intakeSnapshot !== undefined;
  const intake = intakeOverride ?? resolveReportIntakeProjection(state, report, client?.id);
  return {
    report: { id: report.id, caseId: report.caseId, floorId: report.floorId ?? null, versionLabel: report.versionLabel, isPreview: report.isPreview },
    case: caseRecord ? { id: caseRecord.id, caseNumber: caseRecord.caseNumber, projectId: caseRecord.projectId ?? null, serviceType: caseRecord.serviceType ?? null, serviceTemplateVersion: caseRecord.serviceTemplateVersion ?? null, scopeVersion: caseRecord.scopeVersion ?? null } : null,
    client: client ? { id: client.id, displayName: client.displayName, city: client.city } : null,
    ...(includeIntake ? { intake } : {}),
    floor: floor ? { id: floor.id, floorLabel: floor.floorLabel } : null,
    plan: plan ? { id: plan.id, versionLabel: plan.versionLabel, status: plan.status } : null,
    orientation: orientation ? { id: orientation.id, exactDegree: orientation.exactDegree, status: orientation.status, googleEarthEvidenceVersionId: orientation.googleEarthEvidenceVersionId } : null,
    handMarkedEvidence: markedEvidence ? { id: markedEvidence.id, fullColour: markedEvidence.fullColour, status: markedEvidence.status, planVersionId: markedEvidence.planVersionId ?? null } : null,
    griddingEvidence,
    manualUtilitySheet: manualUtilitySheet ? { id: manualUtilitySheet.id, floorLabel: manualUtilitySheet.floorLabel ?? null, versionLabel: manualUtilitySheet.versionLabel, documentDate: manualUtilitySheet.documentDate ?? null, status: "FOUNDER_APPROVED" as const } : null,
    siteAnalysis: siteAnalysis ? { version: siteAnalysis.version, evidenceType: siteAnalysis.evidenceType, capturedAt: siteAnalysis.capturedAt, observations: siteAnalysis.observations, stageAVerdictVersion: siteAnalysis.stageAVerdictVersion } : null,
    postSiteFindings: postSiteFindings ? { version: postSiteFindings.version, differences: postSiteFindings.differences, corrections: postSiteFindings.corrections, newFindings: postSiteFindings.newFindings, additionalObservations: postSiteFindings.additionalObservations } : null,
    entranceZones, openings, spaces, evaluation: evaluation ?? null, shakti: shakti ?? null, assessment,
    templateVersion: V3_REPORT_TEMPLATE_VERSION,
    watermark: report.isPreview ? PREVIEW_WATERMARK : null
  };
}

/**
 * v4 adds the approved Utility graph framing layer and optional AOU snapshot
 * without changing the historical v3 composition. The base lineage remains
 * exact floor/plan/orientation/evaluation-bound.
 */
export function buildV4FloorReportComposition(state: AppState, report: ReportVersionRecord, intakeOverride?: ClientSafeIntakeSnapshot) {
  const base = buildFloorReportComposition(state, report, intakeOverride);
  const utilityVerdicts = (state.utilityVerdicts ?? []).filter((item) =>
    item.caseId === report.caseId && item.floorId === base.floor?.id && item.planVersionId === base.plan?.id &&
    item.orientationVersionId === base.orientation?.id && item.utilityEvaluationSnapshotId === base.evaluation?.id &&
    item.status === "APPROVED" && (!report.artifact?.utilityVerdictIds || report.artifact.utilityVerdictIds.includes(item.id))
  ).sort((left, right) => left.element.localeCompare(right.element)).map((item) => ({
    element: item.element, directionSet: item.directionSet, bars: item.bars, lines: item.lines,
    verdict: item.verdict ?? null, solutionFraming: item.solutionFraming ?? null, status: item.status,
    triggeredDirections: item.triggeredDirections, matchedConditions: item.matchedConditions,
    explanation: item.explanation, inputHash: item.inputHash, outputHash: item.outputHash,
    methodologyVersionId: item.methodologyVersionId, utilityWorkbookHash: item.utilityWorkbookHash,
    utilityWorkbookVersion: item.utilityWorkbookVersion
  }));
  return { ...base, utilityVerdicts, aouReferenceSnapshot: report.artifact?.aouReferenceSnapshot ?? null, templateVersion: V4_REPORT_TEMPLATE_VERSION };
}

function legacyCanonicalReportPayload(state: AppState, report: ReportVersionRecord) {
  const caseRecord = state.vastuCases.find((item) => item.id === report.caseId);
  const client = state.clients.find((item) => item.id === caseRecord?.clientId);
  const evaluation = report.artifact?.evaluationSnapshotId
    ? state.evaluationSnapshots.find((item) => item.id === report.artifact?.evaluationSnapshotId)
    : state.evaluationSnapshots.find((item) => item.caseId === report.caseId);
  const shakti = report.artifact?.shaktiSnapshotId
    ? state.shaktiSnapshots.find((item) => item.id === report.artifact?.shaktiSnapshotId)
    : state.shaktiSnapshots.find((item) => item.caseId === report.caseId);
  return canonicalize({
    schemaVersion: "report-content/v1",
    report: { id: report.id, caseId: report.caseId, versionLabel: report.versionLabel, isPreview: report.isPreview },
    case: caseRecord ? { id: caseRecord.id, caseNumber: caseRecord.caseNumber } : null,
    client: client ? { id: client.id, displayName: client.displayName, city: client.city } : null,
    evaluation: evaluation ?? null,
    shakti: shakti ?? null,
    templateVersion: LEGACY_REPORT_TEMPLATE_VERSION,
    watermark: report.isPreview ? PREVIEW_WATERMARK : null
  });
}

export function canonicalReportPayload(state: AppState, report: ReportVersionRecord, intakeOverride?: ClientSafeIntakeSnapshot) {
  if (report.artifact?.templateVersion === LEGACY_REPORT_TEMPLATE_VERSION) return legacyCanonicalReportPayload(state, report);
  if (report.artifact?.templateVersion === V2_REPORT_TEMPLATE_VERSION || (!report.artifact && !report.floorId)) {
    return canonicalize({ schemaVersion: "report-content/v2", ...buildReportComposition(state, report, intakeOverride), ...(report.artifact?.documentTemplateSnapshot ? { documentTemplateSnapshot: report.artifact.documentTemplateSnapshot } : {}) });
  }
  if (report.artifact?.templateVersion === V3_REPORT_TEMPLATE_VERSION) {
    return canonicalize({ schemaVersion: "report-content/v3", ...buildFloorReportComposition(state, report, intakeOverride), ...(report.artifact?.documentTemplateSnapshot ? { documentTemplateSnapshot: report.artifact.documentTemplateSnapshot } : {}) });
  }
  if (report.artifact?.templateVersion === V5_REPORT_TEMPLATE_VERSION) {
    return canonicalize({ schemaVersion: "report-content/v5", ...buildV4FloorReportComposition(state, report, intakeOverride), stageBRenderManifest: report.artifact.stageBRenderManifest,
      ...(report.artifact.sectionARenderManifest ? { sectionARenderManifest: report.artifact.sectionARenderManifest } : {}),
      ...(report.artifact.sectionCRenderManifest ? { sectionCRenderManifest: report.artifact.sectionCRenderManifest } : {}),
      ...(report.artifact.remediationReportIntegrity ? { remediationReportIntegrity: report.artifact.remediationReportIntegrity } : {}),
      ...(report.artifact.documentTemplateSnapshot ? { documentTemplateSnapshot: report.artifact.documentTemplateSnapshot } : {}) });
  }
  return canonicalize({ schemaVersion: "report-content/v4", ...buildV4FloorReportComposition(state, report, intakeOverride), ...(report.artifact?.documentTemplateSnapshot ? { documentTemplateSnapshot: report.artifact.documentTemplateSnapshot } : {}) });
}

export async function sha256Hex(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createArtifactManifest(state: AppState, report: ReportVersionRecord, actor: AppUser): Promise<ReportArtifactManifest> {
  const caseRecord = state.vastuCases.find((item) => item.id === report.caseId);
  const intakeSnapshot = buildClientSafeIntakeProjection(state, caseRecord?.clientId);
  if (report.floorId) {
    const floor = state.floorWorkspaces.find((item) => item.id === report.floorId && item.caseId === report.caseId && item.projectId === caseRecord?.projectId);
    const plan = state.planVersions.find((item) => item.caseId === report.caseId && item.floorId === floor?.id && item.status === "CURRENT");
    const orientation = state.orientationVersions.find((item) => item.caseId === report.caseId && item.status === "LOCKED");
    const markedEvidence = state.spatialEvidenceVersions.find((item) => item.caseId === report.caseId && item.floorId === floor?.id && item.planVersionId === plan?.id && isFounderConfirmed32DEvidence(item));
    const griddingEvidenceVersionIds = state.spatialEvidenceVersions.filter((item) => item.caseId === report.caseId && item.floorId === floor?.id && item.planVersionId === plan?.id
      && item.status === "CURRENT" && Boolean(item.manualEvidencePurpose)).map((item) => item.id).sort();
    const entranceZoneVersionIds = (state.entranceZoneVersions ?? []).filter((item) => item.caseId === report.caseId && item.status === "CURRENT" && (item.scope === "PROPERTY_MAIN_GATE" || item.floorId === floor?.id)).map((item) => item.id).sort();
    const evaluation = state.evaluationSnapshots.find((item) => item.caseId === report.caseId && item.floorId === floor?.id && item.planVersionId === plan?.id && item.orientationVersionId === orientation?.id);
    const shakti = state.shaktiSnapshots.find((item) => item.caseId === report.caseId && item.floorId === floor?.id && item.planVersionId === plan?.id && item.orientationVersionId === orientation?.id);
    const finalisedStageB = (state.stageBRemediations ?? []).find((item) => item.caseId === report.caseId && item.floorId === floor?.id && item.state === "PAGE_FINALISED");
    const nativeV1FinalReport = finalisedStageB?.architectureVersion === "V1";
    if (!floor || !plan || (!nativeV1FinalReport && (!orientation || !markedEvidence || !entranceZoneVersionIds.length || !evaluation || !shakti))) throw new Error("A floor report requires exact current plan, locked orientation, full-colour marked evidence, at least one current entrance zone, Utility evaluation, and Shakti evaluation lineage.");
    const utilityVerdicts = (state.utilityVerdicts ?? []).filter((item) => item.caseId === report.caseId && item.floorId === floor?.id && item.planVersionId === plan?.id && item.orientationVersionId === orientation?.id && item.utilityEvaluationSnapshotId === evaluation?.id && item.status === "APPROVED");
    let aouReferenceSnapshot: ReportArtifactManifest["aouReferenceSnapshot"];
    if (caseRecord?.organisationId && !nativeV1FinalReport) {
      const aouReadiness = getAouReadiness(state, caseRecord.organisationId);
      if (aouReadiness.ready && aouReadiness.version) {
        try {
          aouReferenceSnapshot = selectAouSnapshotForVerdicts({ state, organisationId: caseRecord.organisationId, actor,
            methodologyVersionId: aouReadiness.version.id, verdictContexts: utilityVerdicts.map((item) => ({ element: item.element, directionSet: item.directionSet })) });
        } catch (error) {
          if (!report.isPreview) throw error;
        }
      } else if (!report.isPreview) throw new Error(`${aouReadiness.status}: ${aouReadiness.reason}`);
    }
    const manualUtilitySheet = currentApprovedManualUtilitySheet(state, caseRecord, floor);
    const { analysis: siteAnalysis, findings: postSiteFindings } = latestApprovedSiteRecords(state, report, floor);
    if (caseRecord?.organisationId && !nativeV1FinalReport && !utilityVerdicts.length) throw new Error("A Founder floor report requires at least one approved Utility bar-graph verdict bound to the exact Utility evaluation.");
    if (caseRecord?.organisationId && !nativeV1FinalReport && !manualUtilitySheet) throw new Error("A floor report requires a Founder-approved original manual utility sheet for this floor.");
    if (caseRecord?.organisationId && !nativeV1FinalReport && !report.isPreview && (!siteAnalysis || !postSiteFindings)) throw new Error("The official floor report requires approved Site Analysis and Post-Site Findings linked to the presented Stage A verdict.");
    const stageBRenderManifest = finalisedStageB ? buildStageBRenderManifest(state, finalisedStageB.id) : undefined;
    const sectionAWorkspace = finalisedStageB ? state.sectionAWorkspaces.find((item) => item.remediationId === finalisedStageB.id) : undefined;
    const sectionARenderManifest = sectionAWorkspace ? buildSectionARenderManifest(state, sectionAWorkspace.id) : undefined;
    const sectionCWorkspace = finalisedStageB ? state.sectionCWorkspaces.find((item) => item.remediationId === finalisedStageB.id) : undefined;
    const sectionCRenderManifest = sectionCWorkspace ? buildSectionCRenderManifest(state, sectionCWorkspace.id) : undefined;
    const reportIntegrityRun = sectionAWorkspace && finalisedStageB ? validateRemediationReportIntegrity({ remediationId: finalisedStageB.id, actor }) : undefined;
    if (reportIntegrityRun && reportIntegrityRun.status !== "PASS") throw new Error(`Remediation report integrity failed: ${reportIntegrityRun.issues.map((item) => item.code).join(", ")}`);
    const client = state.clients.find((item) => item.id === caseRecord?.clientId); const project = state.projects.find((item) => item.id === caseRecord?.projectId);
    const resolvedDocumentTemplate = resolveDocumentTemplateSnapshot(state, { organisationId: caseRecord?.organisationId ?? actor.organisationId ?? "legacy",
      family: stageBRenderManifest ? "VASTU_REMEDY_REPORT" : "FOUNDER_FLOOR_REPORT", documentFields: { "Client Name": client?.displayName ?? "", "Project Name": project?.propertyName ?? project?.id ?? "", "Floor": floor.floorLabel,
        "Report Date": new Date().toISOString().slice(0, 10), "Version ID": report.versionLabel, "Consultant": actor.fullName } });
    const documentTemplateSnapshot = resolvedDocumentTemplate.source === "CENTRAL" ? resolvedDocumentTemplate : undefined;
    const manifest: ReportArtifactManifest = {
      schemaVersion: "report-artifact/v1", mediaType: "text/html", createdAt: new Date().toISOString(),
      createdBy: { id: actor.id, name: actor.fullName, role: actor.role }, templateVersion: stageBRenderManifest ? V5_REPORT_TEMPLATE_VERSION : REPORT_TEMPLATE_VERSION,
      ...(evaluation ? { evaluationSnapshotId: evaluation.id } : {}), utilityVerdictIds: utilityVerdicts.map((item) => item.id), ...(shakti ? { shaktiSnapshotId: shakti.id } : {}), floorId: floor.id, planVersionId: plan.id,
      ...(orientation ? { orientationVersionId: orientation.id } : {}), ...(markedEvidence ? { handMarkedEvidenceVersionId: markedEvidence.id } : {}),
      ...(griddingEvidenceVersionIds.length ? { griddingEvidenceVersionIds } : {}),
      entranceZoneVersionIds,
      ...(manualUtilitySheet ? { manualUtilitySheetDocumentId: manualUtilitySheet.id } : {}),
      ...(siteAnalysis ? { siteAnalysisId: siteAnalysis.id } : {}), ...(postSiteFindings ? { postSiteFindingsId: postSiteFindings.id } : {}),
      ...(aouReferenceSnapshot ? { aouReferenceSnapshot } : {}),
      ...(stageBRenderManifest ? { stageBRenderManifest } : {}),
      ...(sectionARenderManifest ? { sectionARenderManifest } : {}),
      ...(sectionCRenderManifest ? { sectionCRenderManifest } : {}),
      ...(reportIntegrityRun ? { remediationReportIntegrity: { runId: reportIntegrityRun.id, scopeHash: reportIntegrityRun.scopeHash, status: "PASS" as const } } : {}),
      ...(documentTemplateSnapshot ? { documentTemplateSnapshot } : {}),
      contentHash: "", immutable: true,
      downloadPath: `/api/reports/${encodeURIComponent(report.id)}/print`, intakeSnapshot
    };
    report.artifact = manifest;
    manifest.contentHash = await sha256Hex(canonicalReportPayload(state, report, intakeSnapshot));
    return manifest;
  }
  const evaluation = state.evaluationSnapshots.find((item) => item.caseId === report.caseId);
  const shakti = state.shaktiSnapshots.find((item) => item.caseId === report.caseId);
  const client = state.clients.find((item) => item.id === caseRecord?.clientId); const resolvedDocumentTemplate = resolveDocumentTemplateSnapshot(state, { organisationId: caseRecord?.organisationId ?? actor.organisationId ?? "legacy", family: "FOUNDER_FLOOR_REPORT",
    documentFields: { "Client Name": client?.displayName ?? "", "Project Name": caseRecord?.projectId ?? "", "Report Date": new Date().toISOString().slice(0, 10), "Version ID": report.versionLabel, "Consultant": actor.fullName } });
  const documentTemplateSnapshot = resolvedDocumentTemplate.source === "CENTRAL" ? resolvedDocumentTemplate : undefined;
  const manifest: ReportArtifactManifest = {
    schemaVersion: "report-artifact/v1",
    mediaType: "text/html",
    createdAt: new Date().toISOString(),
    createdBy: { id: actor.id, name: actor.fullName, role: actor.role },
    templateVersion: V2_REPORT_TEMPLATE_VERSION,
    evaluationSnapshotId: evaluation?.id,
    shaktiSnapshotId: shakti?.id,
    ...(documentTemplateSnapshot ? { documentTemplateSnapshot } : {}),
    contentHash: "",
    immutable: true,
    downloadPath: `/api/reports/${encodeURIComponent(report.id)}/print`,
    intakeSnapshot
  };
  report.artifact = manifest; manifest.contentHash = await sha256Hex(canonicalReportPayload(state, report, intakeSnapshot)); return manifest;
}

export async function artifactStillMatches(state: AppState, report: ReportVersionRecord) {
  if (!report.artifact) return false;
  return report.artifact.contentHash === await sha256Hex(canonicalReportPayload(state, report));
}
