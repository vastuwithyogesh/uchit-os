import assert from "node:assert/strict";
import test from "node:test";
import { createNativeV1BaseFixture } from "./helpers/native-v1-evaluation-fixture.ts";
import { ENERGY_BAR_DIRECTIONS, createEnergyBarStateSetDraft } from "../lib/energy-bar-state-v1.ts";
import { createEnergyBarEvidenceDraft, finalizeEnergyBarEvidence } from "../lib/energy-bar-evidence-v1.ts";
import { createPostSiteObservationDraft, finalizePostSiteObservation, POST_SITE_METHODOLOGY_CONTENT_IDENTIFIER, POST_SITE_METHODOLOGY_VERSION } from "../lib/post-site-observations-v1.ts";
import { createSiteEvaluationEvidenceDraft, finalizeSiteEvaluationEvidence } from "../lib/site-evaluation-evidence-v1.ts";
import { ELEMENTAL_REPORT_SECTION_ORDER } from "../lib/elemental-report-v1.ts";
import { createCombinedEvaluationReportDraft } from "../lib/combined-evaluation-report-v1.ts";

test("reusable fixture builds the finalized Directional V1 chain through Stage-A", () => {
  const fixture = createNativeV1BaseFixture();
  assert.equal(fixture.directionalInput.status, "FINALIZED");
  assert.equal(fixture.directionalInput.architectureVersion, "V1");
  assert.equal(fixture.directionalEvaluation.status, "COMPLETE");
  assert.equal(fixture.directionalEvaluation.sourceDirectionalInputId, fixture.directionalInput.id);
  assert.equal(fixture.directionalEvaluation.sourceD8SnapshotId, fixture.d8.id);
  assert.equal(fixture.directionalEvaluation.sourceD16MappingId, fixture.d16.id);
  assert.equal(fixture.directionalReportCard.status, "FINALIZED");
  assert.equal(fixture.directionalReportCard.cardStatus, "READY");
  assert.equal(fixture.directionalReportCard.sourceDirectionalEvaluationSnapshotId, fixture.directionalEvaluation.id);
  assert.equal(fixture.directionalStageAPresentation.status, "PRESENTED");
  assert.equal(fixture.directionalStageAPresentation.reportCardSnapshotId, fixture.directionalReportCard.id);
  assert.equal(fixture.directionalStageAPresentation.reportCardContentHash, fixture.directionalReportCard.contentHash);
  assert.equal(fixture.d32, undefined);
  assert.equal(fixture.state.utilityVerdicts.length, 0);
  assert.equal(fixture.state.reportVersions.length, 0);
});

test("reusable fixture preserves directional statement provenance and scope", () => {
  const fixture = createNativeV1BaseFixture();
  assert.ok(Object.keys(fixture.statements).length > 0);
  assert.ok(fixture.directionalReportCard.statementSelections.length > 0);
  for (const selection of fixture.directionalReportCard.statementSelections as any[]) {
    assert.equal(selection.methodologyVersionId, fixture.directionalReportCard.methodologyVersionId);
    assert.equal(selection.methodologyContentHash, fixture.directionalReportCard.methodologyContentHash);
    assert.ok(selection.sourceSheet);
    assert.ok(selection.sourceRowOrRuleId);
    assert.ok(selection.contentHash);
  }
  const payload = fixture.directionalReportCard.payload as any;
  assert.equal(payload.lineage.caseId, fixture.caseRecord.id);
  assert.equal(payload.lineage.projectId, fixture.project.id);
  assert.equal(payload.lineage.floorId, fixture.floor.id);
});

test("reusable fixture remains safe for wrong-floor and missing-D32 checks", () => {
  const fixture = createNativeV1BaseFixture();
  assert.equal(fixture.state.directionalEvaluationSnapshots.filter((item) => item.floorId === fixture.floor.id).length, 1);
  assert.equal(fixture.state.directionalReportCardSnapshots.filter((item) => item.floorId === fixture.floor.id).length, 1);
  assert.equal(fixture.state.directionalStageAPresentations.filter((item) => item.floorId === fixture.floor.id).length, 1);
  assert.equal(fixture.state.entranceZoneVersions.length, 0);
  assert.equal(fixture.d32, undefined);
});

test("reusable fixture certifies Site, Post-Site, Energy, and finalized Elemental authority", () => {
  const fixture = createNativeV1BaseFixture();
  assert.equal(fixture.siteEvidence.status, "FINALIZED");
  assert.equal(fixture.postSiteObservation.status, "FINALIZED");
  assert.equal(fixture.energyEvidence.status, "FINALIZED");
  assert.equal(fixture.energyStateSet.status, "FINALIZED");
  assert.equal(fixture.energyStateSet.directions.length, 16);
  assert.ok(fixture.energyStateSet.directions.every((item) => ["ABOVE_RED", "WITHIN_BAND", "BELOW_BLUE"].includes(item.state)));
  assert.equal(fixture.elementalEvaluation.status, "COMPLETE");
  assert.deepEqual(fixture.elementalEvaluation.elements.map((item) => item.element), ["WATER", "AIR", "FIRE", "EARTH", "SPACE"]);
  assert.ok(fixture.elementalEvaluation.elements.every((item) => item.verdict === "BALANCE" && item.remedyType === "EQUALISER"));
  assert.ok(fixture.elementalEvaluation.elements.every((item) => item.statement.statementId && item.statement.methodologyVersionId === fixture.elementalEvaluation.methodologyVersionId && item.statement.methodologyContentHash === fixture.elementalEvaluation.methodologyContentHash));
  assert.equal(fixture.elementalReport.status, "FINALIZED");
  const elementalReportPayload = fixture.elementalReport.report as any;
  assert.equal(elementalReportPayload.status, "READY");
  assert.deepEqual(elementalReportPayload.sections.map((section: any) => section.key), ELEMENTAL_REPORT_SECTION_ORDER);
  assert.equal(fixture.elementalReport.elementalEvaluationSnapshotId, fixture.elementalEvaluation.id);
  assert.equal(fixture.elementalReport.elementalEvaluationOutputHash, fixture.elementalEvaluation.outputHash);
  assert.equal(elementalReportPayload.siteEvaluationEvidence.evidenceVersionId, fixture.siteEvidence.id);
  assert.equal(elementalReportPayload.energyBarEvidence.evidenceVersionId, fixture.energyEvidence.id);
  assert.equal(fixture.state.evaluationRemedyHandoffs.length, 1);
  assert.equal(fixture.state.combinedEvaluationReportSnapshots.length, 1);
});

test("Energy State Set and Site/Energy source selection remain floor-isolated", () => {
  const fixture = createNativeV1BaseFixture();
  const otherFloor = { ...fixture.floor, id: "floor-native-v1-other", floorLabel: "Other Floor" };
  fixture.state.floorWorkspaces.push(otherFloor as any);
  const otherSite = createSiteEvaluationEvidenceDraft({ state: fixture.state, organisationId: fixture.organisationId, caseId: fixture.caseRecord.id, projectId: fixture.project.id, floorId: otherFloor.id, mode: "LIVE_VIDEO", evidenceRef: "r2://native-v1/other-floor-site", artifactHash: "sha256:native-v1-other-floor-site", actor: fixture.owner, idempotencyKey: "native-v1-other-floor-site" });
  finalizeSiteEvaluationEvidence({ state: fixture.state, recordId: otherSite.id, actor: fixture.owner, expectedRecordVersion: otherSite.recordVersion, idempotencyKey: "native-v1-other-floor-site-final" });
  const otherPostSite = createPostSiteObservationDraft({ state: fixture.state, organisationId: fixture.organisationId, caseId: fixture.caseRecord.id, projectId: fixture.project.id, floorId: otherFloor.id, naturalLight: "BALANCED", ventilation: "BALANCED", methodologyVersionId: POST_SITE_METHODOLOGY_VERSION, methodologyContentHash: POST_SITE_METHODOLOGY_CONTENT_IDENTIFIER, actor: fixture.owner, idempotencyKey: "native-v1-other-floor-post-site" });
  finalizePostSiteObservation({ state: fixture.state, recordId: otherPostSite.id, actor: fixture.owner, expectedRecordVersion: otherPostSite.recordVersion, idempotencyKey: "native-v1-other-floor-post-site-final" });
  const otherEvidence = createEnergyBarEvidenceDraft({ state: fixture.state, organisationId: fixture.organisationId, caseId: fixture.caseRecord.id, projectId: fixture.project.id, floorId: otherFloor.id, evidenceRef: "r2://native-v1/other-floor-energy", artifactHash: "sha256:native-v1-other-floor-energy", actor: fixture.owner, idempotencyKey: "native-v1-other-floor-energy", expectedRecordVersion: otherPostSite.recordVersion });
  finalizeEnergyBarEvidence({ state: fixture.state, recordId: otherEvidence.id, actor: fixture.owner, expectedRecordVersion: otherEvidence.recordVersion, idempotencyKey: "native-v1-other-floor-energy-final" });
  assert.throws(() => createEnergyBarStateSetDraft({ state: fixture.state, organisationId: fixture.organisationId, caseId: fixture.caseRecord.id, projectId: fixture.project.id, floorId: fixture.floor.id, evidenceVersionId: otherEvidence.id, directions: ENERGY_BAR_DIRECTIONS.map((direction) => ({ direction, state: "WITHIN_BAND" as const })), methodologyVersionId: fixture.energyStateSet.methodologyVersionId, methodologyContentHash: fixture.energyStateSet.methodologyContentHash, actor: fixture.owner, idempotencyKey: "native-v1-cross-floor-state" }), /same-floor Energy Bar evidence/);
});

test("reusable fixture certifies READY handoff and finalized Combined Report source pins", () => {
  const fixture = createNativeV1BaseFixture();
  const handoffPayload = fixture.remedyTypeHandoff.handoff as any;
  assert.equal(fixture.remedyTypeHandoff.status, "READY");
  assert.equal(fixture.remedyTypeHandoff.architectureVersion, "V1");
  assert.equal(fixture.remedyTypeHandoff.elementalEvaluationSnapshotId, fixture.elementalEvaluation.id);
  assert.equal(fixture.remedyTypeHandoff.elementalEvaluationOutputHash, fixture.elementalEvaluation.outputHash);
  assert.equal(handoffPayload.decisions.length, 5);
  assert.deepEqual(handoffPayload.decisions.map((item: any) => item.element), ["WATER", "AIR", "FIRE", "EARTH", "SPACE"]);
  assert.equal(fixture.combinedReport.status, "FINALIZED");
  assert.equal(fixture.combinedReport.architectureVersion, "V1");
  assert.equal(fixture.combinedReport.caseId, fixture.caseRecord.id);
  assert.equal(fixture.combinedReport.projectId, fixture.project.id);
  assert.equal(fixture.combinedReport.floorId, fixture.floor.id);
  assert.equal(fixture.combinedReport.directionalReportCardSnapshotId, fixture.directionalReportCard.id);
  assert.equal(fixture.combinedReport.directionalStageAPresentationId, fixture.directionalStageAPresentation.id);
  assert.equal(fixture.combinedReport.siteEvidenceVersionId, fixture.siteEvidence.id);
  assert.equal(fixture.combinedReport.energyBarEvidenceVersionId, fixture.energyEvidence.id);
  assert.equal(fixture.combinedReport.elementalReportSnapshotId, fixture.elementalReport.id);
  assert.equal(fixture.combinedReport.remedyHandoffId, fixture.remedyTypeHandoff.id);
  assert.equal(fixture.state.stageBInputsV1.length, 1);
});

test("Combined Report requires the exact READY handoff and rejects a wrong-floor authority", () => {
  const fixture = createNativeV1BaseFixture();
  const handoff = fixture.state.evaluationRemedyHandoffs.pop()!;
  assert.throws(() => createCombinedEvaluationReportDraft({ state: fixture.state, organisationId: fixture.organisationId, caseId: fixture.caseRecord.id, projectId: fixture.project.id, floorId: fixture.floor.id, actor: fixture.owner, idempotencyKey: "native-v1-combined-without-handoff" }), /READY V1 Remedy-Type Handoff/);
  fixture.state.evaluationRemedyHandoffs.unshift(handoff);
  const otherFloor = { ...fixture.floor, id: "floor-native-v1-combined-other", floorLabel: "Other Floor" };
  fixture.state.floorWorkspaces.push(otherFloor as any);
  assert.throws(() => createCombinedEvaluationReportDraft({ state: fixture.state, organisationId: fixture.organisationId, caseId: fixture.caseRecord.id, projectId: fixture.project.id, floorId: otherFloor.id, actor: fixture.owner, idempotencyKey: "native-v1-combined-wrong-floor" }), /finalized READY Directional Report Card|Finalized Site Evaluation evidence|READY V1 Remedy-Type Handoff/);
});

test("original tampered Handoff source identity is rejected by Combined Report admission", () => {
  const fixture = createNativeV1BaseFixture();
  fixture.state.combinedEvaluationReportSnapshots.length = 0;
  fixture.remedyTypeHandoff.elementalEvaluationSnapshotId = "stale-elemental";
  assert.throws(() => createCombinedEvaluationReportDraft({ state: fixture.state, organisationId: fixture.organisationId, caseId: fixture.caseRecord.id, projectId: fixture.project.id, floorId: fixture.floor.id, actor: fixture.owner, idempotencyKey: "native-v1-combined-tampered-source" }), /Elemental Evaluation/);
});

test("Combined Report rejects Handoff scope and source-hash mismatches", () => {
  const wrongFloor = createNativeV1BaseFixture();
  wrongFloor.state.combinedEvaluationReportSnapshots.length = 0;
  wrongFloor.remedyTypeHandoff.floorId = "floor-native-v1-other";
  assert.throws(() => createCombinedEvaluationReportDraft({ state: wrongFloor.state, organisationId: wrongFloor.organisationId, caseId: wrongFloor.caseRecord.id, projectId: wrongFloor.project.id, floorId: wrongFloor.floor.id, actor: wrongFloor.owner, idempotencyKey: "native-v1-combined-wrong-handoff-floor" }), /READY V1 Remedy-Type Handoff/);
  const wrongHash = createNativeV1BaseFixture();
  wrongHash.state.combinedEvaluationReportSnapshots.length = 0;
  wrongHash.remedyTypeHandoff.elementalEvaluationOutputHash = "sha256:tampered";
  assert.throws(() => createCombinedEvaluationReportDraft({ state: wrongHash.state, organisationId: wrongHash.organisationId, caseId: wrongHash.caseRecord.id, projectId: wrongHash.project.id, floorId: wrongHash.floor.id, actor: wrongHash.owner, idempotencyKey: "native-v1-combined-wrong-handoff-hash" }), /source hash/);
  const wrongCase = createNativeV1BaseFixture();
  wrongCase.state.combinedEvaluationReportSnapshots.length = 0;
  wrongCase.remedyTypeHandoff.caseId = "case-native-v1-other";
  assert.throws(() => createCombinedEvaluationReportDraft({ state: wrongCase.state, organisationId: wrongCase.organisationId, caseId: wrongCase.caseRecord.id, projectId: wrongCase.project.id, floorId: wrongCase.floor.id, actor: wrongCase.owner, idempotencyKey: "native-v1-combined-wrong-handoff-case" }), /READY V1 Remedy-Type Handoff/);
});
