import type { CombinedEvaluationReportSnapshotV1 } from "./domain.ts";
import { renderCombinedEvaluationReportHtmlV1 } from "./combined-report-render-v1.ts";
import { inspectProtectedPdf, renderProtectedPdf } from "./protected-pdf-renderer.ts";

export const COMBINED_V1_PDF_ADAPTER_VERSION = "uchit-combined-evaluation-protected-pdf/v1" as const;

export type CombinedV1ApprovalMetadata = {
  approverName: string;
  approverRole: string;
  approvalDate: string;
  approvalTimestamp: string;
  approvalRecordId: string;
};

export type CombinedV1EvidenceInput = {
  fileName: string;
  mimeType: string;
  checksumSha256: string;
  bytes: Uint8Array;
  versionId: string;
};

export type CombinedV1PdfArtifact = {
  adapterVersion: typeof COMBINED_V1_PDF_ADAPTER_VERSION;
  artifactId: string;
  organisationId: string;
  caseId: string;
  projectId: string;
  floorId: string;
  combinedReportSnapshotId: string;
  combinedReportContentHash: string;
  reportVersion: number;
  reportTemplateVersion: string;
  artifactHashSha256: string;
  bytes: Uint8Array;
  pageCount: number;
  rendererVersion: string;
  securityProfile: string;
  approval: CombinedV1ApprovalMetadata;
  siteEvidenceVersionId: string;
  siteEvidenceChecksumSha256: string;
  energyEvidenceVersionId: string;
  energyEvidenceChecksumSha256: string;
  protectedPdfReady: true;
  generatedAt: string;
  securityMatrix: {
    printing: "TECHNICALLY VERIFIED";
    editing: "TECHNICALLY VERIFIED";
    copying: "TECHNICALLY VERIFIED";
    pageExtraction: "TECHNICALLY VERIFIED";
  };
};

export class CombinedV1PdfError extends Error {}

function required(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new CombinedV1PdfError(`${label} is required.`);
  return value.trim();
}

async function sha256(bytes: Uint8Array) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.slice().buffer));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * V1-specific protected artifact adapter. It delegates encryption and permission
 * enforcement to the existing renderer and never reads current methodology.
 */
export async function generateCombinedV1ProtectedPdf(input: {
  snapshot: CombinedEvaluationReportSnapshotV1;
  ownerSecret: string;
  approval: CombinedV1ApprovalMetadata;
  siteEvidence: CombinedV1EvidenceInput;
  energyEvidence: CombinedV1EvidenceInput;
}) : Promise<CombinedV1PdfArtifact> {
  const snapshot = input.snapshot;
  const organisationId = required(snapshot.organisationId, "Combined report organisation");
  const snapshotId = required(snapshot.id, "Combined report snapshot ID");
  const contentHash = required(snapshot.contentHash, "Combined report content hash");
  if (snapshot.status !== "APPROVED") throw new CombinedV1PdfError("Only an APPROVED combined V1 report may create a client-authorized PDF.");
  if (input.ownerSecret.length < 32) throw new CombinedV1PdfError("Protected PDF owner secret must contain at least 32 characters.");
  const approval = input.approval;
  for (const [key, value] of Object.entries(approval)) required(value, `Approval ${key}`);
  if (input.siteEvidence.versionId !== snapshot.siteEvidenceVersionId || input.siteEvidence.checksumSha256 !== snapshot.siteEvidenceArtifactHash) throw new CombinedV1PdfError("Site evidence does not match the pinned combined report snapshot.");
  if (input.energyEvidence.versionId !== snapshot.energyBarEvidenceVersionId || input.energyEvidence.checksumSha256 !== snapshot.energyBarEvidenceArtifactHash) throw new CombinedV1PdfError("Energy evidence does not match the pinned combined report snapshot.");
  const baseHtml = renderCombinedEvaluationReportHtmlV1({ snapshot });
  const approvalHtml = `<section data-section="APPROVAL"><h2>Approved Report</h2><p>${approval.approverName} · ${approval.approverRole} · ${approval.approvalDate} · ${approval.approvalTimestamp}</p></section>`;
  const rendered = await renderProtectedPdf({
    reportVersionId: `combined:${snapshotId}`,
    sourceSnapshotHash: contentHash,
    html: baseHtml.replace("</body>", `${approvalHtml}</body>`),
    evidence: [
      { ...input.siteEvidence, role: "PLAN_AUTHENTICATION" as const },
      { ...input.energyEvidence, role: "PLAN_AUTHENTICATION" as const },
    ],
    ownerSecret: input.ownerSecret,
  });
  const inspection = inspectProtectedPdf(rendered.bytes);
  if (!inspection.encrypted || !inspection.printingAllowed || !inspection.editingBlocked || !inspection.copyingBlocked || !inspection.pageExtractionBlocked || !inspection.validEof) {
    throw new CombinedV1PdfError("The protected V1 PDF failed permission or structural verification.");
  }
  return {
    adapterVersion: COMBINED_V1_PDF_ADAPTER_VERSION,
    artifactId: `combined-pdf-${crypto.randomUUID()}`,
    organisationId,
    caseId: snapshot.caseId,
    projectId: snapshot.projectId,
    floorId: snapshot.floorId,
    combinedReportSnapshotId: snapshotId,
    combinedReportContentHash: contentHash,
    reportVersion: snapshot.reportVersion,
    reportTemplateVersion: snapshot.reportTemplateVersion,
    artifactHashSha256: await sha256(rendered.bytes),
    bytes: rendered.bytes,
    pageCount: rendered.pageCount,
    rendererVersion: rendered.rendererVersion,
    securityProfile: rendered.securityProfile,
    approval,
    siteEvidenceVersionId: input.siteEvidence.versionId,
    siteEvidenceChecksumSha256: input.siteEvidence.checksumSha256,
    energyEvidenceVersionId: input.energyEvidence.versionId,
    energyEvidenceChecksumSha256: input.energyEvidence.checksumSha256,
    protectedPdfReady: true,
    generatedAt: new Date().toISOString(),
    securityMatrix: { printing: "TECHNICALLY VERIFIED", editing: "TECHNICALLY VERIFIED", copying: "TECHNICALLY VERIFIED", pageExtraction: "TECHNICALLY VERIFIED" },
  };
}
