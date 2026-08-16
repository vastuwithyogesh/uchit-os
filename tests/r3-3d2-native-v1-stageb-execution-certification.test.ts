import assert from "node:assert/strict";
import test from "node:test";
import { createNativeV1BaseFixture } from "./helpers/native-v1-evaluation-fixture.ts";
import { getAppState, setAppState } from "../lib/store.ts";
import {
  STAGE_B_REMEDY_PAGES, buildStageBRenderManifest, finaliseStageBPage, initialiseStageB,
  resolveEligibleRemedies, selectFinalRevisedLayout, upsertRemedyPlacement, validateStageBIntegrity
} from "../lib/stage-b-remediation.ts";
import {
  finaliseSectionAPage, initialiseSectionA, registerSectionAAsset, upsertExistingLayoutAnnotation,
  upsertSectionAPlacement, upsertColourFrameComposition, validateSectionAIntegrity
} from "../lib/section-a-remediation.ts";
import { validateRemediationReportIntegrity } from "../lib/section-a-remediation.ts";
import { addSectionCExtraPage, finaliseSectionCPage, finaliseSectionCSequence, validateSectionCIntegrity } from "../lib/section-c-extras.ts";
import type { StageBRemedyType } from "../lib/domain.ts";

const types = STAGE_B_REMEDY_PAGES.map((item) => item.pageType) as StageBRemedyType[];

function addExecutionAuthorities(fixture: ReturnType<typeof createNativeV1BaseFixture>) {
  const { state, organisationId, project, caseRecord, floor } = fixture;
  const media = (id: string, assetId: string, checksum: string) => state.mediaAssetVersions.push({
    id, assetId, organisationId, status: "FOUNDER_APPROVED", checksumSha256: checksum, recordVersion: 1
  } as any);
  media("media-native-furniture", "asset-native-furniture", "sha256:native-furniture");
  media("media-native-appliance", "asset-native-appliance", "sha256:native-appliance");
  media("media-native-colour", "asset-native-colour", "sha256:native-colour");
  for (const type of types) {
    const assetId = `asset-native-${type.toLowerCase()}`;
    const versionId = `media-native-${type.toLowerCase()}`;
    media(versionId, assetId, `sha256:native-${type.toLowerCase()}`);
    const source = type === "DISHA_BALANCER" ? { element: "WATER", directions: ["N"] } : type === "TATTAV_BALANCER" ? { element: "AIR", directions: [] } : type === "DISHA_ACTIVATION" ? { element: "FIRE", directions: ["SE"] } : type === "TATTAV_ACTIVATION" ? { element: "EARTH", directions: [] } : { element: "SPACE", directions: [] };
    state.remedyRepositoryRecords.push({ id: `remedy-native-${type}`, organisationId, name: `Native ${type}`, attributePurpose: `Approved ${type} purpose`, remedialType: type,
      elements: [source.element], directions: source.directions, preferredAssetId: assetId, preferredAssetVersionId: versionId, status: "APPROVED", recordVersion: 1 } as any);
    const actionByType: Record<string, string> = { TATTAV_BALANCER: "SUPPRESS", DISHA_BALANCER: "GROUND", TATTAV_ACTIVATION: "UPLIFT", DISHA_ACTIVATION: "PROMOTE", EQUALISER: "BALANCE" };
    state.methodologyRules.push({ id: `rule-native-${type}`, methodologyVersionId: fixture.stageBMethodology.id, decisionStatus: "APPROVED", conditionJson: { action: actionByType[type] }, outcomeJson: { remedialType: type }, recordVersion: 1 } as any);
  }
  for (let index = 1; index <= 6; index++) state.methodologyGoldenFixtures.push({ id: `golden-native-${index}`, methodologyVersionId: fixture.stageBMethodology.id, decisionStatus: "APPROVED", recordVersion: 1 } as any);
  state.revisedLayoutCandidates.push({ id: "candidate-native-final", organisationId, projectId: project.id, caseId: caseRecord.id, floorId: floor.id, postSiteFindingsId: "native-v1-post-site", label: "Native V1 final revised layout", evidenceRef: "private/native-v1-final-revised-layout.pdf", checksumSha256: "sha256:native-v1-final-layout", version: 1, status: "AVAILABLE", recordVersion: 1 } as any);
}

function sectionA(fixture: ReturnType<typeof createNativeV1BaseFixture>, remediation: any) {
  const { owner: actor, state } = fixture;
  setAppState(state);
  const opened = initialiseSectionA({ remediationId: remediation.id, expectedRecordVersion: remediation.recordVersion, idempotencyKey: "native-v1-section-a", actor });
  const selected = selectFinalRevisedLayout({ remediationId: remediation.id, candidateId: "candidate-native-final", expectedRecordVersion: opened.workspace ? remediation.recordVersion : remediation.recordVersion, idempotencyKey: "native-v1-layout", actor });
  const asset = (type: string, name: string, assetId: string, assetVersionId: string) => registerSectionAAsset({ remediationId: remediation.id, assetType: type, name, attributePurpose: `${name} approved purpose`, assetId, assetVersionId, expectedRecordVersion: remediation.recordVersion, idempotencyKey: `native-v1-asset-${type}`, actor });
  const furniture = asset("FURNITURE_ADDON", "Native furniture add-on", "asset-native-furniture", "media-native-furniture");
  const appliance = asset("APPLIANCE", "Native appliance", "asset-native-appliance", "media-native-appliance");
  const colour = asset("COLOUR_FRAME", "Native colour frame", "asset-native-colour", "media-native-colour");
  const existingPage = opened.visualPages.find((page) => page.pageType === "EXISTING_LAYOUT")!;
  upsertExistingLayoutAnnotation({ remediationId: remediation.id, pageId: existingPage.id, annotationType: "CIRCLE", points: [{ x: .2, y: .2 }, { x: .3, y: .3 }], colour: "#ff0000", strokeWidth: .02, opacity: 1, expectedRecordVersion: remediation.recordVersion, idempotencyKey: "native-v1-annotation", actor });
  const placement = (pageType: string, item: any, key: string) => upsertSectionAPlacement({ remediationId: remediation.id, pageId: opened.placementPages.find((page) => page.pageType === pageType)!.id, sectionAAssetId: item.id, baseLayoutVersionId: selected.baseLayout.id, placementType: pageType, anchorX: .2, anchorY: .3, calloutX: .55, calloutY: .2, calloutWidth: .25, calloutHeight: .15, showCircle: true, showFrame: true, showHighlight: false, completePlacement: true, expectedRecordVersion: remediation.recordVersion, idempotencyKey: key, actor });
  placement("FURNITURE_ADDON", furniture, "native-v1-furniture-placement");
  placement("APPLIANCE", appliance, "native-v1-appliance-placement");
  const colourPage = opened.visualPages.find((page) => page.pageType === "COLOUR_FRAME")!;
  upsertColourFrameComposition({ remediationId: remediation.id, pageId: colourPage.id, sectionAAssetId: colour.id, baseLayoutVersionId: selected.baseLayout.id, x: .1, y: .1, width: .4, height: .4, rotationDegrees: 0, opacityPreset: "FULL", preserveAspectRatio: true, printFit: true, locked: true, expectedRecordVersion: remediation.recordVersion, idempotencyKey: "native-v1-colour-composition", actor });
  for (const page of [...opened.visualPages, ...opened.placementPages].sort((a, b) => a.ordinal - b.ordinal)) finaliseSectionAPage({ remediationId: remediation.id, pageId: page.id, expectedRecordVersion: remediation.recordVersion, idempotencyKey: `native-v1-finalise-a-${page.pageType}`, actor });
  const integrity = validateSectionAIntegrity({ remediationId: remediation.id, expectedRecordVersion: remediation.recordVersion, actor });
  assert.equal(integrity.status, "PASS");
  return { opened, selected, integrity };
}

export function execute() {
  const fixture = createNativeV1BaseFixture({ stageBRemedyPattern: true });
  addExecutionAuthorities(fixture);
  setAppState(fixture.state);
  const opened = initialiseStageB({ caseId: fixture.caseRecord.id, floorId: fixture.floor.id, reportSourceId: fixture.combinedReport.id, expectedRecordVersion: fixture.caseRecord.recordVersion, idempotencyKey: "native-v1-stage-b-open", actor: fixture.owner });
  const replay = initialiseStageB({ caseId: fixture.caseRecord.id, floorId: fixture.floor.id, reportSourceId: fixture.combinedReport.id, expectedRecordVersion: 0, idempotencyKey: "native-v1-stage-b-open", actor: fixture.owner });
  assert.equal(replay.remediation.id, opened.remediation.id);
  const a = sectionA(fixture, opened.remediation);
  const resolutions = new Map<string, any>();
  for (const type of types) {
    const result = resolveEligibleRemedies({ remediationId: opened.remediation.id, stageBInputId: fixture.stageBInput.id, remedialType: type, expectedRecordVersion: opened.remediation.recordVersion, idempotencyKey: `native-v1-resolve-${type}`, actor: fixture.owner });
    assert.equal(result.eligible.length > 0, true, `${type}: ${JSON.stringify(fixture.stageBInput.decisions)}`);
    resolutions.set(type, result.eligible[0]);
  }
  for (const page of opened.pages) {
    const resolution = resolutions.get(page.pageType)!;
    upsertRemedyPlacement({ remediationId: opened.remediation.id, pageId: page.id, eligibilityResolutionId: resolution.id, baseLayoutVersionId: a.selected.baseLayout.id, placementType: "REMEDY", anchorX: .2, anchorY: .3, calloutX: .55, calloutY: .25, calloutWidth: .25, calloutHeight: .15, showCircle: true, showFrame: true, showHighlight: false, completePlacement: true, expectedRecordVersion: opened.remediation.recordVersion, idempotencyKey: `native-v1-place-${page.pageType}`, actor: fixture.owner });
  }
  let last: any;
  for (const page of opened.pages) last = finaliseStageBPage({ remediationId: opened.remediation.id, pageId: page.id, expectedRecordVersion: opened.remediation.recordVersion, idempotencyKey: `native-v1-finalise-b-${page.pageType}`, actor: fixture.owner });
  assert.equal(last.sequenceFinalised, true);
  assert.equal(last.integrityRun?.status, "PASS");
  const stageBIntegrity = validateStageBIntegrity({ remediationId: opened.remediation.id, expectedRecordVersion: opened.remediation.recordVersion, actor: fixture.owner });
  assert.equal(stageBIntegrity.status, "PASS");
  const stageBManifest = buildStageBRenderManifest(fixture.state, opened.remediation.id);
  assert.equal(stageBManifest.pages.length, 5);
  assert.equal(stageBManifest.pages.every((page) => page.provenance?.length === 1), true);
  const extra = addSectionCExtraPage({ remediationId: opened.remediation.id, title: "Native V1 minimal Section C context", expectedRecordVersion: opened.remediation.recordVersion, idempotencyKey: "native-v1-section-c-extra", actor: fixture.owner });
  const sectionCPage = finaliseSectionCPage({ remediationId: opened.remediation.id, extraPageId: extra.extraPage.id, expectedRecordVersion: extra.workspace.recordVersion, idempotencyKey: "native-v1-section-c-page", actor: fixture.owner });
  assert.equal(sectionCPage.page.state, "FINALISED");
  const sectionC = finaliseSectionCSequence({ remediationId: opened.remediation.id, expectedRecordVersion: sectionCPage.workspace.recordVersion, idempotencyKey: "native-v1-section-c-sequence", actor: fixture.owner });
  assert.equal(sectionC.integrityRun?.status, "PASS");
  assert.equal(validateSectionCIntegrity({ remediationId: opened.remediation.id, expectedRecordVersion: sectionC.workspace.recordVersion, actor: fixture.owner }).status, "PASS");
  const reportIntegrity = validateRemediationReportIntegrity({ remediationId: opened.remediation.id, actor: fixture.owner });
  assert.equal(reportIntegrity.status, "PASS");
  return { fixture, opened, stageBManifest, stageBIntegrity, reportIntegrity };
}

test("R3.3D2 certifies executable native V1 Stage-B composition and provenance", () => {
  const result = execute();
  assert.equal(result.stageBManifest.reportSourceId, result.fixture.combinedReport.id);
  assert.equal(result.stageBManifest.reportSourceHash, result.fixture.combinedReport.contentHash);
  assert.equal(result.stageBManifest.pages.flatMap((page) => page.implementationRows).length, 5);
  assert.equal(result.reportIntegrity.status, "PASS");
});

test("R3.3D2 rejects lineage, placement, StageBInput, and cross-floor tampering", () => {
  const result = execute(); const { state, owner, floor, caseRecord, combinedReport } = result.fixture; const remediation = result.opened.remediation;
  remediation.reportSourceId = "tampered-report";
  assert.throws(() => validateStageBIntegrity({ remediationId: remediation.id, expectedRecordVersion: remediation.recordVersion, actor: owner }), /source|scope/i);
  remediation.reportSourceId = combinedReport.id; remediation.reportSourceHash = "tampered-hash";
  assert.throws(() => buildStageBRenderManifest(state, remediation.id));
  remediation.reportSourceHash = combinedReport.contentHash;
  const placement = state.physicalPlacements.find((item) => item.remediationId === remediation.id && item.placementType === "REMEDY")!;
  placement.caseId = "tampered-case";
  assert.equal(validateStageBIntegrity({ remediationId: remediation.id, expectedRecordVersion: remediation.recordVersion, actor: owner }).status, "FAIL");
  placement.caseId = caseRecord.id;
  assert.throws(() => resolveEligibleRemedies({ remediationId: remediation.id, stageBInputId: "tampered-stageb-input", remedialType: "EQUALISER", expectedRecordVersion: remediation.recordVersion, idempotencyKey: "native-v1-tampered-stageb-input", actor: owner }), /Finalized V1 Stage B input/i);
  const secondFloor = { ...floor, id: "floor-native-v1-second", floorLabel: "Second Floor" } as any;
  state.floorWorkspaces.push(secondFloor);
  setAppState(state);
  assert.throws(() => initialiseStageB({ caseId: caseRecord.id, floorId: secondFloor.id, reportSourceId: combinedReport.id, expectedRecordVersion: caseRecord.recordVersion, idempotencyKey: "native-v1-cross-floor", actor: owner }), /finalized|floor|scope|Stage B/i);
});
