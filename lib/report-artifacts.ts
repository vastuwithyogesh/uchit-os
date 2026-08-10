import type { AppState } from "@/lib/store";
import type { AppUser, ReportArtifactManifest, ReportVersionRecord } from "@/lib/domain";

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

export function buildReportComposition(state: AppState, report: ReportVersionRecord) {
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
    floors,
    evaluation: evaluation ?? null,
    shakti: shakti ?? null,
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

export function canonicalReportPayload(state: AppState, report: ReportVersionRecord) {
  if (report.artifact?.templateVersion === LEGACY_REPORT_TEMPLATE_VERSION) return legacyCanonicalReportPayload(state, report);
  return canonicalize({ schemaVersion: "report-content/v2", ...buildReportComposition(state, report) });
}

export async function sha256Hex(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createArtifactManifest(state: AppState, report: ReportVersionRecord, actor: AppUser): Promise<ReportArtifactManifest> {
  const evaluation = state.evaluationSnapshots.find((item) => item.caseId === report.caseId);
  const shakti = state.shaktiSnapshots.find((item) => item.caseId === report.caseId);
  return {
    schemaVersion: "report-artifact/v1",
    mediaType: "text/html",
    createdAt: new Date().toISOString(),
    createdBy: { id: actor.id, name: actor.fullName, role: actor.role },
    templateVersion: REPORT_TEMPLATE_VERSION,
    evaluationSnapshotId: evaluation?.id,
    shaktiSnapshotId: shakti?.id,
    contentHash: await sha256Hex(canonicalReportPayload(state, report)),
    immutable: true,
    downloadPath: `/api/reports/${encodeURIComponent(report.id)}/print`
  };
}

export async function artifactStillMatches(state: AppState, report: ReportVersionRecord) {
  if (!report.artifact) return false;
  return report.artifact.contentHash === await sha256Hex(canonicalReportPayload(state, report));
}
