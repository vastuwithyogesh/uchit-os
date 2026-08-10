import type { AppState } from "@/lib/store";
import type { AppUser, ClientSafeIntakeSnapshot, ReportArtifactManifest, ReportVersionRecord } from "@/lib/domain";

export const LEGACY_REPORT_TEMPLATE_VERSION = "uchit-verdict/v1";
export const REPORT_TEMPLATE_VERSION = "uchit-verdict/v2";
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
    templateVersion: REPORT_TEMPLATE_VERSION,
    watermark: report.isPreview ? PREVIEW_WATERMARK : null
  };
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
  return canonicalize({ schemaVersion: "report-content/v2", ...buildReportComposition(state, report, intakeOverride) });
}

export async function sha256Hex(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createArtifactManifest(state: AppState, report: ReportVersionRecord, actor: AppUser): Promise<ReportArtifactManifest> {
  const evaluation = state.evaluationSnapshots.find((item) => item.caseId === report.caseId);
  const shakti = state.shaktiSnapshots.find((item) => item.caseId === report.caseId);
  const caseRecord = state.vastuCases.find((item) => item.id === report.caseId);
  const intakeSnapshot = buildClientSafeIntakeProjection(state, caseRecord?.clientId);
  return {
    schemaVersion: "report-artifact/v1",
    mediaType: "text/html",
    createdAt: new Date().toISOString(),
    createdBy: { id: actor.id, name: actor.fullName, role: actor.role },
    templateVersion: REPORT_TEMPLATE_VERSION,
    evaluationSnapshotId: evaluation?.id,
    shaktiSnapshotId: shakti?.id,
    contentHash: await sha256Hex(canonicalReportPayload(state, report, intakeSnapshot)),
    immutable: true,
    downloadPath: `/api/reports/${encodeURIComponent(report.id)}/print`,
    intakeSnapshot
  };
}

export async function artifactStillMatches(state: AppState, report: ReportVersionRecord) {
  if (!report.artifact) return false;
  return report.artifact.contentHash === await sha256Hex(canonicalReportPayload(state, report));
}
