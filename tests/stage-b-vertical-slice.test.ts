import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createEmptyAppState, getAppState, setAppState } from "../lib/store.ts";
import {
  adaptStageBSourceFraming, buildStageBRenderManifest, deleteRemedyPlacement, ensureStageBReservation,
  finaliseStageBPage, initialiseStageB, resolveEligibleRemedies, selectFinalRevisedLayout,
  STAGE_B_AUTHORITY_HASH, STAGE_B_REMEDY_PAGES, STAGE_B_RESOLVER_VERSION, upsertRemedyPlacement,
  validateStageBIntegrity
} from "../lib/stage-b-remediation.ts";
import { canonicalReportPayload, V5_REPORT_TEMPLATE_VERSION } from "../lib/report-artifacts.ts";
import { renderPrintableReport } from "../lib/report-html.ts";
import { resolveRemedySource } from "../lib/remedy-source.ts";
import type { StageBRemedyType } from "../lib/domain.ts";

const sourceFraming: Record<StageBRemedyType, string> = {
  DISHA_BALANCER: "Disha Balancer",
  DISHA_ACTIVATION: "Disha Activation",
  TATTAV_BALANCER: "Tattva Balancer",
  TATTAV_ACTIVATION: "Tattva Activation",
  EQUALISER: "Equaliser"
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
  state.methodologyVersions.push({ id: "method-stage-b-1", module: "STAGE_B_REMEDIAL", lifecycleStatus: "ACTIVE", executionAdapterVersion: STAGE_B_RESOLVER_VERSION, sourceAssetHash: STAGE_B_AUTHORITY_HASH, contentHash: "method-hash-1", ...owned } as any);
  const stageBActionByType: Record<string, string> = { TATTAV_BALANCER: "SUPPRESS", DISHA_BALANCER: "GROUND", TATTAV_ACTIVATION: "UPLIFT", DISHA_ACTIVATION: "PROMOTE", EQUALISER: "BALANCE" };
  for (const configuration of STAGE_B_REMEDY_PAGES) state.methodologyRules.push({ id: `rule-${configuration.pageType}`, methodologyVersionId: "method-stage-b-1", decisionStatus: "APPROVED", conditionJson: { action: stageBActionByType[configuration.pageType] }, outcomeJson: { remedialType: configuration.pageType }, ...owned } as any);
  for (let index = 1; index <= 6; index++) state.methodologyGoldenFixtures.push({ id: `fixture-${index}`, methodologyVersionId: "method-stage-b-1", decisionStatus: "APPROVED", ...owned } as any);
  for (const configuration of STAGE_B_REMEDY_PAGES) {
    for (let index = 1; index <= 2; index++) {
      const suffix = `${configuration.pageType}-${index}`;
      state.mediaAssetVersions.push({ id: `asset-version-${suffix}`, assetId: `asset-${suffix}`, status: "FOUNDER_APPROVED", checksumSha256: `asset-hash-${suffix}`, ...owned } as any);
      state.remedyRepositoryRecords.push({ id: `remedy-${suffix}`, name: `${configuration.label} ${index}`, attributePurpose: `${configuration.label} approved purpose ${index}`,
        remedialType: configuration.pageType, elements: ["Earth"], directions: ["SW"], preferredAssetId: `asset-${suffix}`, preferredAssetVersionId: `asset-version-${suffix}`, status: "APPROVED", ...owned } as any);
    }
  }
  for (const [candidateId, checksum] of [["candidate-a", "candidate-hash-a"], ["candidate-b", "candidate-hash-b"]]) state.revisedLayoutCandidates.push({ id: candidateId, projectId: "project-1", caseId: "case-1", floorId: "floor-1", postSiteFindingsId: "findings-1", label: candidateId, evidenceRef: `private/${candidateId}.pdf`, checksumSha256: checksum, version: 1, status: "AVAILABLE", createdAt: "2026-01-01T00:00:00.000Z", ...owned } as any);
  setAppState(state);
  assert.equal(ensureStageBReservation({ caseId: "case-1", floorId: "floor-1", actor })?.status, "READY_FOR_CONFIGURATION");
  const opened = initialiseStageB({ caseId: "case-1", floorId: "floor-1", reportId: report.id, expectedRecordVersion: 1, idempotencyKey: "open-1", actor });
  return { actor, report, verdicts, opened };
}

function resolveAll(input: ReturnType<typeof fixture>) {
  const resolutions = {} as Record<StageBRemedyType, ReturnType<typeof resolveEligibleRemedies>>;
  for (const configuration of STAGE_B_REMEDY_PAGES) {
    resolutions[configuration.pageType] = resolveEligibleRemedies({ remediationId: input.opened.remediation.id, verdictId: input.verdicts[configuration.pageType].id,
      remedialType: configuration.pageType, expectedRecordVersion: input.opened.remediation.recordVersion, idempotencyKey: `resolve-${configuration.pageType}`, actor: input.actor });
  }
  return resolutions;
}

function place(input: ReturnType<typeof fixture>, pageType: StageBRemedyType, resolutionId: string, baseLayoutVersionId: string, key: string, placementId?: string, reconcileInvalidationId?: string) {
  const page = input.opened.pages.find((item) => item.pageType === pageType)!;
  return upsertRemedyPlacement({ remediationId: input.opened.remediation.id, pageId: page.id, ...(placementId ? { placementId } : {}), eligibilityResolutionId: resolutionId,
    baseLayoutVersionId, placementType: "REMEDY", anchorX: .2, anchorY: .3, calloutX: .55, calloutY: .25, calloutWidth: .25, calloutHeight: .15,
    showCircle: true, showFrame: true, showHighlight: false, completePlacement: true, ...(reconcileInvalidationId ? { reconcileInvalidationId } : {}),
    expectedRecordVersion: input.opened.remediation.recordVersion, idempotencyKey: key, actor: input.actor });
}

function completeSequence() {
  const setup = fixture(); const replay = initialiseStageB({ caseId: "case-1", floorId: "floor-1", reportId: setup.report.id, expectedRecordVersion: 1, idempotencyKey: "open-1", actor: setup.actor });
  assert.deepEqual(replay.pages.map((page) => [page.id, page.pageType, page.ordinal]), setup.opened.pages.map((page) => [page.id, page.pageType, page.ordinal]));
  assert.deepEqual(setup.opened.pages.map((page) => [page.pageType, page.ordinal]), STAGE_B_REMEDY_PAGES.map((page) => [page.pageType, page.ordinal]));
  const resolutions = resolveAll(setup); const selected = selectFinalRevisedLayout({ remediationId: setup.opened.remediation.id, candidateId: "candidate-a",
    expectedRecordVersion: setup.opened.remediation.recordVersion, idempotencyKey: "select-a", actor: setup.actor });
  const equaliser = place(setup, "EQUALISER", resolutions.EQUALISER.eligible[0].id, selected.baseLayout.id, "place-equaliser");
  const disha = place(setup, "DISHA_BALANCER", resolutions.DISHA_BALANCER.eligible[0].id, selected.baseLayout.id, "place-disha");
  assert.deepEqual([disha.masterNumber, equaliser.masterNumber], [1, 2]);
  const dishaPage = setup.opened.pages.find((page) => page.pageType === "DISHA_BALANCER")!;
  const deleted = deleteRemedyPlacement({ remediationId: setup.opened.remediation.id, pageId: dishaPage.id, placementId: disha.id, idempotencyKey: "delete-disha",
    expectedRecordVersion: setup.opened.remediation.recordVersion, actor: setup.actor });
  assert.equal(deleted.placements[0].id, equaliser.id); assert.equal(equaliser.masterNumber, 1);
  const deleteReplay = deleteRemedyPlacement({ remediationId: setup.opened.remediation.id, pageId: dishaPage.id, placementId: disha.id, idempotencyKey: "delete-disha",
    expectedRecordVersion: 0, actor: setup.actor });
  assert.deepEqual(deleteReplay, deleted);
  const replacementDisha = place(setup, "DISHA_BALANCER", resolutions.DISHA_BALANCER.eligible[0].id, selected.baseLayout.id, "place-disha-replacement");
  assert.deepEqual([replacementDisha.masterNumber, equaliser.masterNumber], [1, 2]);
  assert.throws(() => place(setup, "DISHA_ACTIVATION", resolutions.DISHA_BALANCER.eligible[0].id, selected.baseLayout.id, "cross-page"), /does not belong to this remedy page/);
  const firstFinal = finaliseStageBPage({ remediationId: setup.opened.remediation.id, pageId: dishaPage.id, expectedRecordVersion: setup.opened.remediation.recordVersion, idempotencyKey: "finalise-DISHA_BALANCER", actor: setup.actor });
  assert.equal(firstFinal.baseLayout?.state, "LOCKED"); assert.equal(firstFinal.sequenceFinalised, false); assert.equal(firstFinal.manifest, undefined);
  assert.throws(() => selectFinalRevisedLayout({ remediationId: setup.opened.remediation.id, candidateId: "candidate-b", expectedRecordVersion: setup.opened.remediation.recordVersion, idempotencyKey: "select-after-lock", actor: setup.actor }), /cannot change after the first remedy page/);
  const tattav = place(setup, "TATTAV_BALANCER", resolutions.TATTAV_BALANCER.eligible[0].id, selected.baseLayout.id, "place-tattav-after-lock");
  assert.deepEqual([replacementDisha.masterNumber, tattav.masterNumber, equaliser.masterNumber], [1, 2, 3]);
  let finalResult: ReturnType<typeof finaliseStageBPage> = firstFinal;
  for (const configuration of STAGE_B_REMEDY_PAGES.slice(1)) {
    const page = setup.opened.pages.find((item) => item.pageType === configuration.pageType)!;
    finalResult = finaliseStageBPage({ remediationId: setup.opened.remediation.id, pageId: page.id, expectedRecordVersion: setup.opened.remediation.recordVersion,
      idempotencyKey: `finalise-${configuration.pageType}`, actor: setup.actor });
  }
  assert.equal(finalResult.sequenceFinalised, true); assert.equal(finalResult.integrityRun?.status, "PASS"); assert.ok(finalResult.manifest);
  const lastPage = setup.opened.pages.find((item) => item.pageType === "EQUALISER")!;
  const replayFinal = finaliseStageBPage({ remediationId: setup.opened.remediation.id, pageId: lastPage.id, expectedRecordVersion: 0, idempotencyKey: "finalise-EQUALISER", actor: setup.actor });
  assert.deepEqual(replayFinal.manifest, finalResult.manifest);
  return { ...setup, resolutions, selected, placements: { disha: replacementDisha, tattav, equaliser }, finalResult, manifest: finalResult.manifest! };
}

test("five Stage B remedy pages resolve independently with dynamic 0...N eligibility", () => {
  const setup = fixture(); const resolutions = resolveAll(setup);
  for (const configuration of STAGE_B_REMEDY_PAGES) {
    assert.equal(resolutions[configuration.pageType].eligible.length, 2);
    assert.ok(resolutions[configuration.pageType].eligible.every((item) => item.remedialType === configuration.pageType));
    const other = STAGE_B_REMEDY_PAGES.find((item) => item.pageType !== configuration.pageType)!;
    const empty = resolveEligibleRemedies({ remediationId: setup.opened.remediation.id, verdictId: setup.verdicts[other.pageType].id, remedialType: configuration.pageType,
      expectedRecordVersion: setup.opened.remediation.recordVersion, idempotencyKey: `empty-${configuration.pageType}`, actor: setup.actor });
    assert.equal(empty.eligible.length, 0);
  }
  assert.equal(adaptStageBSourceFraming("Tattva Balancer"), "TATTAV_BALANCER");
  assert.equal(adaptStageBSourceFraming("Tattva Activation"), "TATTAV_ACTIVATION");
});

test("governed eligibility refresh supersedes stale authority without selection or placement", () => {
  const setup = fixture(); const state = getAppState();
  const second = state.remedyRepositoryRecords.find((item) => item.id === "remedy-DISHA_BALANCER-2")!;
  second.directions = ["NE"];
  const initial = resolveEligibleRemedies({ remediationId: setup.opened.remediation.id, verdictId: setup.verdicts.DISHA_BALANCER.id, remedialType: "DISHA_BALANCER",
    expectedRecordVersion: setup.opened.remediation.recordVersion, idempotencyKey: "refresh-initial", actor: setup.actor });
  assert.deepEqual(initial.eligible.map((item) => item.remedyId), ["remedy-DISHA_BALANCER-1"]);
  second.directions = ["SW"];
  const refreshed = resolveEligibleRemedies({ remediationId: setup.opened.remediation.id, verdictId: setup.verdicts.DISHA_BALANCER.id, remedialType: "DISHA_BALANCER", refresh: true,
    expectedRecordVersion: setup.opened.remediation.recordVersion, idempotencyKey: "refresh-updated", actor: setup.actor });
  assert.deepEqual(new Set(refreshed.eligible.map((item) => item.remedyId)), new Set(["remedy-DISHA_BALANCER-1", "remedy-DISHA_BALANCER-2"]));
  assert.equal(state.remedyEligibilityResolutions.filter((item) => item.status === "ELIGIBLE").length, 2);
  assert.equal(state.remedyEligibilityResolutions.filter((item) => item.status === "INVALIDATED").length, 1);
  const replay = resolveEligibleRemedies({ remediationId: setup.opened.remediation.id, verdictId: setup.verdicts.DISHA_BALANCER.id, remedialType: "DISHA_BALANCER", refresh: true,
    expectedRecordVersion: setup.opened.remediation.recordVersion, idempotencyKey: "refresh-unchanged", actor: setup.actor });
  assert.deepEqual(new Set(replay.eligible.map((item) => item.id)), new Set(refreshed.eligible.map((item) => item.id)));
  assert.equal(state.remedyEligibilityResolutions.length, 3);
  assert.equal(state.physicalPlacements.length, 0);
});

test("case-used remedies are exact-page scoped, preserve permanent semantics, and snapshot through finalisation", () => {
  const setup = fixture(); const state = getAppState(); const page = setup.opened.pages.find((item) => item.pageType === "DISHA_BALANCER")!;
  const owned = { organisationId: "org-1", createdByActorUserId: setup.actor.id, updatedByActorUserId: setup.actor.id, recordVersion: 1 };
  state.mediaAssetVersions.push({ id: "asset-version-case-used", assetId: "asset-case-used", status: "ACTIVE", checksumSha256: "case-used-asset-hash", ...owned } as any);
  const exact = { id: "case-used-remedy-1", caseId: "case-1", floorId: "floor-1", remediationId: setup.opened.remediation.id, pageId: page.id,
    remedialType: "DISHA_BALANCER" as const, name: "Case-only brass helix", attributePurpose: "Case-specific Disha balance",
    preferredAssetId: "asset-case-used", preferredAssetVersionId: "asset-version-case-used", sourceMediaChecksumSha256: "case-used-asset-hash",
    source: "ONE_TIME_USE_THIS_CASE" as const, status: "ACTIVE" as const, createdAt: "2026-01-02T00:00:00.000Z", idempotencyKey: "case-used-create-1", requestHash: "case-used-request-1", ...owned };
  state.caseUsedRemedyRecords.push(exact,
    { ...exact, id: "case-used-wrong-org", organisationId: "org-2" },
    { ...exact, id: "case-used-wrong-case", caseId: "case-other" },
    { ...exact, id: "case-used-wrong-floor", floorId: "floor-other" },
    { ...exact, id: "case-used-wrong-remediation", remediationId: "remediation-other" },
    { ...exact, id: "case-used-wrong-page", pageId: setup.opened.pages.find((item) => item.pageType === "DISHA_ACTIVATION")!.id });
  state.remedyRepositoryRecords.push({ id: "remedy-merged-draft", name: exact.name, attributePurpose: exact.attributePurpose, remedialType: exact.remedialType,
    elements: ["Earth"], directions: ["SW"], preferredAssetId: exact.preferredAssetId, preferredAssetVersionId: exact.preferredAssetVersionId, status: "DRAFT", ...owned } as any);

  const scope = { organisationId: "org-1", caseId: "case-1", floorId: "floor-1", remediationId: setup.opened.remediation.id, pageId: page.id, remedialType: "DISHA_BALANCER" as const };
  assert.equal(resolveRemedySource(state, exact.id, scope)?.sourceKind, "CASE_USED");
  assert.equal(resolveRemedySource(state, exact.id, { ...scope, floorId: "floor-other" }), undefined);
  assert.equal(resolveRemedySource(state, exact.id, { ...scope, pageId: "page-other" }), undefined);
  assert.equal(resolveRemedySource(state, "remedy-DISHA_BALANCER-1", scope)?.sourceKind, "PERMANENT");

  const resolved = resolveEligibleRemedies({ remediationId: setup.opened.remediation.id, verdictId: setup.verdicts.DISHA_BALANCER.id, remedialType: "DISHA_BALANCER",
    expectedRecordVersion: setup.opened.remediation.recordVersion, idempotencyKey: "resolve-with-case-used", actor: setup.actor });
  assert.deepEqual(resolved.eligible.map((item) => item.remedyId), ["remedy-DISHA_BALANCER-1", "remedy-DISHA_BALANCER-2", exact.id]);
  assert.ok(!resolved.eligible.some((item) => item.remedyId === "remedy-merged-draft" || item.remedyId.startsWith("case-used-wrong-")));
  const caseResolution = resolved.eligible.find((item) => item.remedyId === exact.id)!;
  assert.deepEqual(Object.keys(caseResolution).sort(), ["caseId", "createdByActorUserId", "eligibilityRuleIds", "explanationCodes", "floorId", "id", "idempotencyKey", "methodologyContentHash", "methodologyVersionId", "organisationId", "recordVersion", "remedialType", "remediationId", "remedyAssetVersionId", "remedyId", "remedyRecordVersion", "requestHash", "resolutionHash", "resolvedAt", "resolverVersion", "status", "updatedByActorUserId", "verdictContentHash", "verdictId"].sort());

  const selected = selectFinalRevisedLayout({ remediationId: setup.opened.remediation.id, candidateId: "candidate-a", expectedRecordVersion: setup.opened.remediation.recordVersion, idempotencyKey: "select-case-used", actor: setup.actor });
  const placement = place(setup, "DISHA_BALANCER", caseResolution.id, selected.baseLayout.id, "place-case-used");
  assert.equal(placement.remedyId, exact.id); assert.equal(placement.nameSnapshot, exact.name); assert.equal(placement.attributePurposeSnapshot, exact.attributePurpose);
  let final: ReturnType<typeof finaliseStageBPage> | undefined;
  for (const remedyPage of setup.opened.pages) final = finaliseStageBPage({ remediationId: setup.opened.remediation.id, pageId: remedyPage.id,
    expectedRecordVersion: setup.opened.remediation.recordVersion, idempotencyKey: `finalise-case-used-${remedyPage.pageType}`, actor: setup.actor });
  assert.equal(final?.integrityRun?.status, "PASS"); assert.equal(final?.manifest?.schemaVersion, "stage-b-render-manifest/v1");
  assert.equal(final?.manifest?.pages[0].placements[0].remedyId, exact.id); assert.equal(final?.manifest?.pages[0].placements[0].nameSnapshot, exact.name);
});

test("page-scoped placement, delete resequencing, first-page lock and five-page immutable v5 manifest", () => {
  const completed = completeSequence(); const state = getAppState();
  assert.deepEqual(completed.manifest.pages.map((page) => [page.pageType, page.ordinal]), STAGE_B_REMEDY_PAGES.map((page) => [page.pageType, page.ordinal]));
  assert.deepEqual(completed.manifest.pages.map((page) => page.placements.length), [1, 0, 1, 0, 1]);
  assert.deepEqual(completed.manifest.pages.flatMap((page) => page.placements).map((item) => item.masterNumber), [1, 2, 3]);
  assert.deepEqual(completed.manifest.pages.map((page) => page.provenance.length), [1, 0, 1, 0, 1]);
  assert.equal(state.placementImplementationRows.length, 3); assert.equal(state.masterAppendixRows.length, 3);
  assert.ok(state.placementImplementationRows.every((row) => !("implemented" in row) && !("implementationDate" in row) && !("alternativeNeeded" in row)));
  assert.deepEqual(buildStageBRenderManifest(state, completed.opened.remediation.id), completed.manifest);
  assert.deepEqual(buildStageBRenderManifest(state, completed.opened.remediation.id), buildStageBRenderManifest(state, completed.opened.remediation.id));
  assert.equal(completed.manifest.pages[0].implementationRows[0].implemented, null);
  completed.report.artifact = { ...completed.report.artifact, templateVersion: V5_REPORT_TEMPLATE_VERSION, stageBRenderManifest: completed.manifest };
  assert.equal((canonicalReportPayload(state, completed.report) as any).stageBRenderManifest.integrityStatus, "PASS");
  const html = renderPrintableReport(state, completed.report);
  for (const configuration of STAGE_B_REMEDY_PAGES) assert.match(html, new RegExp(`data-stage-b-page="${configuration.pageType}"`));
  assert.ok(STAGE_B_REMEDY_PAGES.map((configuration) => html.indexOf(`data-stage-b-page="${configuration.pageType}"`)).every((position, index, positions) => index === 0 || position > positions[index - 1]));
  assert.match(html, /Item\/Remedy Name/); assert.match(html, /Alternative Needed/); assert.match(html, /integrity PASS/);
  const legacyManifest: any = structuredClone(completed.manifest); legacyManifest.pages = [legacyManifest.pages[0]]; delete legacyManifest.pages[0].pageType; delete legacyManifest.pages[0].provenance;
  completed.report.artifact = { ...completed.report.artifact, stageBRenderManifest: legacyManifest };
  assert.match(renderPrintableReport(state, completed.report), /data-stage-b-page="DISHA_BALANCER"/);
});

test("existing Disha base-change invalidation preserves coordinates and uses regeneration reconciliation", () => {
  const setup = fixture(); const resolutions = resolveAll(setup);
  const first = selectFinalRevisedLayout({ remediationId: setup.opened.remediation.id, candidateId: "candidate-a", expectedRecordVersion: setup.opened.remediation.recordVersion, idempotencyKey: "select-a", actor: setup.actor });
  const draft = upsertRemedyPlacement({ remediationId: setup.opened.remediation.id, pageId: setup.opened.page.id, eligibilityResolutionId: resolutions.DISHA_BALANCER.eligible[0].id,
    baseLayoutVersionId: first.baseLayout.id, anchorX: .25, anchorY: .35, calloutX: .55, calloutY: .25, calloutWidth: .25, calloutHeight: .15,
    showCircle: true, showFrame: true, showHighlight: false, completePlacement: false, expectedRecordVersion: setup.opened.remediation.recordVersion, idempotencyKey: "place-draft", actor: setup.actor });
  const second = selectFinalRevisedLayout({ remediationId: setup.opened.remediation.id, candidateId: "candidate-b", expectedRecordVersion: setup.opened.remediation.recordVersion, idempotencyKey: "select-b", actor: setup.actor });
  assert.equal(draft.dependencyReviewState, "NEEDS_REVIEW"); const invalidation = getAppState().dependencyInvalidations.find((item) => item.targetId === draft.id)!;
  const reconciled = upsertRemedyPlacement({ remediationId: setup.opened.remediation.id, pageId: setup.opened.page.id, placementId: draft.id, eligibilityResolutionId: resolutions.DISHA_BALANCER.eligible[0].id,
    baseLayoutVersionId: second.baseLayout.id, anchorX: .25, anchorY: .35, calloutX: .55, calloutY: .25, calloutWidth: .25, calloutHeight: .15,
    showCircle: true, showFrame: true, showHighlight: false, completePlacement: true, reconcileInvalidationId: invalidation.id,
    expectedRecordVersion: setup.opened.remediation.recordVersion, idempotencyKey: "place-reconcile", actor: setup.actor });
  assert.deepEqual([reconciled.anchorX, reconciled.anchorY, reconciled.calloutX, reconciled.calloutY], [.25, .35, .55, .25]);
  assert.equal(invalidation.status, "READY_FOR_REVIEW"); assert.equal(getAppState().regenerationResolutions.filter((item) => item.invalidationId === invalidation.id).length, 3);
});

test("all-page integrity rejects numbering, page/type, floor, base and projection leakage", () => {
  const completed = completeSequence(); const baseline = structuredClone(getAppState());
  function issueCodes(mutate: (state: ReturnType<typeof getAppState>) => void) {
    setAppState(structuredClone(baseline)); const state = getAppState(); mutate(state);
    return validateStageBIntegrity({ remediationId: completed.opened.remediation.id, expectedRecordVersion: state.stageBRemediations.find((item) => item.id === completed.opened.remediation.id)!.recordVersion, actor: completed.actor }).issues.map((item) => item.code);
  }
  assert.ok(issueCodes((state) => { state.physicalPlacements.find((item) => item.state !== "DELETED" && item.masterNumber === 1)!.masterNumber = 2; }).includes("MASTER_SEQUENCE_DUPLICATE"));
  assert.ok(issueCodes((state) => { state.physicalPlacements.filter((item) => item.state !== "DELETED").at(-1)!.masterNumber = 9; }).includes("MASTER_SEQUENCE_GAP"));
  assert.ok(issueCodes((state) => { const placement = state.physicalPlacements.find((item) => item.state !== "DELETED")!; placement.pageId = state.reportPlacementPages.find((item) => item.pageType === "EQUALISER")!.id; }).includes("REMEDY_TYPE_LEAKAGE"));
  assert.ok(issueCodes((state) => { state.physicalPlacements.find((item) => item.state !== "DELETED")!.floorId = "floor-other"; }).includes("PLACEMENT_SCOPE_MISMATCH"));
  assert.ok(issueCodes((state) => { state.physicalPlacements.find((item) => item.state !== "DELETED")!.baseLayoutVersionId = "base-other"; }).includes("BASE_LAYOUT_VERSION_MISMATCH"));
  assert.ok(issueCodes((state) => { state.physicalPlacements.find((item) => item.state !== "DELETED")!.imageAssetSnapshotId = "tampered"; }).includes("REMEDY_ASSET_SNAPSHOT_MISMATCH"));
  assert.ok(issueCodes((state) => { state.placementImplementationRows.pop(); }).includes("IMPLEMENTATION_ROW_MISMATCH"));
  assert.ok(issueCodes((state) => { state.masterAppendixRows.pop(); }).includes("APPENDIX_ROW_MISMATCH"));
  assert.ok(issueCodes((state) => { state.reportPlacementPages.find((item) => item.pageType === "TATTAV_BALANCER")!.ordinal = 99; }).includes("REMEDY_PAGE_ORDER_INVALID"));
  setAppState(baseline);
});

test("the flat action envelope allowlists exactly one Stage B placement delete mutation", () => {
  const route = readFileSync(new URL("../app/api/actions/route.ts", import.meta.url), "utf8");
  const finalPdf = readFileSync(new URL("../lib/final-pdf.server.ts", import.meta.url), "utf8");
  assert.match(route, /case "stage-b-remedy-placement-delete"/);
  assert.match(route, /"stage-b-remedy-placement-delete": \["action", "actorRole", "remediationId", "pageId", "placementId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"\]/);
  assert.equal((route.match(/case "stage-b-remedy-placement-delete"/g) ?? []).length, 1);
  assert.match(finalPdf, /templateVersion === "uchit-verdict\/v5"/); assert.match(finalPdf, /stageBRenderManifest\?\.integrityStatus !== "PASS"/);
});
