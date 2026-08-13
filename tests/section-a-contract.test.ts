import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { StageBRemedyType } from "../lib/domain.ts";
import { canonicalReportPayload, V5_REPORT_TEMPLATE_VERSION } from "../lib/report-artifacts.ts";
import { renderPrintableReport } from "../lib/report-html.ts";
import {
  buildSectionARenderManifest, deleteSectionAPlacement, finaliseSectionAPage, initialiseSectionA,
  registerSectionAAsset, upsertColourFrameComposition, upsertExistingLayoutAnnotation, upsertSectionAPlacement,
  validateRemediationReportIntegrity, validateSectionAIntegrity
} from "../lib/section-a-remediation.ts";
import {
  buildStageBRenderManifest, ensureStageBReservation, finaliseStageBPage, initialiseStageB, resolveEligibleRemedies,
  selectFinalRevisedLayout, STAGE_B_AUTHORITY_HASH, STAGE_B_REMEDY_PAGES, STAGE_B_RESOLVER_VERSION,
  upsertRemedyPlacement
} from "../lib/stage-b-remediation.ts";
import { createEmptyAppState, getAppState, setAppState } from "../lib/store.ts";

const sourceFraming: Record<StageBRemedyType, string> = {
  DISHA_BALANCER: "Disha Balancer", DISHA_ACTIVATION: "Disha Activation", TATTAV_BALANCER: "Tattva Balancer",
  TATTAV_ACTIVATION: "Tattva Activation", EQUALISER: "Equaliser"
};

function fixture() {
  const state = createEmptyAppState();
  const actor: any = { id: "founder-1", fullName: "Founder", email: "founder@example.test", role: "ADMIN", organisationId: "org-1" };
  const owned = { organisationId: "org-1", createdByActorUserId: actor.id, updatedByActorUserId: actor.id, recordVersion: 1 };
  state.projects.push({ id: "project-1", clientId: "client-1", activeCaseId: "case-1", ...owned } as any);
  state.vastuCases.push({ id: "case-1", clientId: "client-1", projectId: "project-1", caseNumber: "UV-1", balanceApproved: true, fullPaymentApproved: true, ...owned } as any);
  state.floorWorkspaces.push({ id: "floor-1", projectId: "project-1", caseId: "case-1", floorLabel: "Ground Floor", ...owned } as any);
  state.planVersions.push({ id: "plan-existing-1", projectId: "project-1", caseId: "case-1", floorId: "floor-1", protectedFileRef: "private/existing-layout.pdf", status: "CURRENT", ...owned } as any);
  const verdicts = {} as Record<StageBRemedyType, any>;
  for (const [index, configuration] of STAGE_B_REMEDY_PAGES.entries()) {
    const verdict: any = { id: `verdict-${configuration.pageType}`, projectId: "project-1", caseId: "case-1", floorId: "floor-1", status: "APPROVED", element: "Earth",
      directionSet: ["SW"], triggeredDirections: ["SW"], solutionFraming: sourceFraming[configuration.pageType], outputHash: `verdict-hash-${index + 1}`, ...owned };
    verdicts[configuration.pageType] = verdict; state.utilityVerdicts.push(verdict);
  }
  const report: any = { id: "report-stage-a-1", caseId: "case-1", floorId: "floor-1", versionLabel: "Stage A", isPreview: true, status: "READY_FOR_APPROVAL",
    artifact: { schemaVersion: "report-artifact/v1", mediaType: "text/html", immutable: true, templateVersion: "uchit-verdict/v4", planVersionId: "plan-existing-1",
      utilityVerdictIds: Object.values(verdicts).map((item) => item.id), contentHash: "stage-a-hash", downloadPath: "/protected", createdAt: "2026-01-01T00:00:00.000Z", createdBy: { id: actor.id, name: actor.fullName, role: actor.role } }, ...owned };
  state.reportVersions.push(report);
  state.postSiteFindings.push({ id: "findings-1", projectId: "project-1", caseId: "case-1", floorId: "floor-1", version: 1, status: "FOUNDER_APPROVED", needsRegeneration: false, ...owned } as any);
  state.methodologyVersions.push({ id: "method-stage-b-1", module: "STAGE_B_REMEDIAL", lifecycleStatus: "ACTIVE", executionAdapterVersion: STAGE_B_RESOLVER_VERSION,
    sourceAssetHash: STAGE_B_AUTHORITY_HASH, contentHash: "method-hash-1", ...owned } as any);
  for (const configuration of STAGE_B_REMEDY_PAGES) state.methodologyRules.push({ id: `rule-${configuration.pageType}`, methodologyVersionId: "method-stage-b-1", decisionStatus: "APPROVED", outcomeJson: { remedialType: configuration.pageType }, ...owned } as any);
  for (let index = 1; index <= 6; index++) state.methodologyGoldenFixtures.push({ id: `fixture-${index}`, methodologyVersionId: "method-stage-b-1", decisionStatus: "APPROVED", ...owned } as any);
  for (const configuration of STAGE_B_REMEDY_PAGES) {
    const suffix = configuration.pageType;
    state.mediaAssetVersions.push({ id: `asset-version-${suffix}`, assetId: `asset-${suffix}`, status: "FOUNDER_APPROVED", checksumSha256: `asset-hash-${suffix}`, ...owned } as any);
    state.remedyRepositoryRecords.push({ id: `remedy-${suffix}`, name: configuration.label, attributePurpose: `${configuration.label} approved purpose`, remedialType: configuration.pageType,
      elements: ["Earth"], directions: ["SW"], preferredAssetId: `asset-${suffix}`, preferredAssetVersionId: `asset-version-${suffix}`, status: "APPROVED", ...owned } as any);
  }
  for (const [assetType, suffix] of [["FURNITURE_ADDON", "furniture"], ["APPLIANCE", "appliance"], ["COLOUR_FRAME", "colour"]] as const) {
    state.mediaAssetVersions.push({ id: `asset-version-${suffix}`, assetId: `asset-${suffix}`, status: "FOUNDER_APPROVED", checksumSha256: `asset-hash-${suffix}`, assetType, ...owned } as any);
  }
  for (const [candidateId, checksum] of [["candidate-a", "candidate-hash-a"], ["candidate-b", "candidate-hash-b"]]) state.revisedLayoutCandidates.push({ id: candidateId,
    projectId: "project-1", caseId: "case-1", floorId: "floor-1", postSiteFindingsId: "findings-1", label: candidateId, evidenceRef: `private/${candidateId}.pdf`, checksumSha256: checksum,
    version: 1, status: "AVAILABLE", createdAt: "2026-01-01T00:00:00.000Z", ...owned } as any);
  setAppState(state);
  assert.equal(ensureStageBReservation({ caseId: "case-1", floorId: "floor-1", actor })?.status, "READY_FOR_CONFIGURATION");
  const opened = initialiseStageB({ caseId: "case-1", floorId: "floor-1", reportId: report.id, expectedRecordVersion: 1, idempotencyKey: "open-1", actor });
  return { actor, report, verdicts, opened };
}

function page<T extends string>(items: Array<{ pageType: string; id: string }>, type: T) {
  return items.find((item) => item.pageType === type)!;
}

function registerAssets(setup: ReturnType<typeof fixture>) {
  const values = {} as Record<"FURNITURE_ADDON" | "APPLIANCE" | "COLOUR_FRAME", ReturnType<typeof registerSectionAAsset>>;
  for (const [assetType, suffix, name] of [["FURNITURE_ADDON", "furniture", "Brass console"], ["APPLIANCE", "appliance", "Compact heater"], ["COLOUR_FRAME", "colour", "Warm neutral chart"]] as const) {
    values[assetType] = registerSectionAAsset({ remediationId: setup.opened.remediation.id, assetType, name, attributePurpose: `${name} purpose`, assetId: `asset-${suffix}`,
      assetVersionId: `asset-version-${suffix}`, expectedRecordVersion: setup.opened.remediation.recordVersion, idempotencyKey: `register-${suffix}`, actor: setup.actor });
  }
  return values;
}

function placeSectionA(setup: ReturnType<typeof fixture>, pages: ReturnType<typeof initialiseSectionA>["placementPages"], assetId: string,
  placementType: "FURNITURE_ADDON" | "APPLIANCE", baseLayoutVersionId: string, key: string) {
  return upsertSectionAPlacement({ remediationId: setup.opened.remediation.id, pageId: page(pages, placementType).id, sectionAAssetId: assetId, baseLayoutVersionId, placementType,
    anchorX: .18, anchorY: .28, calloutX: .58, calloutY: .22, calloutWidth: .24, calloutHeight: .14, showCircle: true, showFrame: true, showHighlight: false,
    completePlacement: true, expectedRecordVersion: setup.opened.remediation.recordVersion, idempotencyKey: key, actor: setup.actor });
}

function resolveAll(setup: ReturnType<typeof fixture>) {
  const values = {} as Record<StageBRemedyType, ReturnType<typeof resolveEligibleRemedies>>;
  for (const configuration of STAGE_B_REMEDY_PAGES) values[configuration.pageType] = resolveEligibleRemedies({ remediationId: setup.opened.remediation.id,
    verdictId: setup.verdicts[configuration.pageType].id, remedialType: configuration.pageType, expectedRecordVersion: setup.opened.remediation.recordVersion,
    idempotencyKey: `resolve-${configuration.pageType}`, actor: setup.actor });
  return values;
}

function completeReport() {
  const setup = fixture();
  const openedA = initialiseSectionA({ remediationId: setup.opened.remediation.id, expectedRecordVersion: setup.opened.remediation.recordVersion, idempotencyKey: "section-a-open", actor: setup.actor });
  const replay = initialiseSectionA({ remediationId: setup.opened.remediation.id, expectedRecordVersion: 0, idempotencyKey: "section-a-open", actor: setup.actor });
  assert.deepEqual(replay.visualPages.map((item) => [item.id, item.pageType, item.ordinal]), openedA.visualPages.map((item) => [item.id, item.pageType, item.ordinal]));
  const selected = selectFinalRevisedLayout({ remediationId: setup.opened.remediation.id, candidateId: "candidate-a", expectedRecordVersion: setup.opened.remediation.recordVersion, idempotencyKey: "select-a", actor: setup.actor });
  const assets = registerAssets(setup);
  const existingPage = page(openedA.visualPages, "EXISTING_LAYOUT");
  upsertExistingLayoutAnnotation({ remediationId: setup.opened.remediation.id, pageId: existingPage.id, annotationType: "ARROW", points: [{ x: .1, y: .15 }, { x: .35, y: .42 }],
    colour: "#8A4B25", strokeWidth: .01, opacity: .8, expectedRecordVersion: setup.opened.remediation.recordVersion, idempotencyKey: "annotation-arrow", actor: setup.actor });
  const removedFurniture = placeSectionA(setup, openedA.placementPages, assets.FURNITURE_ADDON.id, "FURNITURE_ADDON", selected.baseLayout.id, "furniture-removed");
  const appliance = placeSectionA(setup, openedA.placementPages, assets.APPLIANCE.id, "APPLIANCE", selected.baseLayout.id, "appliance-live");
  const furniture = placeSectionA(setup, openedA.placementPages, assets.FURNITURE_ADDON.id, "FURNITURE_ADDON", selected.baseLayout.id, "furniture-live");
  assert.deepEqual([removedFurniture.masterNumber, furniture.masterNumber, appliance.masterNumber], [1, 2, 3]);
  const deletion = deleteSectionAPlacement({ remediationId: setup.opened.remediation.id, pageId: page(openedA.placementPages, "FURNITURE_ADDON").id,
    placementId: removedFurniture.id, expectedRecordVersion: setup.opened.remediation.recordVersion, idempotencyKey: "delete-furniture", actor: setup.actor });
  assert.deepEqual(deletion.placements.map((item) => item.masterNumber), [1, 2]);
  const colour = upsertColourFrameComposition({ remediationId: setup.opened.remediation.id, pageId: page(openedA.visualPages, "COLOUR_FRAME").id, sectionAAssetId: assets.COLOUR_FRAME.id,
    baseLayoutVersionId: selected.baseLayout.id, x: .08, y: .12, width: .34, height: .28, rotationDegrees: 90, opacityPreset: "MEDIUM", preserveAspectRatio: true,
    printFit: true, locked: true, expectedRecordVersion: setup.opened.remediation.recordVersion, idempotencyKey: "colour-live", actor: setup.actor });
  let sectionResult: ReturnType<typeof finaliseSectionAPage> | undefined;
  for (const type of ["EXISTING_LAYOUT", "FINAL_REVISED_LAYOUT", "FURNITURE_ADDON", "APPLIANCE", "COLOUR_FRAME"] as const) {
    const target = page([...openedA.visualPages, ...openedA.placementPages], type);
    sectionResult = finaliseSectionAPage({ remediationId: setup.opened.remediation.id, pageId: target.id, expectedRecordVersion: setup.opened.remediation.recordVersion,
      idempotencyKey: `finalise-${type}`, actor: setup.actor });
    if (type === "FURNITURE_ADDON") assert.equal(selected.baseLayout.state, "LOCKED");
  }
  assert.equal(sectionResult?.sectionFinalised, true); assert.equal(sectionResult?.integrityRun?.status, "PASS");
  const resolutions = resolveAll(setup);
  const dishaPage = page(setup.opened.pages, "DISHA_BALANCER");
  const remedy = upsertRemedyPlacement({ remediationId: setup.opened.remediation.id, pageId: dishaPage.id, eligibilityResolutionId: resolutions.DISHA_BALANCER.eligible[0].id,
    baseLayoutVersionId: selected.baseLayout.id, placementType: "REMEDY", anchorX: .25, anchorY: .35, calloutX: .55, calloutY: .25, calloutWidth: .25, calloutHeight: .15,
    showCircle: true, showFrame: true, showHighlight: false, completePlacement: true, expectedRecordVersion: setup.opened.remediation.recordVersion, idempotencyKey: "place-remedy", actor: setup.actor });
  let stageBResult: ReturnType<typeof finaliseStageBPage> | undefined;
  for (const configuration of STAGE_B_REMEDY_PAGES) stageBResult = finaliseStageBPage({ remediationId: setup.opened.remediation.id,
    pageId: page(setup.opened.pages, configuration.pageType).id, expectedRecordVersion: setup.opened.remediation.recordVersion,
    idempotencyKey: `finalise-b-${configuration.pageType}`, actor: setup.actor });
  assert.equal(stageBResult?.sequenceFinalised, true); assert.equal(stageBResult?.integrityRun?.status, "PASS");
  const reportIntegrity = validateRemediationReportIntegrity({ remediationId: setup.opened.remediation.id, actor: setup.actor });
  assert.equal(reportIntegrity.status, "PASS");
  return { ...setup, openedA, selected, assets, furniture, appliance, removedFurniture, remedy, colour, sectionManifest: sectionResult!.manifest!, stageBManifest: stageBResult!.manifest!, reportIntegrity };
}

test("Section A initialises exact ordered pages and validates category-specific assets, annotations and placements", () => {
  const setup = fixture(); const openedA = initialiseSectionA({ remediationId: setup.opened.remediation.id, expectedRecordVersion: setup.opened.remediation.recordVersion, idempotencyKey: "section-a-open", actor: setup.actor });
  assert.deepEqual(openedA.visualPages.map((item) => [item.pageType, item.ordinal]), [["EXISTING_LAYOUT", 1], ["FINAL_REVISED_LAYOUT", 2], ["COLOUR_FRAME", 7]]);
  assert.deepEqual(openedA.placementPages.map((item) => [item.section, item.pageType, item.ordinal]), [["A", "FURNITURE_ADDON", 3], ["A", "APPLIANCE", 5]]);
  const selected = selectFinalRevisedLayout({ remediationId: setup.opened.remediation.id, candidateId: "candidate-a", expectedRecordVersion: setup.opened.remediation.recordVersion, idempotencyKey: "select-a", actor: setup.actor });
  const assets = registerAssets(setup);
  assert.throws(() => placeSectionA(setup, openedA.placementPages, assets.APPLIANCE.id, "FURNITURE_ADDON", selected.baseLayout.id, "wrong-category"), /does not belong to this placement category/);
  assert.throws(() => upsertExistingLayoutAnnotation({ remediationId: setup.opened.remediation.id, pageId: page(openedA.visualPages, "EXISTING_LAYOUT").id,
    annotationType: "ARROW", points: [{ x: .1, y: .1 }], colour: "#112233", strokeWidth: .01, opacity: .5,
    expectedRecordVersion: setup.opened.remediation.recordVersion, idempotencyKey: "bad-arrow", actor: setup.actor }), /geometry is incomplete/);
  const placement = placeSectionA(setup, openedA.placementPages, assets.FURNITURE_ADDON.id, "FURNITURE_ADDON", selected.baseLayout.id, "valid-furniture");
  assert.equal(placement.placementType, "FURNITURE_ADDON"); assert.equal(placement.eligibilityResolutionId, undefined); assert.equal(placement.remedyId, undefined);
});

test("base-layout change invalidates Section A geometry without remapping and explicit reconciliation uses the existing lifecycle", () => {
  const setup = fixture(); const openedA = initialiseSectionA({ remediationId: setup.opened.remediation.id, expectedRecordVersion: setup.opened.remediation.recordVersion, idempotencyKey: "section-a-open", actor: setup.actor });
  const first = selectFinalRevisedLayout({ remediationId: setup.opened.remediation.id, candidateId: "candidate-a", expectedRecordVersion: setup.opened.remediation.recordVersion, idempotencyKey: "select-a", actor: setup.actor });
  const assets = registerAssets(setup);
  const placement = upsertSectionAPlacement({ remediationId: setup.opened.remediation.id, pageId: page(openedA.placementPages, "FURNITURE_ADDON").id, sectionAAssetId: assets.FURNITURE_ADDON.id,
    baseLayoutVersionId: first.baseLayout.id, placementType: "FURNITURE_ADDON", anchorX: .22, anchorY: .33, calloutX: .6, calloutY: .2, calloutWidth: .2, calloutHeight: .15,
    showCircle: true, showFrame: true, showHighlight: false, completePlacement: false, expectedRecordVersion: setup.opened.remediation.recordVersion, idempotencyKey: "draft-placement", actor: setup.actor });
  const composition = upsertColourFrameComposition({ remediationId: setup.opened.remediation.id, pageId: page(openedA.visualPages, "COLOUR_FRAME").id, sectionAAssetId: assets.COLOUR_FRAME.id,
    baseLayoutVersionId: first.baseLayout.id, x: .1, y: .1, width: .3, height: .25, rotationDegrees: 0, opacityPreset: "LOW", preserveAspectRatio: true, printFit: true, locked: false,
    expectedRecordVersion: setup.opened.remediation.recordVersion, idempotencyKey: "draft-colour", actor: setup.actor });
  const second = selectFinalRevisedLayout({ remediationId: setup.opened.remediation.id, candidateId: "candidate-b", expectedRecordVersion: setup.opened.remediation.recordVersion, idempotencyKey: "select-b", actor: setup.actor });
  assert.equal(placement.dependencyReviewState, "NEEDS_REVIEW"); assert.equal(composition.dependencyReviewState, "NEEDS_REVIEW");
  assert.deepEqual([placement.anchorX, placement.anchorY, placement.calloutX, placement.calloutY], [.22, .33, .6, .2]);
  const state = getAppState(), placementInvalidation = state.dependencyInvalidations.find((item) => item.targetId === placement.id)!, colourInvalidation = state.dependencyInvalidations.find((item) => item.targetId === composition.id)!;
  assert.equal(placementInvalidation.targetType, "SECTION_A_PLACEMENT"); assert.equal(colourInvalidation.targetType, "COLOUR_FRAME_COMPOSITION");
  const reconciledPlacement = upsertSectionAPlacement({ remediationId: setup.opened.remediation.id, pageId: page(openedA.placementPages, "FURNITURE_ADDON").id, placementId: placement.id,
    sectionAAssetId: assets.FURNITURE_ADDON.id, baseLayoutVersionId: second.baseLayout.id, placementType: "FURNITURE_ADDON", anchorX: .22, anchorY: .33, calloutX: .6, calloutY: .2,
    calloutWidth: .2, calloutHeight: .15, showCircle: true, showFrame: true, showHighlight: false, completePlacement: true, reconcileInvalidationId: placementInvalidation.id,
    expectedRecordVersion: setup.opened.remediation.recordVersion, idempotencyKey: "reconcile-placement", actor: setup.actor });
  const reconciledColour = upsertColourFrameComposition({ remediationId: setup.opened.remediation.id, pageId: page(openedA.visualPages, "COLOUR_FRAME").id, compositionId: composition.id,
    sectionAAssetId: assets.COLOUR_FRAME.id, baseLayoutVersionId: second.baseLayout.id, x: .1, y: .1, width: .3, height: .25, rotationDegrees: 90, opacityPreset: "FULL",
    preserveAspectRatio: true, printFit: true, locked: true, reconcileInvalidationId: colourInvalidation.id, expectedRecordVersion: setup.opened.remediation.recordVersion,
    idempotencyKey: "reconcile-colour", actor: setup.actor });
  assert.equal(reconciledPlacement.dependencyReviewState, "CURRENT"); assert.equal(reconciledColour.dependencyReviewState, "CURRENT");
  assert.equal(placementInvalidation.status, "READY_FOR_REVIEW"); assert.equal(colourInvalidation.status, "READY_FOR_REVIEW");
  assert.equal(state.regenerationResolutions.filter((item) => item.invalidationId === placementInvalidation.id).length, 3);
  assert.equal(state.regenerationResolutions.filter((item) => item.invalidationId === colourInvalidation.id).length, 3);
});

test("a present Section A workspace must finalise before the last Remedy page freezes the report-wide sequence", () => {
  const setup = fixture(); initialiseSectionA({ remediationId: setup.opened.remediation.id, expectedRecordVersion: setup.opened.remediation.recordVersion, idempotencyKey: "section-a-open", actor: setup.actor });
  selectFinalRevisedLayout({ remediationId: setup.opened.remediation.id, candidateId: "candidate-a", expectedRecordVersion: setup.opened.remediation.recordVersion, idempotencyKey: "select-a", actor: setup.actor });
  for (const configuration of STAGE_B_REMEDY_PAGES.slice(0, -1)) finaliseStageBPage({ remediationId: setup.opened.remediation.id, pageId: page(setup.opened.pages, configuration.pageType).id,
    expectedRecordVersion: setup.opened.remediation.recordVersion, idempotencyKey: `finalise-${configuration.pageType}`, actor: setup.actor });
  const last = setup.opened.pages.find((item) => item.pageType === "EQUALISER")!;
  assert.throws(() => finaliseStageBPage({ remediationId: setup.opened.remediation.id, pageId: last.id, expectedRecordVersion: setup.opened.remediation.recordVersion,
    idempotencyKey: "finalise-EQUALISER", actor: setup.actor }), /Section A must be integrity-finalised/);
  assert.equal(last.state, "DRAFT"); assert.notEqual(setup.opened.remediation.state, "PAGE_FINALISED");
});

test("report-wide sequence spans Furniture, Appliances and Remedy pages; tombstones and Colour Frames are excluded", () => {
  const completed = completeReport(); const state = getAppState();
  assert.deepEqual([completed.furniture.masterNumber, completed.appliance.masterNumber, completed.remedy.masterNumber], [1, 2, 3]);
  assert.equal(state.physicalPlacements.find((item) => item.id === completed.removedFurniture.id)?.state, "DELETED");
  assert.equal(completed.sectionManifest.placementPages.flatMap((item) => item.placements).length, 2);
  assert.equal(completed.sectionManifest.appendixRows.length, 2); assert.equal(completed.stageBManifest.appendixRows.length, 1);
  assert.equal(state.placementImplementationRows.length, 3); assert.equal(state.masterAppendixRows.length, 3);
  assert.equal(state.physicalPlacements.some((item) => item.pageId === completed.colour.pageId), false);
  assert.equal(completed.sectionManifest.placementPages.some((item) => item.implementationRows.some((row) => row.implemented !== null || row.implementationDate !== null || row.alternativeNeeded !== null)), false);
});

test("immutable Section A and unchanged Stage B manifests compose deterministically in Section A then Stage B order", () => {
  const completed = completeReport(), state = getAppState();
  assert.deepEqual(buildSectionARenderManifest(state, completed.openedA.workspace.id), completed.sectionManifest);
  assert.deepEqual(buildSectionARenderManifest(state, completed.openedA.workspace.id), buildSectionARenderManifest(state, completed.openedA.workspace.id));
  assert.deepEqual(buildStageBRenderManifest(state, completed.opened.remediation.id), completed.stageBManifest);
  assert.equal(completed.stageBManifest.schemaVersion, "stage-b-render-manifest/v1");
  completed.report.artifact = { ...completed.report.artifact, templateVersion: V5_REPORT_TEMPLATE_VERSION, stageBRenderManifest: completed.stageBManifest,
    sectionARenderManifest: completed.sectionManifest, remediationReportIntegrity: { runId: completed.reportIntegrity.id, scopeHash: completed.reportIntegrity.scopeHash, status: "PASS" } };
  const canonical = canonicalReportPayload(state, completed.report) as any;
  assert.equal(canonical.sectionARenderManifest.schemaVersion, "section-a-render-manifest/v1"); assert.equal(canonical.stageBRenderManifest.schemaVersion, "stage-b-render-manifest/v1");
  const firstHtml = renderPrintableReport(state, completed.report), secondHtml = renderPrintableReport(state, completed.report);
  assert.equal(firstHtml, secondHtml); assert.ok(firstHtml.indexOf("data-section-a-manifest") < firstHtml.indexOf("data-stage-b-manifest"));
  assert.match(firstHtml, /data-section-a-page="FURNITURE_ADDON"/); assert.match(firstHtml, /data-section-a-page="APPLIANCE"/); assert.match(firstHtml, /data-section-a-page="COLOUR_FRAME"/);
  assert.equal((firstHtml.match(/<h2>Master Appendix<\/h2>/g) ?? []).length, 1); assert.match(firstHtml, /data-remediation-master-appendix/);
});

test("Section A and report-wide integrity detect category, numbering and projection tampering", () => {
  const completed = completeReport(), baseline = structuredClone(getAppState());
  function reportCodes(mutate: (state: ReturnType<typeof getAppState>) => void) {
    setAppState(structuredClone(baseline)); const state = getAppState(); mutate(state);
    return validateRemediationReportIntegrity({ remediationId: completed.opened.remediation.id, actor: completed.actor }).issues.map((item) => item.code);
  }
  assert.ok(reportCodes((state) => { state.physicalPlacements.find((item) => item.id === completed.remedy.id)!.masterNumber = 1; }).includes("REPORT_MASTER_SEQUENCE_DUPLICATE"));
  assert.ok(reportCodes((state) => { state.physicalPlacements.find((item) => item.id === completed.appliance.id)!.masterNumber = 8; }).includes("REPORT_MASTER_SEQUENCE_GAP"));
  assert.ok(reportCodes((state) => { state.physicalPlacements.find((item) => item.id === completed.furniture.id)!.placementType = "APPLIANCE"; }).includes("REPORT_PLACEMENT_SCOPE_MISMATCH"));
  assert.ok(reportCodes((state) => { state.physicalPlacements.find((item) => item.id === completed.appliance.id)!.pageId = page(state.sectionAVisualPages, "COLOUR_FRAME").id; }).includes("REPORT_PLACEMENT_SCOPE_MISMATCH"));
  assert.ok(reportCodes((state) => { state.physicalPlacements.find((item) => item.id === completed.furniture.id)!.baseLayoutVersionId = "base-other"; }).includes("REPORT_PLACEMENT_SCOPE_MISMATCH"));
  assert.ok(reportCodes((state) => { state.physicalPlacements.find((item) => item.id === completed.remedy.id)!.floorId = "floor-other"; }).includes("REPORT_PLACEMENT_SCOPE_MISMATCH"));
  assert.ok(reportCodes((state) => { state.reportPlacementPages.find((item) => item.pageType === "APPLIANCE")!.ordinal = 99; }).includes("REPORT_PAGE_ORDER_INVALID"));
  assert.ok(reportCodes((state) => { state.placementImplementationRows = state.placementImplementationRows.filter((item) => item.placementId !== completed.appliance.id); }).includes("REPORT_IMPLEMENTATION_ROW_MISMATCH"));
  assert.ok(reportCodes((state) => { state.masterAppendixRows = state.masterAppendixRows.filter((item) => item.placementId !== completed.furniture.id); }).includes("REPORT_APPENDIX_ROW_MISMATCH"));
  setAppState(structuredClone(baseline)); const state = getAppState(); state.colourFrameCompositions.find((item) => item.id === completed.colour.id)!.printFit = false;
  const sectionRun = validateSectionAIntegrity({ remediationId: completed.opened.remediation.id,
    expectedRecordVersion: state.stageBRemediations.find((item) => item.id === completed.opened.remediation.id)!.recordVersion, actor: completed.actor });
  assert.ok(sectionRun.issues.map((item) => item.code).includes("COLOUR_FRAME_COMPOSITION_INVALID"));
  setAppState(baseline);
});

test("flat actions, AppState snapshots, HTML and protected-PDF gates are additive without changing the Stage B manifest schema", () => {
  const route = readFileSync(new URL("../app/api/actions/route.ts", import.meta.url), "utf8");
  const domain = readFileSync(new URL("../lib/domain.ts", import.meta.url), "utf8");
  const store = readFileSync(new URL("../lib/store.ts", import.meta.url), "utf8");
  const merge = readFileSync(new URL("../lib/persistence-merge.ts", import.meta.url), "utf8");
  const finalPdf = readFileSync(new URL("../lib/final-pdf.server.ts", import.meta.url), "utf8");
  for (const action of ["section-a-initialise", "section-a-asset-register", "section-a-annotation-upsert", "section-a-annotation-delete", "section-a-placement-upsert",
    "section-a-placement-delete", "section-a-colour-frame-upsert", "section-a-colour-frame-delete", "section-a-page-finalise", "section-a-integrity-validate", "remediation-report-integrity-validate"]) {
    assert.match(route, new RegExp(`case "${action}"`));
  }
  for (const collection of ["sectionAWorkspaces", "sectionAVisualPages", "sectionAAssets", "existingLayoutAnnotations", "colourFrameCompositions", "sectionAIntegrityRuns", "remediationReportIntegrityRuns"]) {
    assert.match(store, new RegExp(collection)); assert.match(merge, new RegExp(collection));
  }
  assert.equal((domain.match(/schemaVersion: "stage-b-render-manifest\/v1"/g) ?? []).length, 1);
  assert.match(domain, /schemaVersion: "section-a-render-manifest\/v1"/);
  assert.match(finalPdf, /Protected final PDF requires Section A and report-wide integrity PASS/);
  assert.match(finalPdf, /sectionARenderManifest/); assert.match(finalPdf, /stageBRenderManifest\?\.integrityStatus !== "PASS"/);
});
