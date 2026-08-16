import assert from "node:assert/strict";
import test from "node:test";
import { execute } from "./r3-3d2-native-v1-stageb-execution-certification.test.ts";
import { setAppState } from "../lib/store.ts";
import { inspectProtectedPdf, renderProtectedPdf } from "../lib/protected-pdf-renderer.ts";
import { renderPrintableReport } from "../lib/report-html.ts";
import { createArtifactManifest, sha256Hex, V5_REPORT_TEMPLATE_VERSION } from "../lib/report-artifacts.ts";

test("R4 admits certified native V1 Stage-B into the existing v5 report and protected-PDF path", async () => {
  const { fixture, stageBManifest } = execute();
  const { state, owner, caseRecord, floor, combinedReport } = fixture;
  state.payments.push({ id: "payment-native-v1-r4", organisationId: fixture.organisationId, clientId: fixture.client.id, caseId: caseRecord.id, type: "BALANCE", amountInr: 10000, status: "APPROVED", proofAssetId: "proof-native-v1-r4", recordVersion: 1 } as any);
  setAppState(state);
  const report: any = { id: "report-native-v1-r4", organisationId: fixture.organisationId, caseId: caseRecord.id, floorId: floor.id, versionLabel: `${floor.floorLabel} · Official Native V1 Remedy Report`, isPreview: false, status: "READY_FOR_APPROVAL", idempotencyKey: "native-v1-r4-final-report", approvals: [] };
  report.artifact = await createArtifactManifest(state, report, owner);
  assert.equal(report.status, "READY_FOR_APPROVAL");
  assert.equal(report.artifact?.templateVersion, V5_REPORT_TEMPLATE_VERSION);
  assert.equal(report.artifact?.stageBRenderManifest?.reportSourceId, combinedReport.id);
  assert.equal(report.artifact?.stageBRenderManifest?.reportSourceHash, combinedReport.contentHash);
  assert.equal(report.artifact?.stageBRenderManifest?.integrityStatus, "PASS");
  assert.equal(report.artifact?.sectionARenderManifest?.integrityStatus, "PASS");
  assert.equal(report.artifact?.sectionCRenderManifest?.integrityStatus, "PASS");
  assert.equal(report.artifact?.remediationReportIntegrity?.status, "PASS");

  const reviewer = { ...owner, id: "native-v1-r4-reviewer", fullName: "Native V1 Reviewer", role: "ADMIN" as const };
  const approver = { ...owner, id: "native-v1-r4-approver", fullName: "Native V1 Approver", role: "ADMIN" as const };
  report.approvals = [reviewer.id, approver.id];
  report.approvalEvidence = [reviewer, approver].map((actor, index) => ({ actorId: actor.id, actorName: actor.fullName, actorRole: actor.role, approvedAt: `2026-08-15T0${index + 1}:00:00.000Z`, comment: index === 0 ? "Reviewed native V1 remedy-inclusive report" : "Approved native V1 remedy-inclusive report", artifactHash: report.artifact.contentHash }));
  report.status = "APPROVED";
  assert.equal(report.status, "APPROVED");
  assert.equal(report.approvalEvidence?.length, 2);

  const html = renderPrintableReport(state, report);
  assert.ok(html.indexOf("data-section-a-manifest") < html.indexOf("data-stage-b-manifest"));
  assert.ok(html.indexOf("data-stage-b-manifest") < html.indexOf("data-section-c-manifest"));
  assert.ok(html.indexOf("data-section-c-manifest") < html.indexOf("data-remediation-master-appendix"));
  assert.match(html, /data-stage-b-page="DISHA_BALANCER"/);
  assert.match(html, /data-stage-b-implementation="EQUALISER"/);
  assert.equal(report.artifact?.stageBRenderManifest?.integrityScopeHash, stageBManifest.integrityScopeHash);

  const evidenceBytes = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGPcEqXBwMDAxAAGAA8+ATocNFacAAAAAElFTkSuQmCC", "base64"));
  const evidenceHash = await sha256Hex(Array.from(evidenceBytes));
  const rendered = await renderProtectedPdf({ reportVersionId: report.id, sourceSnapshotHash: report.artifact!.contentHash, html, evidence: { bytes: evidenceBytes, fileName: "native-v1-existing-layout.png", mimeType: "image/png", checksumSha256: evidenceHash, role: "PLAN_AUTHENTICATION" }, ownerSecret: "owner-secret-native-v1-r4-32-characters-minimum" });
  const inspection = inspectProtectedPdf(rendered.bytes);
  assert.equal(inspection.encrypted, true);
  assert.equal(inspection.printingAllowed, true);
  assert.equal(inspection.editingBlocked, true);
  assert.equal(inspection.copyingBlocked, true);
  assert.equal(inspection.pageExtractionBlocked, true);
  assert.equal(inspection.embeddedFilePresent, true);
  const pdfHash = await sha256Hex(Array.from(rendered.bytes));
  assert.notEqual(pdfHash, combinedReport.contentHash);
  assert.notEqual(report.id, combinedReport.id);
  assert.ok(pdfHash.length === 64);
});

test("R4 rejects tampered native V1 manifest and report-source provenance before rendering", async () => {
  const { fixture } = execute();
  fixture.state.payments.push({ id: "payment-native-v1-r4-tamper", organisationId: fixture.organisationId, clientId: fixture.client.id, caseId: fixture.caseRecord.id, type: "BALANCE", amountInr: 10000, status: "APPROVED", proofAssetId: "proof-native-v1-r4-tamper", recordVersion: 1 } as any);
  setAppState(fixture.state);
  const report: any = { id: "report-native-v1-r4-tamper", organisationId: fixture.organisationId, caseId: fixture.caseRecord.id, floorId: fixture.floor.id, versionLabel: "Ground Floor · Official Native V1 Remedy Report", isPreview: false, status: "APPROVED", approvals: [] };
  report.artifact = await createArtifactManifest(fixture.state, report, fixture.owner);
  report.artifact!.stageBRenderManifest = { ...report.artifact!.stageBRenderManifest!, reportSourceId: "wrong-report-source" };
  assert.throws(() => renderPrintableReport(fixture.state, report), /canonical|Combined Evaluation|exact remediation/i);
});
