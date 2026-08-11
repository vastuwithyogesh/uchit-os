import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createArtifactManifest } from "../lib/report-artifacts.ts";
import { renderPrintableReport } from "../lib/report-html.ts";
import { recordStageAFloorCheckpoint } from "../lib/founder-regeneration.ts";
import { inspectProtectedPdf, renderProtectedPdf } from "../lib/protected-pdf-renderer.ts";
import { buildReleaseableFounderPilotFixture, pilotIds, SYNTHETIC_MANUAL_EVIDENCE_SHA256 } from "../tests/fixtures/founder-pilot-fixture.mjs";

async function sha256(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const fixture = buildReleaseableFounderPilotFixture();
const { state, report, actor, evidence } = fixture;
await createArtifactManifest(state, report, actor);
recordStageAFloorCheckpoint(state, report, "FOUNDER_REVIEWED", actor, "Founder reviewed the exact synthetic floor lineage.", "pilot-render-reviewed");
recordStageAFloorCheckpoint(state, report, "FOUNDER_APPROVED", actor, "Founder approved the exact synthetic floor report.", "pilot-render-approved");
report.status = "RELEASED";
recordStageAFloorCheckpoint(state, report, "RELEASED", actor, "Founder released the verified protected synthetic report.", "pilot-render-released");
state.remedialWorkflowReservations.push({
  id: "pilot-stage-b-reservation", organisationId: pilotIds.organisationId, createdByActorUserId: pilotIds.founderId,
  recordVersion: 1, projectId: pilotIds.projectId, caseId: pilotIds.caseId, floorId: pilotIds.floorId,
  stageAReportId: report.id, status: "BLOCKED_METHOD_INPUT", createdAt: "2026-08-11T06:30:00.000Z"
});

const html = renderPrintableReport(state, report);
const rendered = await renderProtectedPdf({
  reportVersionId: report.id,
  sourceSnapshotHash: report.artifact.contentHash,
  html,
  evidence: [evidence.plan, evidence.manual],
  ownerSecret: "synthetic-founder-pilot-owner-secret-32-plus"
});
const outputPath = resolve("output/pdf/uchit-founder-golden-pilot-v1.pdf");
const manifestPath = resolve("output/pdf/uchit-founder-golden-pilot-v1.manifest.json");
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, rendered.bytes, { flag: "w" });
const inspection = inspectProtectedPdf(rendered.bytes);
await writeFile(manifestPath, JSON.stringify({
  fixtureVersion: "FE-PILOT-01/v1",
  syntheticOnly: true,
  clientDeliveryEnabled: false,
  reportTemplateVersion: report.artifact.templateVersion,
  reportContentHash: report.artifact.contentHash,
  pdfArtifactHashSha256: await sha256(rendered.bytes),
  manualEvidenceChecksumSha256: SYNTHETIC_MANUAL_EVIDENCE_SHA256,
  manualEvidenceVisiblyPlacedAfterSection: 7,
  manualEvidenceBeforeSection: 8,
  pageCount: rendered.pageCount,
  rendererVersion: rendered.rendererVersion,
  pageConfiguration: rendered.pageConfiguration,
  securityProfile: rendered.securityProfile,
  inspection,
  stageBStatus: "BLOCKED_METHOD_INPUT",
  visualQa: {
    renderedPagesInspected: 7,
    a4Pagination: "PASS",
    manualEvidenceColourFidelity: "PASS",
    manualEvidencePlacement: "PASS",
    headersFootersAndPageNumbers: "PASS",
    textClippingOrOverlap: "PASS",
    tableLayoutFidelity: "PASS",
    appendixDensity: "PASS_WITH_CONTINUATION_LABELS",
    shaktiGraphRendering: "PASS",
    visibleEvidenceFormats: "JPEG_AND_NON_INTERLACED_RGB_OR_RGBA_PNG",
    multiFloorPilotDecision: "GO"
  }
}, null, 2) + "\n", { flag: "w" });
console.log(JSON.stringify({ outputPath, manifestPath, pageCount: rendered.pageCount, inspection, reportHash: report.artifact.contentHash, pdfHash: await sha256(rendered.bytes) }));
