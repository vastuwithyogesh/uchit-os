import test from "node:test";
import assert from "node:assert/strict";
import { acknowledgeDocumentDelivery, appendDocumentDeliveryAccess, deliverDocument, deliveryHealth, markDocumentDeliveryReady, prepareDocumentDelivery, projectVastuRemedyDeliveryReadiness } from "../lib/document-delivery.ts";
import type { AppUser, ReportVersionRecord } from "../lib/domain.ts";
import type { ProtectedPdfDeliveryDescriptor } from "../lib/final-pdf.server.ts";
import { createEmptyAppState, type AppState } from "../lib/store.ts";

const org = "org-delivery";
const admin: AppUser = { id: "admin-1", fullName: "Delivery Admin", email: "admin@example.com", role: "ADMIN", color: "#000", organisationId: org };
const clientActor: AppUser = { id: "client-user-1", fullName: "Asha Client", email: "asha@example.com", role: "CLIENT", color: "#000" };
const hash = "a".repeat(64); const pdfHash = "b".repeat(64);

function fixture() {
  const state = createEmptyAppState();
  state.clients.push({ id: "client-1", organisationId: org, displayName: "Asha Client", city: "Pune", source: "Referral", assignedSetterId: "setter", email: "asha@example.com", phone: "9999999999", stage: "CONVERTED", recordVersion: 1 });
  state.vastuCases.push({ id: "case-1", organisationId: org, caseNumber: "UV-001", clientId: "client-1", proposalId: "proposal-1", projectId: "project-1", status: "VERDICT_RELEASED", reportStatus: "RELEASED", orientationLocked: true, balanceApproved: true, fullPaymentApproved: true, recordVersion: 1 });
  state.projects.push({ id: "project-1", organisationId: org, clientId: "client-1", activeCaseId: "case-1", propertyName: "Asha Residence", status: "COMPLETE", createdAt: "2026-01-01T00:00:00.000Z" });
  state.floorWorkspaces.push({ id: "floor-1", organisationId: org, projectId: "project-1", caseId: "case-1", floorLabel: "Ground Floor", status: "LOCKED", locked: true, evidenceUploads: [], recordVersion: 1 });
  state.payments.push({ id: "payment-1", organisationId: org, clientId: "client-1", caseId: "case-1", type: "BALANCE", amountInr: 10000, status: "APPROVED", proofAssetId: "proof-1" });
  const report: ReportVersionRecord = { id: "report-1", organisationId: org, caseId: "case-1", floorId: "floor-1", versionLabel: "Final v1", isPreview: false, status: "RELEASED", approvals: [], recordVersion: 1,
    artifact: { schemaVersion: "report-artifact/v1", mediaType: "text/html", createdAt: "2026-01-01T00:00:00.000Z", createdBy: { id: admin.id, name: admin.fullName, role: admin.role }, templateVersion: "uchit-verdict/v5", floorId: "floor-1",
      stageBRenderManifest: { schemaVersion: "stage-b-render-manifest/v1", remediationId: "remediation-1", reportId: "report-1", floorId: "floor-1", baseLayoutVersionId: "base-1", pages: [], masterAppendixRows: [], integrityRunId: "integrity-1", integrityScopeHash: "scope", integrityStatus: "PASS", generatedAt: "2026-01-01T00:00:00.000Z" } as never,
      documentTemplateSnapshot: { schemaVersion: "document-template-snapshot/v1", source: "CENTRAL", organisationId: org, family: "VASTU_REMEDY_REPORT", brandProfile: { id: "brand-v1", stableProfileId: "brand", version: 1 }, documentTemplate: { id: "template-v1", stableTemplateId: "template", version: 1, name: "Vastu report" }, brandDisplayName: "Uchit Vastu", logo: { enabled: false }, backdrop: { enabled: false }, header: { enabled: true, variant: "MINIMAL" }, footer: { enabled: true, variant: "PAGE_NUMBER" }, colours: { primary: "#111111", secondary: "#222222", accent: "#8b6b3e", background: "#ffffff", text: "#111111" }, prefixPages: [], suffixPages: [], standardText: { confidentialityStatement: "Private", contactInformation: "Contact" }, documentFields: {}, snapshotHash: "template-snapshot-1" } as never,
      contentHash: hash, immutable: true, downloadPath: "/reports/report-1" } };
  state.reportVersions.push(report);
  state.stageAFloorApprovalCheckpoints.push({ id: "approval-1", organisationId: org, reviewSnapshotId: "review-1", projectId: "project-1", caseId: "case-1", floorId: "floor-1", reportId: "report-1", checkpoint: "FOUNDER_APPROVED", snapshotHash: "review-hash", reportArtifactHash: hash, actorUserId: "founder", actorDisplayName: "Founder", actorRole: "SUPER_ADMIN", reason: "Approved", idempotencyKey: "approval-key", occurredAt: "2026-01-02T00:00:00.000Z" });
  const protectedPdf: ProtectedPdfDeliveryDescriptor = { artifactId: "pdf-1", organisationId: org, reportId: "report-1", reportVersionLabel: "Final v1", caseId: "case-1", projectId: "project-1", floorId: "floor-1", reportTemplateVersion: "uchit-verdict/v5", sourceSnapshotHash: hash, artifactHashSha256: pdfHash, mimeType: "application/pdf", sizeBytes: 1234, pageCount: 12, status: "RELEASED", verifiedAt: "2026-01-03T00:00:00.000Z", releasedAt: "2026-01-03T00:00:00.000Z" };
  return { state, report, protectedPdf };
}

function prepare(state: AppState, protectedPdf: ProtectedPdfDeliveryDescriptor, key = "prepare-delivery-1") {
  return prepareDocumentDelivery({ state, organisationId: org, actor: admin, reportId: "report-1", expectedRecordVersion: 1, protectedPdf, idempotencyKey: key, requestId: key });
}

test("readiness fails closed for non-final, failed integrity, missing PDF, mismatched hash, approval, payment and regeneration", () => {
  const each = (mutate: (state: AppState, pdf: ProtectedPdfDeliveryDescriptor) => ProtectedPdfDeliveryDescriptor | undefined, blocker: string) => {
    const { state, protectedPdf } = fixture(); const supplied = mutate(state, protectedPdf);
    const result = projectVastuRemedyDeliveryReadiness({ state, organisationId: org, reportId: "report-1", protectedPdf: supplied });
    assert.equal(result.ready, false); assert.ok(result.checks.some((item) => item.key === blocker && !item.passed));
  };
  each((state, pdf) => { state.reportVersions[0].status = "APPROVED"; return pdf; }, "REPORT_SEQUENCE");
  each((state, pdf) => { state.reportVersions[0].artifact!.stageBRenderManifest!.integrityStatus = "FAIL" as never; return pdf; }, "INTEGRITY");
  each(() => undefined, "PROTECTED_PDF");
  each((_state, pdf) => ({ ...pdf, sourceSnapshotHash: "c".repeat(64) }), "PROTECTED_PDF");
  each((state, pdf) => { state.stageAFloorApprovalCheckpoints = []; return pdf; }, "FINAL_APPROVAL");
  each((state, pdf) => { state.vastuCases[0].balanceApproved = false; return pdf; }, "PAYMENT_RELEASE");
  each((state, pdf) => { state.dependencyInvalidations.push({ id: "invalid-1", organisationId: org, projectId: "project-1", caseId: "case-1", floorId: "floor-1", targetType: "DRAFT_REPORT", targetId: "report-1", status: "NEEDS_REGENERATION", reason: "Plan changed", createdAt: "2026-01-04T00:00:00.000Z" }); return pdf; }, "REGENERATION");
});

test("prepare pins exact identities and replay cannot duplicate or drift", () => {
  const { state, protectedPdf } = fixture(); const first = prepare(state, protectedPdf);
  assert.equal(first.delivery.reportArtifactId, "report-1"); assert.equal(first.delivery.reportCanonicalHash, hash);
  assert.equal(first.delivery.protectedPdfArtifactId, "pdf-1"); assert.equal(first.delivery.protectedPdfChecksumSha256, pdfHash);
  assert.equal(first.delivery.documentTemplateSnapshotHash, "template-snapshot-1"); assert.equal(first.delivery.recipientClientId, "client-1");
  assert.equal(prepare(state, protectedPdf).replayed, true); assert.equal(state.documentDeliveries.length, 1);
  assert.throws(() => prepare(state, { ...protectedPdf, artifactId: "pdf-other" }), /different inputs/);
});

test("Ready, portal delivery, repeat delivery and acknowledgement are separate idempotent lifecycle events", () => {
  const { state, protectedPdf } = fixture(); const delivery = prepare(state, protectedPdf).delivery;
  const ready = markDocumentDeliveryReady({ state, organisationId: org, actor: admin, deliveryId: delivery.id, expectedRecordVersion: 1, protectedPdf, idempotencyKey: "ready-delivery-1", requestId: "ready" });
  assert.equal(ready.readiness.ready, true); assert.equal(delivery.status, "READY");
  deliverDocument({ state, organisationId: org, actor: admin, deliveryId: delivery.id, expectedRecordVersion: 2, protectedPdf, channel: "CLIENT_PORTAL", idempotencyKey: "deliver-delivery-1", requestId: "deliver" });
  assert.equal(delivery.status, "DELIVERED"); const pinned = { id: delivery.protectedPdfArtifactId, hash: delivery.protectedPdfChecksumSha256 };
  const repeated = deliverDocument({ state, organisationId: org, actor: admin, deliveryId: delivery.id, expectedRecordVersion: 3, protectedPdf, channel: "CLIENT_PORTAL", idempotencyKey: "deliver-delivery-2", requestId: "repeat" });
  assert.equal(repeated.repeated, true); assert.deepEqual({ id: delivery.protectedPdfArtifactId, hash: delivery.protectedPdfChecksumSha256 }, pinned);
  acknowledgeDocumentDelivery({ state, actor: clientActor, clientId: "client-1", deliveryId: delivery.id, expectedRecordVersion: 3, idempotencyKey: "ack-delivery-1", requestId: "ack" });
  assert.equal(delivery.status, "ACKNOWLEDGED"); assert.equal(state.reportVersions[0].artifact!.contentHash, hash);
  assert.deepEqual(state.documentDeliveryEvents.map((item) => item.eventType), ["PREPARED", "READY", "DELIVERED", "REDELIVERED", "ACKNOWLEDGED"]);
});

test("manual handoff records transmission truth and delivery health detects missing or mismatched artifacts", () => {
  const { state, protectedPdf } = fixture(); const delivery = prepare(state, protectedPdf).delivery;
  markDocumentDeliveryReady({ state, organisationId: org, actor: admin, deliveryId: delivery.id, expectedRecordVersion: 1, protectedPdf, idempotencyKey: "ready-manual-1", requestId: "ready" });
  deliverDocument({ state, organisationId: org, actor: admin, deliveryId: delivery.id, expectedRecordVersion: 2, protectedPdf, channel: "MANUAL_HANDOFF", manualHandoffDescription: "Founder handed the protected PDF on an encrypted USB drive.", idempotencyKey: "manual-delivery-1", requestId: "manual" });
  assert.equal(delivery.channel, "MANUAL_HANDOFF"); assert.match(delivery.manualHandoffDescription!, /encrypted USB/);
  assert.deepEqual(deliveryHealth(state, delivery, protectedPdf), { healthy: true, issues: [] });
  assert.ok(deliveryHealth(state, delivery).issues.includes("MISSING_PROTECTED_PDF"));
  assert.ok(deliveryHealth(state, delivery, { ...protectedPdf, artifactHashSha256: "d".repeat(64) }).issues.includes("PROTECTED_PDF_CHECKSUM_MISMATCH"));
});

test("cross-organisation preparation and wrong-client acknowledgement are rejected", () => {
  const { state, protectedPdf } = fixture();
  assert.throws(() => prepareDocumentDelivery({ state, organisationId: "org-other", actor: admin, reportId: "report-1", expectedRecordVersion: 1, protectedPdf, idempotencyKey: "prepare-other-org", requestId: "cross" }), /scope was not found/);
  const delivery = prepare(state, protectedPdf).delivery;
  assert.throws(() => acknowledgeDocumentDelivery({ state, actor: clientActor, clientId: "client-other", deliveryId: delivery.id, expectedRecordVersion: 1, idempotencyKey: "ack-wrong-client", requestId: "wrong" }), /not found/);
});

test("replacement creates a separate linked delivery while the old snapshot remains unchanged", () => {
  const { state, protectedPdf } = fixture(); const original = prepare(state, protectedPdf).delivery; const originalSnapshot = structuredClone(original);
  state.vastuCases.push({ ...state.vastuCases[0], id: "case-2", caseNumber: "UV-001-R2", parentCaseId: "case-1", revisionNumber: 2 });
  state.projects[0].activeCaseId = "case-2";
  state.floorWorkspaces.push({ ...state.floorWorkspaces[0], id: "floor-2", caseId: "case-2" });
  state.reportVersions.push({ ...state.reportVersions[0], id: "report-2", caseId: "case-2", floorId: "floor-2", versionLabel: "Final v2", recordVersion: 1, artifact: { ...state.reportVersions[0].artifact!, floorId: "floor-2", contentHash: "e".repeat(64) } });
  state.stageAFloorApprovalCheckpoints.push({ ...state.stageAFloorApprovalCheckpoints[0], id: "approval-2", caseId: "case-2", floorId: "floor-2", reportId: "report-2", reportArtifactHash: "e".repeat(64) });
  const replacementPdf = { ...protectedPdf, artifactId: "pdf-2", reportId: "report-2", reportVersionLabel: "Final v2", caseId: "case-2", floorId: "floor-2", sourceSnapshotHash: "e".repeat(64), artifactHashSha256: "f".repeat(64) };
  const replacement = prepareDocumentDelivery({ state, organisationId: org, actor: admin, reportId: "report-2", expectedRecordVersion: 1, protectedPdf: replacementPdf, idempotencyKey: "prepare-replacement", requestId: "replacement" }).delivery;
  assert.equal(replacement.replacementForDeliveryId, original.id); assert.notEqual(replacement.id, original.id); assert.deepEqual(original, originalSnapshot);
});

test("receipt acknowledgement is client-only, delivery-only and never changes the report", () => {
  const { state, protectedPdf } = fixture(); const delivery = prepare(state, protectedPdf).delivery;
  assert.throws(() => acknowledgeDocumentDelivery({ state, actor: clientActor, clientId: "client-1", deliveryId: delivery.id, expectedRecordVersion: 1, idempotencyKey: "early-ack", requestId: "early" }), /only after delivery/);
  markDocumentDeliveryReady({ state, organisationId: org, actor: admin, deliveryId: delivery.id, expectedRecordVersion: 1, protectedPdf, idempotencyKey: "ready-ack", requestId: "ready" });
  deliverDocument({ state, organisationId: org, actor: admin, deliveryId: delivery.id, expectedRecordVersion: 2, protectedPdf, channel: "CLIENT_PORTAL", idempotencyKey: "deliver-ack", requestId: "deliver" });
  const reportBefore = structuredClone(state.reportVersions[0]);
  assert.throws(() => acknowledgeDocumentDelivery({ state, actor: admin, clientId: "client-1", deliveryId: delivery.id, expectedRecordVersion: 3, idempotencyKey: "admin-ack", requestId: "admin" }), /recipient client/);
  acknowledgeDocumentDelivery({ state, actor: clientActor, clientId: "client-1", deliveryId: delivery.id, expectedRecordVersion: 3, idempotencyKey: "client-ack", requestId: "client" });
  assert.deepEqual(state.reportVersions[0], reportBefore);
});

test("view and download history is append-only and remains pinned to the delivered artifact", () => {
  const { state, protectedPdf } = fixture(); const delivery = prepare(state, protectedPdf).delivery;
  markDocumentDeliveryReady({ state, organisationId: org, actor: admin, deliveryId: delivery.id, expectedRecordVersion: 1, protectedPdf, idempotencyKey: "ready-access", requestId: "ready" });
  deliverDocument({ state, organisationId: org, actor: admin, deliveryId: delivery.id, expectedRecordVersion: 2, protectedPdf, channel: "CLIENT_PORTAL", idempotencyKey: "deliver-access", requestId: "deliver" });
  const before = state.documentDeliveryEvents.length;
  appendDocumentDeliveryAccess({ state, delivery, actor: clientActor, eventType: "VIEWED", requestId: "view-1" });
  appendDocumentDeliveryAccess({ state, delivery, actor: clientActor, eventType: "DOWNLOADED", requestId: "download-1" });
  assert.deepEqual(state.documentDeliveryEvents.slice(before).map((item) => item.eventType), ["VIEWED", "DOWNLOADED"]);
  assert.ok(state.documentDeliveryEvents.slice(before).every((item) => item.protectedPdfArtifactId === "pdf-1" && item.protectedPdfChecksumSha256 === pdfHash));
});

test("repository, preferred-media, brand, template and remedy changes cannot rewrite a delivery snapshot", () => {
  const { state, protectedPdf } = fixture(); const delivery = prepare(state, protectedPdf).delivery;
  markDocumentDeliveryReady({ state, organisationId: org, actor: admin, deliveryId: delivery.id, expectedRecordVersion: 1, protectedPdf, idempotencyKey: "ready-history", requestId: "ready" });
  deliverDocument({ state, organisationId: org, actor: admin, deliveryId: delivery.id, expectedRecordVersion: 2, protectedPdf, channel: "CLIENT_PORTAL", idempotencyKey: "deliver-history", requestId: "deliver" });
  const frozen = structuredClone(delivery);
  state.remedyRepositoryRecords.push({ id: "remedy-new", lifecycleStatus: "APPROVED" } as never);
  state.mediaAssetVersions.push({ id: "media-preferred-v2", status: "CURRENT" } as never);
  state.organisationBrandProfiles.push({ id: "brand-v2", version: 2, lifecycleStatus: "ACTIVE" } as never);
  state.documentTemplates.push({ id: "template-v2", version: 2, lifecycleStatus: "ACTIVE" } as never);
  state.physicalPlacements.push({ id: "replacement-remedy", remedyId: "remedy-new", state: "LOCKED" } as never);
  state.reportVersions.push({ ...state.reportVersions[0], id: "report-later", versionLabel: "Final v2", artifact: { ...state.reportVersions[0].artifact!, contentHash: "c".repeat(64) } });
  assert.deepEqual(delivery, frozen);
  assert.deepEqual(deliveryHealth(state, delivery, protectedPdf), { healthy: true, issues: [] });
});

test("stale record versions and unsupported channels fail closed", () => {
  const { state, protectedPdf } = fixture();
  assert.throws(() => prepareDocumentDelivery({ state, organisationId: org, actor: admin, reportId: "report-1", expectedRecordVersion: 0, protectedPdf, idempotencyKey: "stale-prepare", requestId: "stale" }), /changed/);
  const delivery = prepare(state, protectedPdf).delivery;
  assert.throws(() => markDocumentDeliveryReady({ state, organisationId: org, actor: admin, deliveryId: delivery.id, expectedRecordVersion: 0, protectedPdf, idempotencyKey: "stale-ready", requestId: "stale" }), /changed/);
  markDocumentDeliveryReady({ state, organisationId: org, actor: admin, deliveryId: delivery.id, expectedRecordVersion: 1, protectedPdf, idempotencyKey: "ready-channel", requestId: "ready" });
  assert.throws(() => deliverDocument({ state, organisationId: org, actor: admin, deliveryId: delivery.id, expectedRecordVersion: 2, protectedPdf, channel: "EMAIL", idempotencyKey: "bad-channel", requestId: "bad" }), /CLIENT_PORTAL or MANUAL_HANDOFF/);
});
