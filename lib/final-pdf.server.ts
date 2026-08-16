import { migrateD1 } from "@/db/migrations";
import { readCaseFileEvidenceForReport } from "@/lib/case-file-assets.server";
import type { AppUser, BrandingMediaReference, DocumentDeliveryRecord, DocumentTemplateSnapshot, ReportVersionRecord } from "@/lib/domain";
import type { FounderFoundationContext } from "@/lib/foundation";
import { getStageAFloorReviewBlockers } from "@/lib/founder-regeneration";
import { artifactStillMatches } from "@/lib/report-artifacts";
import { renderPrintableReport } from "@/lib/report-html";
import { inspectProtectedPdf, renderProtectedPdf } from "@/lib/protected-pdf-renderer";
import { getRuntimeEnv, type D1DatabaseBinding } from "@/lib/runtime-env";
import { normalizeCaseService } from "@/lib/service-framework";
import { getAppState, setAppState, type AppState } from "@/lib/store";
import { releaseVerdict } from "@/lib/workflow-service";

export type FinalPdfStatus = "GENERATED" | "VERIFIED" | "RELEASED" | "SUPERSEDED";
export type FinalPdfEventType = "GENERATION_REQUESTED" | "GENERATED" | "GENERATION_FAILED" | "INTEGRITY_VERIFIED" | "VERIFICATION_FAILED" | "RELEASED" | "EXPORTED" | "PRINTED" | "SUPERSEDED";

type FinalPdfRow = {
  artifact_id: string; organisation_id: string; report_version_id: string; report_version_label: string;
  case_id: string; project_id: string; floor_id: string; report_template_version: string;
  source_snapshot_hash: string; artifact_hash_sha256: string; object_key: string; mime_type: string;
  size_bytes: number; page_count: number; renderer_version: string; page_configuration: string;
  embedded_evidence_checksums_json: string; generated_at: string; verified_at: string | null;
  released_at: string | null; released_by_actor_id: string | null; security_profile: string;
  status: FinalPdfStatus; generation_idempotency_key: string; record_version: number;
};

type Binding = {
  report: ReportVersionRecord; caseRecord: AppState["vastuCases"][number]; project: AppState["projects"][number];
  floor: AppState["floorWorkspaces"][number]; evidence: AppState["spatialEvidenceVersions"][number]; manualSheet?: AppState["caseDocuments"][number];
};

export type ProtectedPdfDeliveryDescriptor = {
  artifactId: string; organisationId: string; reportId: string; reportVersionLabel: string;
  caseId: string; projectId: string; floorId: string; reportTemplateVersion: string;
  sourceSnapshotHash: string; artifactHashSha256: string; mimeType: "application/pdf";
  sizeBytes: number; pageCount: number; status: FinalPdfStatus; verifiedAt?: string; releasedAt?: string;
};

export class FinalPdfError extends Error {
  constructor(readonly statusCode: 400 | 403 | 404 | 409 | 428 | 503, message: string) {
    super(message); this.name = "FinalPdfError";
  }
}

function db(): D1DatabaseBinding {
  const value = getRuntimeEnv().DB;
  if (!value) throw new FinalPdfError(503, "Protected PDF durable storage is unavailable.");
  return value;
}

function text(value: unknown, label: string, max = 160) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new FinalPdfError(400, `${label} is required and must be ${max} characters or fewer.`);
  return value.trim();
}

function assertFounder(context: FounderFoundationContext, actor: AppUser) {
  if (!context.isFounderEdition || context.organisation.founderUserId !== actor.id || context.membership.userId !== actor.id
    || context.membership.role !== "SUPER_ADMIN" || context.membership.capability !== "organisation_owner") {
    throw new FinalPdfError(403, "Only the active Founder organisation owner may generate, verify, release, export, or print final PDFs.");
  }
  // Founder PDF operations remain owner-only. Client access is gated separately by
  // an exact DELIVERED DocumentDeliveryRecord pinned to this protected artifact.
}

function binding(state: AppState, reportIdValue: unknown, organisationId: string): Binding {
  const reportId = text(reportIdValue, "Report version ID");
  const report = state.reportVersions.find((item) => item.id === reportId && item.organisationId === organisationId);
  if (!report) throw new FinalPdfError(404, "Final report version was not found in this organisation.");
  const caseRecord = state.vastuCases.find((item) => item.id === report.caseId && item.organisationId === organisationId);
  const project = caseRecord?.projectId ? state.projects.find((item) => item.id === caseRecord.projectId && item.organisationId === organisationId && item.activeCaseId === caseRecord.id) : undefined;
  const floor = report.floorId ? state.floorWorkspaces.find((item) => item.id === report.floorId && item.caseId === caseRecord?.id && item.projectId === project?.id && item.organisationId === organisationId) : undefined;
  if (!caseRecord || !project || !floor) throw new FinalPdfError(404, "Report, case, project, and floor scope do not match.");
  if (report.isPreview) throw new FinalPdfError(403, "Internal preview reports cannot be downloaded, printed, exported, or converted into a final PDF.");
  if (!(report.artifact?.templateVersion === "uchit-verdict/v3" || report.artifact?.templateVersion === "uchit-verdict/v4" || report.artifact?.templateVersion === "uchit-verdict/v5") || report.artifact.floorId !== floor.id) throw new FinalPdfError(409, "Protected final PDF requires an exact one-floor v3/v4/v5 report artifact.");
  if (report.artifact.templateVersion === "uchit-verdict/v5" && report.artifact.stageBRenderManifest?.integrityStatus !== "PASS") throw new FinalPdfError(409, "Protected final PDF requires Stage B integrity PASS.");
  if (report.artifact.templateVersion === "uchit-verdict/v5" && report.artifact.sectionARenderManifest
    && (report.artifact.sectionARenderManifest.integrityStatus !== "PASS" || report.artifact.remediationReportIntegrity?.status !== "PASS")) {
    throw new FinalPdfError(409, "Protected final PDF requires Section A and report-wide integrity PASS.");
  }
  if (report.artifact.templateVersion === "uchit-verdict/v5" && report.artifact.sectionCRenderManifest
    && report.artifact.sectionCRenderManifest.integrityStatus !== "PASS") {
    throw new FinalPdfError(409, "Protected final PDF requires Section C Extras integrity PASS.");
  }
  const evidence = state.spatialEvidenceVersions.find((item) => item.id === report.artifact?.handMarkedEvidenceVersionId
    && item.organisationId === organisationId && item.projectId === project.id && item.caseId === caseRecord.id && item.floorId === floor.id
    && item.planVersionId === report.artifact?.planVersionId && item.kind === "HAND_MARKED_PLAN" && item.status === "CURRENT" && item.fullColour);
  if (!evidence) throw new FinalPdfError(409, "Current original full-colour hand-marked evidence is required for this exact floor report.");
  const manualSheet = report.artifact.manualUtilitySheetDocumentId
    ? state.caseDocuments.find((item) => item.id === report.artifact?.manualUtilitySheetDocumentId && item.caseId === caseRecord.id && item.caseRevisionNumber === (caseRecord.revisionNumber ?? 1)
      && item.serviceType === (caseRecord.serviceType ?? "EXISTING_SPACE") && item.assetType === "MANUAL_UTILITY_SHEET" && item.floorLabel === floor.floorLabel
      && item.isCurrent && item.revisionStatus === "VERIFIED" && Boolean(item.verified) && !item.blocker && !item.discrepancy && item.founderApprovalStatus === "APPROVED") : undefined;
  if (report.artifact.manualUtilitySheetDocumentId && !manualSheet) throw new FinalPdfError(409, "Founder-approved manual utility sheet is missing from this exact floor report.");
  return { report, caseRecord, project, floor, evidence, ...(manualSheet ? { manualSheet } : {}) };
}

function assertVersions(input: { expectedRecordVersion: unknown; expectedRevision: unknown }, report: ReportVersionRecord, revision: number | null) {
  if (!Number.isInteger(input.expectedRecordVersion) || Number(input.expectedRecordVersion) < 0 || !Number.isInteger(input.expectedRevision) || Number(input.expectedRevision) < 0) {
    throw new FinalPdfError(428, "The latest report and state versions are required.");
  }
  if ((report.recordVersion ?? 0) !== Number(input.expectedRecordVersion) || revision !== Number(input.expectedRevision)) {
    throw new FinalPdfError(409, "The report or saved state changed. Reload the exact floor report before continuing.");
  }
}

async function sha256(bytes: Uint8Array) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.slice().buffer));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function objectBytes(objectKey: string) {
  const object = await getRuntimeEnv().R2?.get(objectKey);
  if (!object) throw new FinalPdfError(409, "The immutable PDF bytes are unavailable from private storage.");
  const reader = object.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  for (;;) { const result = await reader.read(); if (result.done) break; chunks.push(result.value); size += result.value.length; }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

async function readTemplateImage(state: AppState, organisationId: string, ref: BrandingMediaReference, title: string) {
  const version = state.mediaAssetVersions.find((item) => item.organisationId === organisationId && item.id === ref.assetVersionId && item.assetId === ref.assetId && item.checksumSha256 === ref.checksumSha256 && ["FOUNDER_APPROVED", "ACTIVE"].includes(item.status));
  if (!version) throw new FinalPdfError(409, `The immutable template media for ${title} is missing or no longer valid.`);
  if (version.mimeType !== "image/png" && version.mimeType !== "image/jpeg") throw new FinalPdfError(409, `${title} must use an approved PNG or JPEG derivative for the protected PDF renderer.`);
  const object = await getRuntimeEnv().R2?.get(version.privateObjectKey); if (!object) throw new FinalPdfError(409, `The immutable template bytes for ${title} are unavailable.`);
  const reader = object.body.getReader(); const chunks: Uint8Array[] = []; let size = 0; for (;;) { const result = await reader.read(); if (result.done) break; chunks.push(result.value); size += result.value.length; }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  if (await sha256(bytes) !== ref.checksumSha256.toLowerCase()) throw new FinalPdfError(409, `The immutable template checksum for ${title} does not match its snapshot.`);
  return { bytes, mimeType: version.mimeType, checksumSha256: ref.checksumSha256, title, assetVersionId: ref.assetVersionId };
}

async function protectedPdfBranding(state: AppState, organisationId: string, snapshot?: DocumentTemplateSnapshot) {
  if (!snapshot || snapshot.source !== "CENTRAL") return undefined;
  const logo = snapshot.logo.enabled && snapshot.logo.media ? await readTemplateImage(state, organisationId, snapshot.logo.media, "primary logo") : undefined;
  const prefixPages = await Promise.all(snapshot.prefixPages.map((page) => readTemplateImage(state, organisationId, page.media, page.internalTitle)));
  const suffixPages = await Promise.all(snapshot.suffixPages.map((page) => readTemplateImage(state, organisationId, page.media, page.internalTitle)));
  return { snapshotHash: snapshot.snapshotHash, displayName: snapshot.brandDisplayName, headerText: snapshot.documentTemplate.name,
    footerText: snapshot.standardText.confidentialityStatement || snapshot.standardText.contactInformation, accentHex: snapshot.colours.accent, logo, prefixPages, suffixPages };
}

function rowPublic(row: FinalPdfRow) {
  return {
    artifactId: row.artifact_id, reportVersionId: row.report_version_id, reportVersionLabel: row.report_version_label,
    caseId: row.case_id, projectId: row.project_id, floorId: row.floor_id,
    artifactHashSha256: row.artifact_hash_sha256, mimeType: "application/pdf" as const, sizeBytes: Number(row.size_bytes),
    pageCount: Number(row.page_count), rendererVersion: row.renderer_version, generatedAt: row.generated_at,
    verifiedAt: row.verified_at ?? undefined, releasedAt: row.released_at ?? undefined, status: row.status,
    securityProfile: row.security_profile, recordVersion: Number(row.record_version)
  };
}

async function findManifest(database: D1DatabaseBinding, organisationId: string, reportVersionId: string) {
  return database.prepare("SELECT * FROM final_pdf_artifacts WHERE organisation_id=? AND report_version_id=?")
    .bind(organisationId, reportVersionId).first<FinalPdfRow>();
}

function eventStatement(database: D1DatabaseBinding, input: {
  organisationId: string; artifactId?: string; report: Binding; eventType: FinalPdfEventType; actor: AppUser;
  artifactHash?: string; reason: string; requestId: string; idempotencyKey: string;
}) {
  return database.prepare(`INSERT INTO final_pdf_artifact_events
    (event_id,organisation_id,artifact_id,report_version_id,case_id,project_id,floor_id,event_type,actor_user_id,actor_display_name,artifact_hash_sha256,reason,request_id,idempotency_key,occurred_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), input.organisationId, input.artifactId ?? null,
      input.report.report.id, input.report.caseRecord.id, input.report.project.id, input.report.floor.id, input.eventType,
      input.actor.id, input.actor.fullName, input.artifactHash ?? null, input.reason, input.requestId, input.idempotencyKey, new Date().toISOString());
}

async function recordFailure(database: D1DatabaseBinding, input: {
  organisationId: string; artifactId?: string; report: Binding; eventType: "GENERATION_FAILED" | "VERIFICATION_FAILED";
  actor: AppUser; artifactHash?: string; requestId: string; idempotencyKey: string; error: unknown;
}) {
  const safeReason = input.error instanceof Error ? input.error.message.slice(0, 500) : "Protected PDF operation failed safely.";
  try { await eventStatement(database, { ...input, reason: safeReason }).run(); } catch { /* Preserve the original failure; audit storage may itself be unavailable. */ }
}

async function verifyBytes(row: FinalPdfRow) {
  const bytes = await objectBytes(row.object_key);
  if (bytes.length !== Number(row.size_bytes) || await sha256(bytes) !== row.artifact_hash_sha256) throw new FinalPdfError(409, "Protected PDF hash verification failed.");
  const inspection = inspectProtectedPdf(bytes);
  if (!inspection.encrypted || inspection.revision !== 3 || !inspection.printingAllowed || !inspection.editingBlocked
    || !inspection.copyingBlocked || !inspection.pageExtractionBlocked || !inspection.embeddedFilePresent
    || !inspection.validEof || inspection.pageCount !== Number(row.page_count)) {
    throw new FinalPdfError(409, "Protected PDF permissions, embedded evidence, or page structure failed verification.");
  }
  return { bytes, inspection };
}

function deliveryDescriptor(row: FinalPdfRow): ProtectedPdfDeliveryDescriptor {
  return {
    artifactId: row.artifact_id, organisationId: row.organisation_id, reportId: row.report_version_id,
    reportVersionLabel: row.report_version_label, caseId: row.case_id, projectId: row.project_id,
    floorId: row.floor_id, reportTemplateVersion: row.report_template_version,
    sourceSnapshotHash: row.source_snapshot_hash, artifactHashSha256: row.artifact_hash_sha256,
    mimeType: "application/pdf", sizeBytes: Number(row.size_bytes), pageCount: Number(row.page_count),
    status: row.status, ...(row.verified_at ? { verifiedAt: row.verified_at } : {}),
    ...(row.released_at ? { releasedAt: row.released_at } : {})
  };
}

/**
 * Delivery-specific read seam. Unlike Founder operations it does not require
 * the case to remain the project's active revision, so an old delivered
 * artifact remains resolvable after an authorised replacement.
 */
export async function inspectProtectedPdfForDelivery(input: {
  state: AppState; organisationId: string; reportId: string; protectedPdfArtifactId?: string;
}) {
  const database = db(); await migrateD1(database);
  const report = input.state.reportVersions.find((item) => item.id === input.reportId && item.organisationId === input.organisationId);
  const caseRecord = report && input.state.vastuCases.find((item) => item.id === report.caseId && item.organisationId === input.organisationId);
  const project = caseRecord?.projectId ? input.state.projects.find((item) => item.id === caseRecord.projectId && item.organisationId === input.organisationId) : undefined;
  const floor = report?.floorId && input.state.floorWorkspaces.find((item) => item.id === report.floorId && item.caseId === caseRecord?.id && item.projectId === project?.id && item.organisationId === input.organisationId);
  if (!report || !caseRecord || !project || !floor) throw new FinalPdfError(404, "The exact report, case, project, and floor delivery scope was not found.");
  if (report.isPreview || report.artifact?.templateVersion !== "uchit-verdict/v5" || !report.artifact.immutable || report.artifact.floorId !== floor.id) {
    throw new FinalPdfError(409, "Delivery supports only an immutable one-floor uchit-verdict/v5 artifact.");
  }
  const row = await findManifest(database, input.organisationId, report.id);
  if (!row || (input.protectedPdfArtifactId && row.artifact_id !== input.protectedPdfArtifactId)) throw new FinalPdfError(409, "The exact protected PDF artifact is unavailable.");
  if (row.case_id !== caseRecord.id || row.project_id !== project.id || row.floor_id !== floor.id
    || row.report_template_version !== report.artifact.templateVersion || row.source_snapshot_hash !== report.artifact.contentHash) {
    throw new FinalPdfError(409, "The protected PDF identity does not match the immutable report artifact.");
  }
  await verifyBytes(row);
  return deliveryDescriptor(row);
}

export async function readDeliveredProtectedPdf(input: {
  state: AppState; delivery: DocumentDeliveryRecord; actor: AppUser; mode: "view" | "download"; requestId: string;
}) {
  if (input.delivery.status !== "DELIVERED" && input.delivery.status !== "ACKNOWLEDGED") throw new FinalPdfError(403, "This report has not been delivered to the client.");
  const descriptor = await inspectProtectedPdfForDelivery({ state: input.state, organisationId: input.delivery.organisationId!,
    reportId: input.delivery.reportId, protectedPdfArtifactId: input.delivery.protectedPdfArtifactId });
  if (descriptor.status !== "RELEASED" || descriptor.sourceSnapshotHash !== input.delivery.reportCanonicalHash
    || descriptor.artifactHashSha256 !== input.delivery.protectedPdfChecksumSha256) {
    throw new FinalPdfError(409, "The delivered protected PDF no longer matches its immutable delivery snapshot.");
  }
  const database = db(); const row = await findManifest(database, input.delivery.organisationId!, input.delivery.reportId);
  if (!row) throw new FinalPdfError(409, "The delivered protected PDF is unavailable.");
  const { bytes } = await verifyBytes(row);
  try {
    await database.prepare(`INSERT INTO final_pdf_artifact_events
      (event_id,organisation_id,artifact_id,report_version_id,case_id,project_id,floor_id,event_type,actor_user_id,actor_display_name,artifact_hash_sha256,reason,request_id,idempotency_key,occurred_at)
      VALUES (?,?,?,?,?,?,?,'EXPORTED',?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), input.delivery.organisationId, row.artifact_id, row.report_version_id, row.case_id, row.project_id, row.floor_id,
        input.actor.id, input.actor.fullName, row.artifact_hash_sha256, `Client-authorised ${input.mode} of exact delivery ${input.delivery.id}.`,
        input.requestId, `delivery:${input.delivery.id}:${input.mode}:${input.requestId}`, new Date().toISOString()).run();
  } catch { /* A replayed request ID remains safe; immutable bytes are unchanged. */ }
  const caseNumber = input.state.vastuCases.find((item) => item.id === input.delivery.caseId)?.caseNumber ?? "case";
  const floorLabel = input.state.floorWorkspaces.find((item) => item.id === input.delivery.floorId)?.floorLabel ?? "floor";
  const safeCase = caseNumber.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80) || "case";
  const safeFloor = floorLabel.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80) || "floor";
  return { bytes, fileName: `uchit-${safeCase}-${safeFloor}-${input.delivery.reportVersionLabel.replace(/[^a-z0-9_-]+/gi, "-")}.pdf`, descriptor };
}

async function verifyEvidenceBinding(row: FinalPdfRow, scoped: Binding, organisationId: string) {
  const service = normalizeCaseService(scoped.caseRecord);
  const evidence = await readCaseFileEvidenceForReport(scoped.evidence.protectedFileRef, { organisationId,
    caseId: scoped.caseRecord.id, caseRevisionNumber: scoped.caseRecord.revisionNumber ?? 1,
    serviceType: service.serviceType, floorLabel: scoped.floor.floorLabel });
  let manifest: Array<{ evidenceVersionId?: string; checksumSha256?: string }> = [];
  try { manifest = JSON.parse(row.embedded_evidence_checksums_json); } catch { throw new FinalPdfError(409, "The private PDF evidence manifest is invalid."); }
  const expected = [{ evidenceVersionId: scoped.evidence.id, checksumSha256: evidence.checksumSha256 }, ...(scoped.manualSheet ? [{ evidenceVersionId: scoped.manualSheet.id, checksumSha256: "" }] : [])];
  if (manifest.length !== expected.length || manifest.some((entry, index) => entry.evidenceVersionId !== expected[index]?.evidenceVersionId || (expected[index]?.checksumSha256 && entry.checksumSha256 !== expected[index]?.checksumSha256))) {
    throw new FinalPdfError(409, "The PDF evidence checksum does not match the exact current full-colour hand-marked evidence version.");
  }
  if (scoped.manualSheet) {
    const manual = await readCaseFileEvidenceForReport(scoped.manualSheet.evidenceRef, { organisationId,
      caseId: scoped.caseRecord.id, caseRevisionNumber: scoped.caseRecord.revisionNumber ?? 1,
      serviceType: normalizeCaseService(scoped.caseRecord).serviceType, floorLabel: scoped.floor.floorLabel });
    if (manifest[1]?.evidenceVersionId !== scoped.manualSheet.id || manifest[1]?.checksumSha256 !== manual.checksumSha256) throw new FinalPdfError(409, "The manual utility sheet checksum does not match the exact approved evidence.");
  }
}

function releaseGate(state: AppState, scoped: Binding) {
  if (!scoped.caseRecord.fullPaymentApproved || !scoped.caseRecord.balanceApproved) throw new FinalPdfError(409, "Full balance confirmation is required before protected PDF release.");
  const balance = state.payments.find((item) => item.organisationId === scoped.caseRecord.organisationId && item.caseId === scoped.caseRecord.id && item.type === "BALANCE" && item.status === "APPROVED" && item.proofAssetId);
  if (!balance) throw new FinalPdfError(409, "Exact immutable balance-payment evidence is required before protected PDF release.");
  if (scoped.report.status !== "APPROVED") throw new FinalPdfError(409, "Founder approval is required before protected PDF generation or release.");
  const checkpoints = state.stageAFloorApprovalCheckpoints.filter((item) => item.reportId === scoped.report.id);
  if (!checkpoints.some((item) => item.checkpoint === "FOUNDER_REVIEWED") || !checkpoints.some((item) => item.checkpoint === "FOUNDER_APPROVED")) {
    throw new FinalPdfError(409, "Immutable Founder review and Founder approval checkpoints are required.");
  }
  const blockers = getStageAFloorReviewBlockers(state, scoped.report);
  if (blockers.length) throw new FinalPdfError(409, `Protected PDF is blocked. ${blockers.join(" ")}`);
}

export async function generateFinalPdf(input: {
  state: AppState; revision: number | null; context: FounderFoundationContext; actor: AppUser; reportId: unknown;
  expectedRecordVersion: unknown; expectedRevision: unknown; idempotencyKey: unknown; requestId: string;
}) {
  assertFounder(input.context, input.actor); const database = db(); await migrateD1(database);
  const scoped = binding(input.state, input.reportId, input.context.organisation.id);
  assertVersions(input, scoped.report, input.revision); const key = text(input.idempotencyKey, "Idempotency key");
  const existing = await findManifest(database, input.context.organisation.id, scoped.report.id);
  if (existing) {
    if (existing.source_snapshot_hash !== scoped.report.artifact!.contentHash) throw new FinalPdfError(409, "A different immutable PDF already belongs to this report version.");
    return { artifact: rowPublic(existing), replayed: true };
  }
  try {
  releaseGate(input.state, scoped);
  if (!await artifactStillMatches(input.state, scoped.report)) throw new FinalPdfError(409, "The approved source snapshot hash no longer matches the v3/v4 report composition.");
  const service = normalizeCaseService(scoped.caseRecord);
  const evidence = await readCaseFileEvidenceForReport(scoped.evidence.protectedFileRef, {
    organisationId: input.context.organisation.id, caseId: scoped.caseRecord.id,
    caseRevisionNumber: scoped.caseRecord.revisionNumber ?? 1, serviceType: service.serviceType, floorLabel: scoped.floor.floorLabel
  });
  const manualEvidence = scoped.manualSheet ? await readCaseFileEvidenceForReport(scoped.manualSheet.evidenceRef, {
    organisationId: input.context.organisation.id, caseId: scoped.caseRecord.id,
    caseRevisionNumber: scoped.caseRecord.revisionNumber ?? 1, serviceType: service.serviceType, floorLabel: scoped.floor.floorLabel
  }) : undefined;
  const ownerSecret = getRuntimeEnv().PDF_OWNER_SECRET;
  if (!ownerSecret) throw new FinalPdfError(503, "Protected PDF encryption is not configured.");
  const artifactId = crypto.randomUUID(); const objectKey = `organisations/${input.context.organisation.id}/final-pdfs/${artifactId}.pdf`;
  const branding = await protectedPdfBranding(input.state, input.context.organisation.id, scoped.report.artifact!.documentTemplateSnapshot);
  const rendered = await renderProtectedPdf({ reportVersionId: scoped.report.id, sourceSnapshotHash: scoped.report.artifact!.contentHash,
    html: renderPrintableReport(input.state, scoped.report),
    evidence: manualEvidence
      ? [{ ...evidence, role: "PLAN_AUTHENTICATION" }, { ...manualEvidence, role: "MANUAL_UTILITY_SHEET" }]
      : { ...evidence, role: "PLAN_AUTHENTICATION" },
    ownerSecret, branding });
  const artifactHash = await sha256(rendered.bytes); const generatedAt = new Date().toISOString();
  await getRuntimeEnv().R2.put(objectKey, rendered.bytes, { httpMetadata: { contentType: "application/pdf" }, customMetadata: { checksumSha256: artifactHash, immutable: "true", reportVersionId: scoped.report.id } });
  try {
    await database.batch([
      eventStatement(database, { organisationId: input.context.organisation.id, report: scoped, eventType: "GENERATION_REQUESTED", actor: input.actor,
        reason: "Founder requested deterministic protected PDF generation.", requestId: input.requestId, idempotencyKey: `${key}:requested` }),
      database.prepare(`INSERT INTO final_pdf_artifacts
        (artifact_id,organisation_id,report_version_id,report_version_label,case_id,project_id,floor_id,report_template_version,source_snapshot_hash,artifact_hash_sha256,object_key,mime_type,size_bytes,page_count,renderer_version,page_configuration,embedded_evidence_checksums_json,generated_at,security_profile,status,generation_idempotency_key,record_version)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'GENERATED',?,1)`).bind(artifactId, input.context.organisation.id,
          scoped.report.id, scoped.report.versionLabel, scoped.caseRecord.id, scoped.project.id, scoped.floor.id,
          scoped.report.artifact!.templateVersion, scoped.report.artifact!.contentHash, artifactHash, objectKey, "application/pdf",
          rendered.bytes.length, rendered.pageCount, rendered.rendererVersion, rendered.pageConfiguration,
          JSON.stringify([{ evidenceVersionId: scoped.evidence.id, checksumSha256: evidence.checksumSha256, fileName: evidence.fileName, mimeType: evidence.mimeType }, ...(manualEvidence && scoped.manualSheet ? [{ evidenceVersionId: scoped.manualSheet.id, checksumSha256: manualEvidence.checksumSha256, fileName: manualEvidence.fileName, mimeType: manualEvidence.mimeType }] : [])]),
          generatedAt, rendered.securityProfile, key),
      eventStatement(database, { organisationId: input.context.organisation.id, artifactId, report: scoped, eventType: "GENERATED", actor: input.actor,
        artifactHash, reason: "Deterministic encrypted PDF and mandatory evidence attachment stored immutably.", requestId: input.requestId, idempotencyKey: `${key}:generated` })
    ]);
  } catch (error) {
    await getRuntimeEnv().R2.delete(objectKey);
    throw error;
  }
  const row = await findManifest(database, input.context.organisation.id, scoped.report.id);
  if (!row) throw new FinalPdfError(503, "Protected PDF manifest was not durably stored.");
  return { artifact: rowPublic(row), replayed: false };
  } catch (error) {
    await recordFailure(database, { organisationId: input.context.organisation.id, report: scoped, eventType: "GENERATION_FAILED",
      actor: input.actor, requestId: input.requestId, idempotencyKey: `${key}:failed`, error });
    throw error;
  }
}

export async function verifyFinalPdf(input: {
  state: AppState; revision: number | null; context: FounderFoundationContext; actor: AppUser; reportId: unknown;
  expectedRecordVersion: unknown; expectedRevision: unknown; expectedArtifactVersion: unknown; idempotencyKey: unknown; requestId: string;
}) {
  assertFounder(input.context, input.actor); const database = db(); await migrateD1(database);
  const scoped = binding(input.state, input.reportId, input.context.organisation.id); assertVersions(input, scoped.report, input.revision);
  const key = text(input.idempotencyKey, "Idempotency key"); const row = await findManifest(database, input.context.organisation.id, scoped.report.id);
  if (!row) throw new FinalPdfError(409, "Generate the protected PDF before verification.");
  if (row.status === "VERIFIED" || row.status === "RELEASED") return { artifact: rowPublic(row), replayed: true };
  if (row.status !== "GENERATED") throw new FinalPdfError(409, "Only a generated immutable PDF can be verified.");
  if (!Number.isInteger(input.expectedArtifactVersion) || Number(input.expectedArtifactVersion) < 1) throw new FinalPdfError(428, "The latest PDF artifact version is required.");
  if (row.record_version !== Number(input.expectedArtifactVersion)) throw new FinalPdfError(409, "The PDF artifact changed. Reload before verification.");
  try {
  releaseGate(input.state, scoped); if (row.source_snapshot_hash !== scoped.report.artifact!.contentHash || !await artifactStillMatches(input.state, scoped.report)) throw new FinalPdfError(409, "The PDF source snapshot no longer matches the approved report.");
  await verifyBytes(row); await verifyEvidenceBinding(row, scoped, input.context.organisation.id); const verifiedAt = new Date().toISOString();
  const results = await database.batch([
    database.prepare("UPDATE final_pdf_artifacts SET status='VERIFIED',verified_at=?,record_version=record_version+1 WHERE artifact_id=? AND organisation_id=? AND status='GENERATED' AND record_version=?")
      .bind(verifiedAt, row.artifact_id, input.context.organisation.id, row.record_version),
    eventStatement(database, { organisationId: input.context.organisation.id, artifactId: row.artifact_id, report: scoped, eventType: "INTEGRITY_VERIFIED", actor: input.actor,
      artifactHash: row.artifact_hash_sha256, reason: "PDF hash, encryption permissions, page structure, and embedded evidence were independently verified.", requestId: input.requestId, idempotencyKey: key })
  ]);
  if (results[0]?.meta.changes !== 1) throw new FinalPdfError(409, "The PDF artifact changed during verification.");
  const updated = await findManifest(database, input.context.organisation.id, scoped.report.id);
  return { artifact: rowPublic(updated!), replayed: false };
  } catch (error) {
    await recordFailure(database, { organisationId: input.context.organisation.id, artifactId: row.artifact_id, report: scoped,
      eventType: "VERIFICATION_FAILED", actor: input.actor, artifactHash: row.artifact_hash_sha256,
      requestId: input.requestId, idempotencyKey: `${key}:failed`, error });
    throw error;
  }
}

export async function releaseFinalPdf(input: {
  state: AppState; revision: number | null; context: FounderFoundationContext; actor: AppUser; reportId: unknown;
  expectedRecordVersion: unknown; expectedRevision: unknown; expectedArtifactVersion: unknown; idempotencyKey: unknown; requestId: string;
}) {
  assertFounder(input.context, input.actor); const database = db(); await migrateD1(database);
  const scoped = binding(input.state, input.reportId, input.context.organisation.id);
  const key = text(input.idempotencyKey, "Idempotency key"); const row = await findManifest(database, input.context.organisation.id, scoped.report.id);
  if (!row) throw new FinalPdfError(409, "Generate and verify the protected PDF before release.");
  if (row.status === "RELEASED" && scoped.report.status === "RELEASED") return { artifact: rowPublic(row), report: scoped.report, replayed: true };
  assertVersions(input, scoped.report, input.revision);
  if (row.status !== "VERIFIED") throw new FinalPdfError(409, "Protected PDF integrity verification is required before release.");
  if (!Number.isInteger(input.expectedArtifactVersion) || row.record_version !== Number(input.expectedArtifactVersion)) throw new FinalPdfError(Number.isInteger(input.expectedArtifactVersion) ? 409 : 428, "The latest PDF artifact version is required before release.");
  releaseGate(input.state, scoped); await verifyBytes(row); await verifyEvidenceBinding(row, scoped, input.context.organisation.id);
  const before = structuredClone(input.state); const next = structuredClone(input.state); setAppState(next);
  try {
    const nextReport = releaseVerdict(scoped.report.id, input.actor,
      { mode: "FOUNDER", creatorMayApprove: input.context.approvalPolicy.creatorMayApprove }, scoped.report.recordVersion,
      key, true);
    const payload = JSON.stringify(getAppState()); const releasedAt = new Date().toISOString(); const expectedRevision = Number(input.expectedRevision);
    const eventId = crypto.randomUUID(); const occurredAt = new Date().toISOString();
    const results = await database.batch([
      database.prepare(`UPDATE app_state_snapshot SET payload=?,updated_at=?,revision=revision+1
        WHERE id='current' AND revision=? AND EXISTS (SELECT 1 FROM final_pdf_artifacts WHERE artifact_id=? AND organisation_id=? AND status='VERIFIED' AND record_version=?)`)
        .bind(payload, releasedAt, expectedRevision, row.artifact_id, input.context.organisation.id, row.record_version),
      database.prepare(`UPDATE final_pdf_artifacts SET status='RELEASED',released_at=?,released_by_actor_id=?,record_version=record_version+1
        WHERE artifact_id=? AND organisation_id=? AND status='VERIFIED' AND record_version=?
        AND EXISTS (SELECT 1 FROM app_state_snapshot WHERE id='current' AND revision=? AND payload=?)`)
        .bind(releasedAt, input.actor.id, row.artifact_id, input.context.organisation.id, row.record_version, expectedRevision + 1, payload),
      database.prepare(`INSERT INTO final_pdf_artifact_events
        (event_id,organisation_id,artifact_id,report_version_id,case_id,project_id,floor_id,event_type,actor_user_id,actor_display_name,artifact_hash_sha256,reason,request_id,idempotency_key,occurred_at)
        SELECT ?,?,?,?,?,?,?,'RELEASED',?,?,?,?,?,?,? WHERE EXISTS
        (SELECT 1 FROM final_pdf_artifacts WHERE artifact_id=? AND organisation_id=? AND status='RELEASED' AND record_version=?)`)
        .bind(eventId, input.context.organisation.id, row.artifact_id, scoped.report.id, scoped.caseRecord.id, scoped.project.id, scoped.floor.id,
          input.actor.id, input.actor.fullName, row.artifact_hash_sha256, "Founder released the verified immutable floor PDF after all gates passed.",
          input.requestId, key, occurredAt, row.artifact_id, input.context.organisation.id, row.record_version + 1)
    ]);
    if (results[0]?.meta.changes !== 1 || results[1]?.meta.changes !== 1 || results[2]?.meta.changes !== 1) {
      setAppState(before); throw new FinalPdfError(409, "The report or PDF changed during atomic release. No release was committed.");
    }
    return { artifact: rowPublic({ ...row, status: "RELEASED", released_at: releasedAt, released_by_actor_id: input.actor.id, record_version: row.record_version + 1 }), report: nextReport, replayed: false };
  } catch (error) {
    setAppState(before); throw error;
  }
}

export async function readReleasedFinalPdf(input: {
  state: AppState; context: FounderFoundationContext; actor: AppUser; reportId: unknown; mode: "export" | "print"; requestId: string;
}) {
  assertFounder(input.context, input.actor); const database = db(); await migrateD1(database);
  const scoped = binding(input.state, input.reportId, input.context.organisation.id);
  if (scoped.report.status !== "RELEASED") throw new FinalPdfError(403, "Final PDF export and print are blocked until verified Founder release.");
  const row = await findManifest(database, input.context.organisation.id, scoped.report.id);
  if (!row || row.status !== "RELEASED") throw new FinalPdfError(403, "A released immutable PDF is not available for this floor report.");
  const { bytes } = await verifyBytes(row); const key = `${input.mode}:${input.requestId}`;
  try {
    await eventStatement(database, { organisationId: input.context.organisation.id, artifactId: row.artifact_id, report: scoped,
      eventType: input.mode === "print" ? "PRINTED" : "EXPORTED", actor: input.actor, artifactHash: row.artifact_hash_sha256,
      reason: `Founder authorised ${input.mode} of the released immutable PDF.`, requestId: input.requestId, idempotencyKey: key }).run();
  } catch { /* A repeated request ID is an audit replay; bytes remain immutable. */ }
  const safeCase = scoped.caseRecord.caseNumber.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80) || "case";
  const safeFloor = scoped.floor.floorLabel.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80) || "floor";
  return { bytes, fileName: `uchit-${safeCase}-${safeFloor}-${scoped.report.versionLabel.replace(/[^a-z0-9_-]+/gi, "-")}.pdf`, artifact: rowPublic(row) };
}

export async function readFinalPdfStatus(input: { state: AppState; context: FounderFoundationContext; actor: AppUser; reportId: unknown }) {
  assertFounder(input.context, input.actor); const database = db(); await migrateD1(database);
  const scoped = binding(input.state, input.reportId, input.context.organisation.id);
  const row = await findManifest(database, input.context.organisation.id, scoped.report.id);
  return row ? rowPublic(row) : null;
}
