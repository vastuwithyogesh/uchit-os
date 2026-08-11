import test from "node:test";
import assert from "node:assert/strict";
import { inspectProtectedPdf, md5, PROTECTED_PDF_PERMISSION_VALUE, renderProtectedPdf } from "../lib/protected-pdf-renderer.ts";
import { functionBody, source } from "./helpers/source-contracts.mjs";

const hex = (bytes) => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
const renderInput = {
  reportVersionId: "report-v3-floor-1", sourceSnapshotHash: "a".repeat(64),
  html: "<h1>Uchit Vastu India</h1><p>One-floor approved report.</p>", ownerSecret: "owner-secret-for-tests-32-characters-minimum",
  evidence: { bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]), fileName: "full-colour-marked-plan.png", mimeType: "image/png", checksumSha256: "b".repeat(64) }
};

test("deterministic renderer emits encrypted print-only PDF with embedded original evidence", async () => {
  assert.equal(hex(md5(new TextEncoder().encode(""))), "d41d8cd98f00b204e9800998ecf8427e");
  assert.equal(hex(md5(new TextEncoder().encode("abc"))), "900150983cd24fb0d6963f7d28e17f72");
  const first = await renderProtectedPdf(renderInput); const second = await renderProtectedPdf(renderInput);
  assert.deepEqual(first.bytes, second.bytes);
  const inspection = inspectProtectedPdf(first.bytes);
  assert.deepEqual(inspection, { encrypted: true, revision: 3, permission: PROTECTED_PDF_PERMISSION_VALUE,
    pageCount: first.pageCount, printingAllowed: true, editingBlocked: true, copyingBlocked: true,
    pageExtractionBlocked: true, embeddedFilePresent: true, validEof: true });
  assert.match(new TextDecoder("latin1").decode(first.bytes), /^%PDF-1\.4/);
  assert.notDeepEqual((await renderProtectedPdf({ ...renderInput, sourceSnapshotHash: "c".repeat(64) })).bytes, first.bytes);
  assert.notDeepEqual((await renderProtectedPdf({ ...renderInput, evidence: { ...renderInput.evidence, bytes: new Uint8Array([1, 2, 3]), checksumSha256: "d".repeat(64) } })).bytes, first.bytes);
});

test("deterministic renderer embeds both plan authentication and approved manual utility evidence", async () => {
  const manualJpeg = Uint8Array.from(Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAEf/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABAf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=", "base64"));
  const rendered = await renderProtectedPdf({ ...renderInput,
    html: "<h2>7. Original full-colour hand-marked utility sheet</h2><p>Founder-approved immutable evidence follows.</p><h2>8. Utility mapping and zoning</h2><p>Approved UtilityMaster rows.</p>",
    evidence: [{ ...renderInput.evidence, role: "PLAN_AUTHENTICATION" }, { bytes: manualJpeg, fileName: "manual-utility-sheet.jpg", mimeType: "image/jpeg", checksumSha256: "c".repeat(64), role: "MANUAL_UTILITY_SHEET" }] });
  const inspection = inspectProtectedPdf(rendered.bytes);
  assert.equal(inspection.embeddedFilePresent, true);
  const protectedStructure = new TextDecoder("latin1").decode(rendered.bytes);
  assert.match(protectedStructure, /EmbeddedFiles/);
  assert.match(protectedStructure, /\/Subtype \/Image/);
  assert.notDeepEqual(rendered.bytes, (await renderProtectedPdf(renderInput)).bytes);
});

test("protected renderer visibly places non-interlaced RGB PNG manual evidence", async () => {
  const manualPng = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGPcEqXBwMDAxAAGAA8+ATocNFacAAAAAElFTkSuQmCC", "base64"));
  const rendered = await renderProtectedPdf({ ...renderInput,
    html: "<h2>7. Original full-colour hand-marked utility sheet</h2><p>Founder-approved PNG evidence follows.</p><h2>8. Utility mapping and zoning</h2><p>Approved UtilityMaster rows.</p>",
    evidence: { bytes: manualPng, fileName: "manual-utility-sheet.png", mimeType: "image/png", checksumSha256: "e".repeat(64), role: "MANUAL_UTILITY_SHEET" }
  });
  assert.match(new TextDecoder("latin1").decode(rendered.bytes), /\/Filter \/FlateDecode/);
  assert.equal(inspectProtectedPdf(rendered.bytes).editingBlocked, true);
});

test("r3 layout preserves structured tables, continuation context and frozen vector graph", () => {
  const renderer = source("lib/protected-pdf-renderer.ts");
  const layout = source("lib/protected-pdf-layout.ts");
  const report = source("lib/report-html.ts");
  assert.match(renderer, /uchit-cloudflare-pdf\/r3/);
  assert.match(renderer, /JPEG_PNG/);
  assert.match(layout, /drawCompactTable/);
  assert.match(layout, /drawRecordCards/);
  assert.match(layout, /Continued -/);
  assert.match(layout, /drawGraph/);
  assert.match(report, /data-pdf-graph="true"/);
  assert.match(report, /item\.bars\.map/);
});

test("private manifest migration binds immutable PDF and append-only event fields", () => {
  const migrations = source("db/migrations.ts"); const schema = source("db/schema.ts");
  assert.match(migrations, /version: 8/);
  for (const value of ["final_pdf_artifacts", "final_pdf_artifact_events", "source_snapshot_hash", "artifact_hash_sha256", "object_key", "embedded_evidence_checksums_json", "renderer_version", "page_configuration", "security_profile"]) {
    assert.match(migrations, new RegExp(value)); assert.match(schema, new RegExp(value));
  }
  for (const status of ["GENERATED", "VERIFIED", "RELEASED", "SUPERSEDED"]) assert.match(migrations, new RegExp(status));
  assert.match(migrations, /UNIQUE \(organisation_id,report_version_id\)/);
  assert.match(migrations, /GENERATION_REQUESTED|INTEGRITY_VERIFIED|EXPORTED|PRINTED|GENERATION_FAILED|VERIFICATION_FAILED/);
});

test("server workflow enforces exact Founder scope, release gates, hash verification and atomic release", () => {
  const service = source("lib/final-pdf.server.ts");
  const bind = functionBody(service, "binding"); const gate = functionBody(service, "releaseGate");
  const generate = functionBody(service, "generateFinalPdf"); const verify = functionBody(service, "verifyFinalPdf");
  const release = functionBody(service, "releaseFinalPdf"); const read = functionBody(service, "readReleasedFinalPdf");
  assert.match(bind, /organisationId/); assert.match(bind, /projectId/); assert.match(bind, /floorId/); assert.match(bind, /uchit-verdict\/v3/); assert.match(bind, /isPreview/);
  assert.match(gate, /fullPaymentApproved/); assert.match(gate, /proofAssetId/); assert.match(gate, /FOUNDER_REVIEWED/); assert.match(gate, /FOUNDER_APPROVED/); assert.match(gate, /getStageAFloorReviewBlockers/);
  assert.match(generate, /artifactStillMatches/); assert.match(generate, /readCaseFileEvidenceForReport/); assert.match(generate, /PDF_OWNER_SECRET/); assert.match(generate, /R2\.put/); assert.match(generate, /R2\.delete/);
  assert.match(verify, /verifyBytes/); assert.match(verify, /status='VERIFIED'/); assert.match(verify, /expectedArtifactVersion/);
  assert.match(release, /UPDATE app_state_snapshot/); assert.match(release, /UPDATE final_pdf_artifacts/); assert.match(release, /database\.batch/); assert.match(release, /setAppState\(before\)/); assert.match(release, /pdfReleaseAuthorized|, true\)/);
  assert.match(read, /status !== "RELEASED"/); assert.match(read, /verifyBytes/); assert.match(read, /EXPORTED|PRINTED/);
});

test("protected route exposes no object key, denies preview HTML export, and keeps client delivery disabled", () => {
  const route = source("app/api/reports/[reportId]/pdf/route.ts");
  const legacyPrint = source("app/api/reports/[reportId]/print/route.ts");
  const publicShape = functionBody(source("lib/final-pdf.server.ts"), "rowPublic");
  const ui = source("components/report-console.tsx");
  assert.match(route, /resolveActiveOrganisationContext/); assert.match(route, /private, no-store/); assert.match(route, /nosniff/);
  assert.match(route, /mode=status/); assert.match(route, /mode=export/); assert.match(route, /mode=print/);
  assert.doesNotMatch(publicShape, /object_key|embedded_evidence_checksums_json|released_by_actor_id/);
  assert.match(legacyPrint, /uchit-verdict\/v3/); assert.match(legacyPrint, /protected PDF/);
  assert.match(ui, /Generate protected PDF/); assert.match(ui, /Verify PDF/); assert.match(ui, /Release protected PDF/);
  assert.match(ui, /mode=export/); assert.match(ui, /mode=print/); assert.doesNotMatch(ui, /action: "verdict-release"/);
  assert.match(source("lib/foundation.ts"), /clientDeliveryEnabled: false/);
});

test("v3 cannot bypass PDF verification through the legacy release action", () => {
  const body = functionBody(source("lib/workflow-service.ts"), "releaseVerdict");
  assert.match(body, /uchit-verdict\/v3/); assert.match(body, /pdfReleaseAuthorized/); assert.match(body, /protected PDF verification and atomic release workflow/);
});

test("security documentation states the enforceable boundary honestly", () => {
  const document = source("docs/protected-pdf-security.md");
  assert.match(document, /hostile reader/i); assert.match(document, /screenshots/i); assert.match(document, /private R2 storage/i);
  assert.match(document, /never overwritten/i); assert.match(document, /PDF_OWNER_SECRET/);
});
