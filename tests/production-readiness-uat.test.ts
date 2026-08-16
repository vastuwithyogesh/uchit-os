import assert from "node:assert/strict";
import test from "node:test";
import { bootstrapLegacyBranding, resolveDocumentTemplateSnapshot } from "../lib/document-branding.ts";
import {
  acknowledgeDocumentDelivery, appendDocumentDeliveryAccess, deliverDocument,
  markDocumentDeliveryReady, prepareDocumentDelivery, projectVastuRemedyDeliveryReadiness
} from "../lib/document-delivery.ts";
import type { AppUser, ReportArtifactManifest, StageBRemedyType } from "../lib/domain.ts";
import { inspectProtectedPdf, renderProtectedPdf } from "../lib/protected-pdf-renderer.ts";
import { canonicalReportPayload, sha256Hex, V5_REPORT_TEMPLATE_VERSION } from "../lib/report-artifacts.ts";
import { renderPrintableReport } from "../lib/report-html.ts";
import {
  buildSectionARenderManifest, finaliseSectionAPage, initialiseSectionA, registerSectionAAsset,
  upsertColourFrameComposition, upsertExistingLayoutAnnotation, upsertSectionAPlacement,
  validateRemediationReportIntegrity
} from "../lib/section-a-remediation.ts";
import {
  addSectionCExtraPage, deleteSectionCPlacement, finaliseSectionCPage, finaliseSectionCSequence,
  registerSectionCAsset, upsertSectionCPlacement
} from "../lib/section-c-extras.ts";
import {
  buildStageBRenderManifest, ensureStageBReservation, finaliseStageBPage, initialiseStageB,
  resolveEligibleRemedies, selectFinalRevisedLayout, STAGE_B_AUTHORITY_HASH,
  STAGE_B_REMEDY_PAGES, STAGE_B_RESOLVER_VERSION, upsertRemedyPlacement
} from "../lib/stage-b-remediation.ts";
import { createEmptyAppState, getAppState, setAppState } from "../lib/store.ts";

const organisationId = "org-uat";
const actor: AppUser = { id: "admin-uat", fullName: "Release Owner", email: "owner@example.test", role: "ADMIN", color: "#111111", organisationId };
const clientActor: AppUser = { id: "client-user-uat", fullName: "Asha Client", email: "asha@example.test", role: "CLIENT", color: "#111111" };
const sourceFraming: Record<StageBRemedyType, string> = {
  DISHA_BALANCER: "Disha Balancer", DISHA_ACTIVATION: "Disha Activation", TATTAV_BALANCER: "Tattva Balancer",
  TATTAV_ACTIVATION: "Tattva Activation", EQUALISER: "Equaliser"
};

function page<T extends string>(items: Array<{ pageType: string; id: string }>, type: T) {
  return items.find((item) => item.pageType === type)!;
}

function seedUat() {
  const state = createEmptyAppState();
  const owned = { organisationId, createdByActorUserId: actor.id, updatedByActorUserId: actor.id, recordVersion: 1 };
  state.clients.push({ id: "client-uat", displayName: "Asha Client", email: "asha@example.test", phone: "9999999999", city: "Pune", source: "UAT", assignedSetterId: actor.id, stage: "CONVERTED", ...owned });
  state.projects.push({ id: "project-uat", clientId: "client-uat", activeCaseId: "case-uat", propertyName: "Asha Residence", status: "COMPLETE", createdAt: "2026-08-14T08:00:00.000Z", ...owned } as never);
  state.vastuCases.push({ id: "case-uat", clientId: "client-uat", projectId: "project-uat", caseNumber: "UV-UAT-001", status: "VERDICT_RELEASED", reportStatus: "RELEASED", orientationLocked: true, balanceApproved: true, fullPaymentApproved: true, ...owned } as never);
  state.floorWorkspaces.push({ id: "floor-uat", projectId: "project-uat", caseId: "case-uat", floorLabel: "Ground Floor", status: "LOCKED", locked: true, evidenceUploads: [], ...owned } as never);
  state.planVersions.push({ id: "plan-existing-uat", projectId: "project-uat", caseId: "case-uat", floorId: "floor-uat", protectedFileRef: "private/existing-layout.pdf", status: "CURRENT", ...owned } as never);
  const report: any = { id: "report-uat", caseId: "case-uat", floorId: "floor-uat", versionLabel: "Final v5 UAT", isPreview: true, status: "READY_FOR_APPROVAL", approvals: [],
    artifact: { schemaVersion: "report-artifact/v1", mediaType: "text/html", immutable: true, templateVersion: "uchit-verdict/v4", planVersionId: "plan-existing-uat",
      utilityVerdictIds: STAGE_B_REMEDY_PAGES.map((item) => `verdict-${item.pageType}`), contentHash: "stage-a-hash", downloadPath: "/protected", createdAt: "2026-08-14T08:00:00.000Z", createdBy: { id: actor.id, name: actor.fullName, role: actor.role } }, ...owned };
  state.reportVersions.push(report);
  state.postSiteFindings.push({ id: "findings-uat", projectId: "project-uat", caseId: "case-uat", floorId: "floor-uat", version: 1, status: "FOUNDER_APPROVED", needsRegeneration: false, ...owned } as never);
  state.methodologyVersions.push({ id: "method-uat", module: "STAGE_B_REMEDIAL", lifecycleStatus: "ACTIVE", executionAdapterVersion: STAGE_B_RESOLVER_VERSION,
    sourceAssetHash: STAGE_B_AUTHORITY_HASH, contentHash: "method-hash-uat", ...owned } as never);
  for (const configuration of STAGE_B_REMEDY_PAGES) {
    const stageBActionByType: Record<string, string> = { TATTAV_BALANCER: "SUPPRESS", DISHA_BALANCER: "GROUND", TATTAV_ACTIVATION: "UPLIFT", DISHA_ACTIVATION: "PROMOTE", EQUALISER: "BALANCE" };
    state.methodologyRules.push({ id: `rule-${configuration.pageType}`, methodologyVersionId: "method-uat", decisionStatus: "APPROVED", conditionJson: { action: stageBActionByType[configuration.pageType] }, outcomeJson: { remedialType: configuration.pageType }, ...owned } as never);
    state.utilityVerdicts.push({ id: `verdict-${configuration.pageType}`, projectId: "project-uat", caseId: "case-uat", floorId: "floor-uat", status: "APPROVED",
      element: "Earth", directionSet: ["SW"], triggeredDirections: ["SW"], solutionFraming: sourceFraming[configuration.pageType], outputHash: `verdict-hash-${configuration.pageType}`, ...owned } as never);
    state.mediaAssetVersions.push({ id: `media-${configuration.pageType}`, assetId: `asset-${configuration.pageType}`, status: "FOUNDER_APPROVED", checksumSha256: `hash-${configuration.pageType}`, assetType: "REMEDY", ...owned } as never);
    state.remedyRepositoryRecords.push({ id: `remedy-${configuration.pageType}`, name: configuration.label, attributePurpose: `${configuration.label} UAT purpose`, remedialType: configuration.pageType,
      elements: ["Earth"], directions: ["SW"], preferredAssetId: `asset-${configuration.pageType}`, preferredAssetVersionId: `media-${configuration.pageType}`, status: "APPROVED", ...owned } as never);
  }
  for (let index = 1; index <= 6; index++) state.methodologyGoldenFixtures.push({ id: `fixture-${index}`, methodologyVersionId: "method-uat", decisionStatus: "APPROVED", ...owned } as never);
  for (const [id, assetType, name] of [["media-furniture", "FURNITURE_ADDON", "Console"], ["media-appliance", "APPLIANCE", "Heater"], ["media-colour", "COLOUR_FRAME", "Wall colour"], ["media-extra-a", "EXTRA", "Crystal bowl"], ["media-extra-b", "EXTRA", "Brass pyramid"]] as const) {
    state.mediaAssetVersions.push({ id, assetId: `asset-${id}`, status: "FOUNDER_APPROVED", checksumSha256: `hash-${id}`, assetType, filename: `${name}.png`, version: 1, ...owned } as never);
  }
  state.revisedLayoutCandidates.push({ id: "candidate-uat", projectId: "project-uat", caseId: "case-uat", floorId: "floor-uat", postSiteFindingsId: "findings-uat",
    label: "Final revised layout", evidenceRef: "private/revised-layout.pdf", checksumSha256: "candidate-hash-uat", version: 1, status: "AVAILABLE", createdAt: "2026-08-14T08:00:00.000Z", ...owned } as never);
  state.payments.push({ id: "payment-uat", clientId: "client-uat", caseId: "case-uat", type: "BALANCE", amountInr: 10000, status: "APPROVED", proofAssetId: "proof-uat", ...owned } as never);
  bootstrapLegacyBranding({ state, actor, expectedRecordVersion: 0, idempotencyKey: "brand-bootstrap-uat", reason: "Controlled production-readiness UAT." });
  setAppState(state);
  return { state, report };
}

test("canonical one-floor A→B→C protected-report delivery UAT remains deterministic and immutable", async () => {
  const seeded = seedUat();
  assert.equal(ensureStageBReservation({ caseId: "case-uat", floorId: "floor-uat", actor })?.status, "READY_FOR_CONFIGURATION");
  const opened = initialiseStageB({ caseId: "case-uat", floorId: "floor-uat", reportId: seeded.report.id, expectedRecordVersion: 1, idempotencyKey: "open-uat", actor });
  const sectionA = initialiseSectionA({ remediationId: opened.remediation.id, expectedRecordVersion: opened.remediation.recordVersion, idempotencyKey: "open-a-uat", actor });
  const selected = selectFinalRevisedLayout({ remediationId: opened.remediation.id, candidateId: "candidate-uat", expectedRecordVersion: opened.remediation.recordVersion, idempotencyKey: "select-uat", actor });

  upsertExistingLayoutAnnotation({ remediationId: opened.remediation.id, pageId: page(sectionA.visualPages, "EXISTING_LAYOUT").id, annotationType: "ARROW",
    points: [{ x: .2, y: .2 }, { x: .3, y: .3 }], colour: "#7a4f2b", strokeWidth: .01, opacity: .8, expectedRecordVersion: opened.remediation.recordVersion, idempotencyKey: "annotation-uat", actor });
  const furnitureAsset = registerSectionAAsset({ remediationId: opened.remediation.id, assetType: "FURNITURE_ADDON", name: "Console", attributePurpose: "Entry support",
    assetId: "asset-media-furniture", assetVersionId: "media-furniture", expectedRecordVersion: opened.remediation.recordVersion, idempotencyKey: "furniture-asset-uat", actor });
  const applianceAsset = registerSectionAAsset({ remediationId: opened.remediation.id, assetType: "APPLIANCE", name: "Heater", attributePurpose: "Thermal utility",
    assetId: "asset-media-appliance", assetVersionId: "media-appliance", expectedRecordVersion: opened.remediation.recordVersion, idempotencyKey: "appliance-asset-uat", actor });
  const colourAsset = registerSectionAAsset({ remediationId: opened.remediation.id, assetType: "COLOUR_FRAME", name: "Wall colour", attributePurpose: "Visual reference",
    assetId: "asset-media-colour", assetVersionId: "media-colour", expectedRecordVersion: opened.remediation.recordVersion, idempotencyKey: "colour-asset-uat", actor });
  const physicalInput = { remediationId: opened.remediation.id, baseLayoutVersionId: selected.baseLayout.id, anchorX: .2, anchorY: .25, calloutX: .62, calloutY: .2,
    calloutWidth: .2, calloutHeight: .12, showCircle: true, showFrame: true, showHighlight: false, completePlacement: true, actor };
  const furniture = upsertSectionAPlacement({ ...physicalInput, pageId: page(sectionA.placementPages, "FURNITURE_ADDON").id, sectionAAssetId: furnitureAsset.id,
    placementType: "FURNITURE_ADDON", expectedRecordVersion: opened.remediation.recordVersion, idempotencyKey: "place-furniture-uat" });
  const appliance = upsertSectionAPlacement({ ...physicalInput, pageId: page(sectionA.placementPages, "APPLIANCE").id, sectionAAssetId: applianceAsset.id,
    placementType: "APPLIANCE", anchorX: .3, expectedRecordVersion: opened.remediation.recordVersion, idempotencyKey: "place-appliance-uat" });
  upsertColourFrameComposition({ remediationId: opened.remediation.id, pageId: page(sectionA.visualPages, "COLOUR_FRAME").id, sectionAAssetId: colourAsset.id,
    baseLayoutVersionId: selected.baseLayout.id, x: .15, y: .15, width: .3, height: .2, rotationDegrees: 90, opacityPreset: "MEDIUM", preserveAspectRatio: true,
    printFit: true, locked: true, expectedRecordVersion: opened.remediation.recordVersion, idempotencyKey: "colour-frame-uat", actor });
  for (const type of ["EXISTING_LAYOUT", "FINAL_REVISED_LAYOUT", "FURNITURE_ADDON", "APPLIANCE", "COLOUR_FRAME"] as const) {
    finaliseSectionAPage({ remediationId: opened.remediation.id, pageId: page([...sectionA.visualPages, ...sectionA.placementPages], type).id,
      expectedRecordVersion: opened.remediation.recordVersion, idempotencyKey: `finalise-a-${type}-uat`, actor });
  }

  const remedyPlacements = [];
  for (const [index, configuration] of STAGE_B_REMEDY_PAGES.entries()) {
    const resolution = resolveEligibleRemedies({ remediationId: opened.remediation.id, verdictId: `verdict-${configuration.pageType}`, remedialType: configuration.pageType,
      expectedRecordVersion: opened.remediation.recordVersion, idempotencyKey: `resolve-${configuration.pageType}-uat`, actor });
    assert.equal(resolution.eligible.length, 1);
    remedyPlacements.push(upsertRemedyPlacement({ remediationId: opened.remediation.id, pageId: page(opened.pages, configuration.pageType).id,
      eligibilityResolutionId: resolution.eligible[0].id, baseLayoutVersionId: selected.baseLayout.id, placementType: "REMEDY", anchorX: .2 + index * .08,
      anchorY: .35, calloutX: .62, calloutY: .3 + index * .04, calloutWidth: .2, calloutHeight: .1, showCircle: true, showFrame: true,
      showHighlight: false, completePlacement: true, expectedRecordVersion: opened.remediation.recordVersion, idempotencyKey: `place-${configuration.pageType}-uat`, actor }));
  }
  for (const configuration of STAGE_B_REMEDY_PAGES) finaliseStageBPage({ remediationId: opened.remediation.id, pageId: page(opened.pages, configuration.pageType).id,
    expectedRecordVersion: opened.remediation.recordVersion, idempotencyKey: `finalise-b-${configuration.pageType}-uat`, actor });

  const firstExtra = addSectionCExtraPage({ remediationId: opened.remediation.id, title: "Entry Objects", expectedRecordVersion: opened.remediation.recordVersion, idempotencyKey: "extra-page-a-uat", actor });
  const secondExtra = addSectionCExtraPage({ remediationId: opened.remediation.id, title: "Ambient Objects", expectedRecordVersion: firstExtra.workspace.recordVersion, idempotencyKey: "extra-page-b-uat", actor });
  const extraAAsset = registerSectionCAsset({ remediationId: opened.remediation.id, extraPageId: firstExtra.extraPage.id, name: "Crystal bowl", attributePurpose: "Entry support",
    assetId: "asset-media-extra-a", assetVersionId: "media-extra-a", expectedRecordVersion: secondExtra.workspace.recordVersion, idempotencyKey: "extra-asset-a-uat", actor });
  const extraBAsset = registerSectionCAsset({ remediationId: opened.remediation.id, extraPageId: secondExtra.extraPage.id, name: "Brass pyramid", attributePurpose: "Ambient balance",
    assetId: "asset-media-extra-b", assetVersionId: "media-extra-b", expectedRecordVersion: secondExtra.workspace.recordVersion, idempotencyKey: "extra-asset-b-uat", actor });
  const extraPlacement = (extraPageId: string, sectionCAssetId: string, key: string) => upsertSectionCPlacement({ remediationId: opened.remediation.id, extraPageId,
    sectionCAssetId, baseLayoutVersionId: selected.baseLayout.id, placementType: "EXTRA", anchorX: .4, anchorY: .45, calloutX: .68, calloutY: .48,
    calloutWidth: .2, calloutHeight: .1, showCircle: true, showFrame: true, showHighlight: false, completePlacement: true,
    expectedRecordVersion: getAppState().sectionCWorkspaces[0].recordVersion, idempotencyKey: key, actor });
  const removedExtra = extraPlacement(firstExtra.extraPage.id, extraAAsset.id, "place-extra-a-uat");
  const survivingExtra = extraPlacement(secondExtra.extraPage.id, extraBAsset.id, "place-extra-b-uat");
  assert.deepEqual([furniture.masterNumber, appliance.masterNumber, ...remedyPlacements.map((item) => item.masterNumber), removedExtra.masterNumber, survivingExtra.masterNumber], [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  deleteSectionCPlacement({ remediationId: opened.remediation.id, extraPageId: firstExtra.extraPage.id, placementId: removedExtra.id,
    expectedRecordVersion: getAppState().sectionCWorkspaces[0].recordVersion, idempotencyKey: "delete-extra-a-uat", actor });
  assert.equal(removedExtra.state, "DELETED"); assert.equal(survivingExtra.masterNumber, 8);
  for (const extra of [firstExtra, secondExtra]) finaliseSectionCPage({ remediationId: opened.remediation.id, extraPageId: extra.extraPage.id,
    expectedRecordVersion: getAppState().sectionCWorkspaces[0].recordVersion, idempotencyKey: `finalise-${extra.extraPage.id}-uat`, actor });
  const finalC = finaliseSectionCSequence({ remediationId: opened.remediation.id, expectedRecordVersion: getAppState().sectionCWorkspaces[0].recordVersion, idempotencyKey: "finalise-c-uat", actor });
  assert.equal(finalC.integrityRun?.status, "PASS");

  const state = getAppState(); const report = state.reportVersions.find((item) => item.id === seeded.report.id)!;
  const reportIntegrity = validateRemediationReportIntegrity({ remediationId: opened.remediation.id, actor });
  assert.equal(reportIntegrity.status, "PASS");
  const snapshot = resolveDocumentTemplateSnapshot(state, { organisationId, family: "VASTU_REMEDY_REPORT", documentFields: { "Client Name": "Asha Client", "Project Name": "Asha Residence", Floor: "Ground Floor", "Report Date": "2026-08-14", "Version ID": report.versionLabel, Consultant: actor.fullName } });
  assert.equal(snapshot.source, "CENTRAL");
  report.isPreview = false; report.status = "RELEASED"; const artifact: ReportArtifactManifest = { schemaVersion: "report-artifact/v1", mediaType: "text/html", createdAt: "2026-08-14T08:00:00.000Z",
    createdBy: { id: actor.id, name: actor.fullName, role: actor.role }, templateVersion: V5_REPORT_TEMPLATE_VERSION, floorId: "floor-uat", planVersionId: "plan-existing-uat",
    utilityVerdictIds: STAGE_B_REMEDY_PAGES.map((item) => `verdict-${item.pageType}`), stageBRenderManifest: buildStageBRenderManifest(state, opened.remediation.id),
    sectionARenderManifest: buildSectionARenderManifest(state, sectionA.workspace.id), sectionCRenderManifest: finalC.manifest,
    remediationReportIntegrity: { runId: reportIntegrity.id, scopeHash: reportIntegrity.scopeHash, status: "PASS" }, documentTemplateSnapshot: snapshot,
    contentHash: "", immutable: true, downloadPath: `/api/reports/${report.id}/print` };
  report.artifact = artifact; artifact.contentHash = await sha256Hex(canonicalReportPayload(state, report));
  const html = renderPrintableReport(state, report); assert.equal(html, renderPrintableReport(state, report));
  assert.ok(html.indexOf("data-section-a-manifest") < html.indexOf("data-stage-b-manifest"));
  assert.ok(html.indexOf("data-stage-b-manifest") < html.indexOf("data-section-c-manifest"));
  assert.ok(html.indexOf("data-section-c-manifest") < html.indexOf("data-remediation-master-appendix"));
  const activePlacements = state.physicalPlacements.filter((item) => item.remediationId === opened.remediation.id && item.state !== "DELETED");
  assert.ok(activePlacements.every((item) => typeof item.masterNumber === "number"));
  const activeNumbers = activePlacements.map((item) => item.masterNumber as number).sort((a, b) => a - b);
  assert.deepEqual(activeNumbers, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(state.colourFrameCompositions.length, 1); assert.equal(activeNumbers.length, 8);

  const evidenceBytes = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGPcEqXBwMDAxAAGAA8+ATocNFacAAAAAElFTkSuQmCC", "base64"));
  const evidenceChecksum = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", evidenceBytes))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const evidence = { bytes: evidenceBytes, fileName: "authoritative-existing-layout.png", mimeType: "image/png", checksumSha256: evidenceChecksum, role: "PLAN_AUTHENTICATION" as const };
  const rendered = await renderProtectedPdf({ reportVersionId: report.id, sourceSnapshotHash: artifact.contentHash, html, evidence, ownerSecret: "owner-secret-for-uat-32-characters-minimum" });
  const secondRender = await renderProtectedPdf({ reportVersionId: report.id, sourceSnapshotHash: artifact.contentHash, html, evidence, ownerSecret: "owner-secret-for-uat-32-characters-minimum" });
  assert.deepEqual(rendered.bytes, secondRender.bytes); const pdfInspection = inspectProtectedPdf(rendered.bytes);
  assert.equal(pdfInspection.encrypted, true); assert.equal(pdfInspection.editingBlocked, true); assert.equal(pdfInspection.copyingBlocked, true); assert.equal(pdfInspection.printingAllowed, true);
  const pdfHash = await sha256Hex(Array.from(rendered.bytes));
  const protectedPdf = { artifactId: "pdf-uat", organisationId, reportId: report.id, reportVersionLabel: report.versionLabel, caseId: "case-uat", projectId: "project-uat", floorId: "floor-uat",
    reportTemplateVersion: V5_REPORT_TEMPLATE_VERSION, sourceSnapshotHash: artifact.contentHash, artifactHashSha256: pdfHash, mimeType: "application/pdf" as const,
    sizeBytes: rendered.bytes.length, pageCount: rendered.pageCount, status: "RELEASED" as const, verifiedAt: "2026-08-14T08:01:00.000Z", releasedAt: "2026-08-14T08:02:00.000Z" };
  state.stageAFloorApprovalCheckpoints.push({ id: "approval-uat", organisationId, reviewSnapshotId: "review-uat", projectId: "project-uat", caseId: "case-uat", floorId: "floor-uat", reportId: report.id,
    checkpoint: "FOUNDER_APPROVED", snapshotHash: reportIntegrity.scopeHash, reportArtifactHash: artifact.contentHash, actorUserId: actor.id, actorDisplayName: actor.fullName, actorRole: "SUPER_ADMIN",
    reason: "Controlled UAT approval.", idempotencyKey: "approval-uat", occurredAt: "2026-08-14T08:00:30.000Z" });
  assert.equal(projectVastuRemedyDeliveryReadiness({ state, organisationId, reportId: report.id, protectedPdf }).ready, true);
  const delivery = prepareDocumentDelivery({ state, organisationId, actor, reportId: report.id, expectedRecordVersion: report.recordVersion, protectedPdf, idempotencyKey: "prepare-delivery-uat", requestId: "prepare-uat" }).delivery;
  markDocumentDeliveryReady({ state, organisationId, actor, deliveryId: delivery.id, expectedRecordVersion: delivery.recordVersion, protectedPdf, idempotencyKey: "ready-delivery-uat", requestId: "ready-uat" });
  deliverDocument({ state, organisationId, actor, deliveryId: delivery.id, expectedRecordVersion: delivery.recordVersion, protectedPdf, channel: "CLIENT_PORTAL", idempotencyKey: "deliver-uat", requestId: "deliver-uat" });
  appendDocumentDeliveryAccess({ state, delivery, actor: clientActor, eventType: "VIEWED", requestId: "view-uat" });
  appendDocumentDeliveryAccess({ state, delivery, actor: clientActor, eventType: "DOWNLOADED", requestId: "download-uat" });
  acknowledgeDocumentDelivery({ state, actor: clientActor, clientId: "client-uat", deliveryId: delivery.id, expectedRecordVersion: delivery.recordVersion, idempotencyKey: "acknowledge-uat", requestId: "ack-uat" });
  assert.equal(delivery.status, "ACKNOWLEDGED"); assert.equal(delivery.reportCanonicalHash, artifact.contentHash); assert.equal(delivery.protectedPdfChecksumSha256, pdfHash);
  assert.deepEqual(state.documentDeliveryEvents.map((item) => item.eventType), ["PREPARED", "READY", "DELIVERED", "VIEWED", "DOWNLOADED", "ACKNOWLEDGED"]);
  const frozenDelivery = structuredClone(delivery); const frozenReportHash = artifact.contentHash; const frozenPdfHash = pdfHash;
  state.organisationBrandProfiles.push({ id: "future-brand-draft" } as never); state.mediaAssetVersions.push({ id: "future-preferred-media" } as never);
  assert.deepEqual(delivery, frozenDelivery); assert.equal(artifact.contentHash, frozenReportHash); assert.equal(protectedPdf.artifactHashSha256, frozenPdfHash);
});
