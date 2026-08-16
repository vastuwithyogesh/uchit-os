import type { AppUser } from "../../lib/domain.ts";
import { saveCasePropertyContext, resolveEffectivePropertyContext } from "../../lib/case-property-context.ts";
import { evaluateD8Orientation } from "../../lib/d8-orientation-v1.ts";
import { createD16UtilityMappingDraft, finalizeD16UtilityMapping, getD16UtilityMapping } from "../../lib/d16-utility-mapping.ts";
import { createDirectionalInputDraft, finalizeDirectionalInput } from "../../lib/directional-input-v1.ts";
import { finalizeDirectionalEvaluationSnapshot } from "../../lib/directional-evaluation-snapshot-v1.ts";
import { createDirectionalReportCardDraft, finalizeDirectionalReportCard, presentDirectionalStageA } from "../../lib/directional-report-card-snapshot-v1.ts";
import { DIRECTIONAL_METHODOLOGY_V1_1_CONTENT_HASH, DIRECTIONAL_METHODOLOGY_V1_1_VERSION_ID, resolveDirectionalStatements } from "../../lib/directional-statement-repo-v1.ts";
import { createSiteEvaluationEvidenceDraft, finalizeSiteEvaluationEvidence } from "../../lib/site-evaluation-evidence-v1.ts";
import { createPostSiteObservationDraft, finalizePostSiteObservation, POST_SITE_METHODOLOGY_CONTENT_IDENTIFIER, POST_SITE_METHODOLOGY_VERSION } from "../../lib/post-site-observations-v1.ts";
import { createEnergyBarEvidenceDraft, finalizeEnergyBarEvidence } from "../../lib/energy-bar-evidence-v1.ts";
import { ENERGY_BAR_DIRECTIONS, createEnergyBarStateSetDraft, finalizeEnergyBarStateSet } from "../../lib/energy-bar-state-v1.ts";
import { createCanonicalElementalEvaluationSnapshot } from "../../lib/elemental-evaluation-integration-v1.ts";
import { ELEMENTAL_METHODOLOGY_CONTENT_HASH, ELEMENTAL_METHODOLOGY_IDENTITY } from "../../lib/elemental-methodology-authority-v1.ts";
import { createElementalReportSnapshotDraft, finalizeElementalReportSnapshot } from "../../lib/elemental-report-snapshot-v1.ts";
import { createV1RemedyHandoff } from "../../lib/elemental-report-snapshot-v1.ts";
import { createCombinedEvaluationReportDraft, finalizeCombinedEvaluationReport } from "../../lib/combined-evaluation-report-v1.ts";
import { createStageBInputV1, finalizeStageBInputV1 } from "../../lib/stage-b-input-v1.ts";
import { ensureStageBReservation, STAGE_B_AUTHORITY_HASH, STAGE_B_RESOLVER_VERSION } from "../../lib/stage-b-remediation.ts";
import { createEmptyAppState } from "../../lib/store.ts";
import { resolveV1FloorWorkflowReadiness } from "../../lib/founder-v1-readiness.ts";
import { approveV1FullBalanceClearance } from "../../lib/v1-full-balance-clearance.ts";

export const nativeV1Owner: AppUser = { id: "TEST_ONLY_native_v1_owner", fullName: "Native V1 Fixture Owner", email: "native-v1@example.invalid", role: "SUPER_ADMIN", organisationId: "org-native-v1", color: "#111111", organisationCapability: "organisation_owner" };

export function createNativeV1BaseFixture(options: { stageBRemedyPattern?: boolean } = {}) {
  const state = createEmptyAppState();
  const organisationId = nativeV1Owner.organisationId!;
  const client = { id: "client-native-v1", organisationId, displayName: "TEST_ONLY Native V1 Client", email: "native-v1-client@example.invalid", phone: "+919000000001", stage: "QUALIFIED", recordVersion: 1 } as any;
  const caseRecord = { id: "case-native-v1", organisationId, clientId: client.id, projectId: "project-native-v1", proposalId: "proposal-native-v1", caseNumber: "UV-NATIVE-V1", status: "ACTIVE", reportStatus: "NOT_STARTED", evaluationArchitectureVersion: "V1", balanceApproved: true, fullPaymentApproved: true, recordVersion: 1 } as any;
  const project = { id: caseRecord.projectId, organisationId, clientId: client.id, activeCaseId: caseRecord.id, propertyName: "TEST_ONLY Native V1 Residence", status: "ACTIVE", recordVersion: 1 } as any;
  const floor = { id: "floor-native-v1", organisationId, projectId: project.id, caseId: caseRecord.id, floorLabel: "Ground Floor", status: "LOCKED", locked: true, evaluationArchitectureVersion: "V1", recordVersion: 1 } as any;
  state.clients.push(client); state.vastuCases.push(caseRecord); state.projects.push(project); state.floorWorkspaces.push(floor);
  state.prospectiveProjects.push({ id: "prospective-native-v1", organisationId, clientId: client.id, leadId: "lead-native-v1", responseVersionId: "response-native-v1", kind: "RESIDENTIAL", status: "CONVERTED", serviceType: "EXISTING_SPACE", caseId: caseRecord.id, createdAt: "2026-01-01T00:00:00.000Z", recordVersion: 1 } as any);
  state.founderProposalVersions.push({ id: caseRecord.proposalId, proposalId: "proposal-parent-native-v1", organisationId, clientId: client.id, prospectiveProjectId: "prospective-native-v1", serviceType: "EXISTING_SPACE", status: "ACCEPTED", currentStep: 6, content: { clientProject: { clientName: client.displayName, clientId: client.id, prospectiveProjectId: "prospective-native-v1", projectKind: "RESIDENTIAL", serviceType: "EXISTING_SPACE", proposalDate: "2026-01-01" }, commercial: { engagementClassification: "STANDARD_PAID", professionalFeePaise: 100, referenceFeePaise: 100, gstReferenceBasisPoints: 0, gstAppliedBasisPoints: 0, gstAmountPaise: 0, totalPayablePaise: 100, agreedAdvancePaise: 50, remainingBalancePaise: 50, advanceExceptionApproved: false, paymentMilestones: [] } }, contentHash: "sha256:native-v1-proposal", createdAt: "2026-01-01T00:00:00.000Z", createdByActorUserId: nativeV1Owner.id, recordVersion: 1, idempotencyKey: "native-v1-proposal", requestHash: "sha256:native-v1-proposal-request" } as any);
  const propertyContext = saveCasePropertyContext({ state, organisationId, clientId: client.id, caseId: caseRecord.id, projectId: project.id, propertyContext: { propertyType: "Residential", cityCountry: "TEST_ONLY Native V1 City" }, actorId: nativeV1Owner.id, idempotencyKey: "native-v1-property-1" });
  const d8Result = evaluateD8Orientation(10);
  const d8 = { id: "d8-native-v1", organisationId, caseId: caseRecord.id, projectId: project.id, status: "FINALIZED", architectureVersion: "V1", degree: 10, exactDegree: 10, result: d8Result, orientationVersionId: "d8-orientation-v1", recordVersion: 1, outputHash: "sha256:native-v1-d8" } as any;
  state.d8OrientationSnapshots.push(d8);
  const d16Draft = createD16UtilityMappingDraft({ state, organisationId, caseId: caseRecord.id, projectId: project.id, floorId: floor.id, rows: [{ id: "native-v1-utility-row-1", serialNumber: 1, utilityId: "utility-study-table", utilityName: "STUDY TABLE", floorPlanLabel: "Study", zone: "SE" }], actorUserId: nativeV1Owner.id, idempotencyKey: "native-v1-d16-draft" });
  d16Draft.methodologyVersionId = "d16-utility-master-v1"; d16Draft.methodologyContentHash = "sha256:native-v1-d16";
  const d16 = finalizeD16UtilityMapping({ state, mappingId: d16Draft.id, actorUserId: nativeV1Owner.id, idempotencyKey: "native-v1-d16-final", expectedVersion: d16Draft.recordVersion });
  const directionalInputDraft = createDirectionalInputDraft({ state, organisationId, caseId: caseRecord.id, projectId: project.id, floorId: floor.id, noConfirmedD8Modifiers: true, circulationState: "CLEAR", methodologyVersionId: DIRECTIONAL_METHODOLOGY_V1_1_VERSION_ID, methodologyContentHash: DIRECTIONAL_METHODOLOGY_V1_1_CONTENT_HASH, actor: nativeV1Owner, idempotencyKey: "native-v1-directional-input-draft" });
  const directionalInput = finalizeDirectionalInput({ state, inputId: directionalInputDraft.id, actor: nativeV1Owner, expectedVersion: directionalInputDraft.recordVersion, idempotencyKey: "native-v1-directional-input-final" });
  const directionalEvaluation = finalizeDirectionalEvaluationSnapshot({ state, organisationId, caseId: caseRecord.id, projectId: project.id, floorId: floor.id, actor: nativeV1Owner, expectedRecordVersion: caseRecord.recordVersion, idempotencyKey: "native-v1-directional-evaluation-final" });
  const statements = resolveDirectionalStatements(directionalEvaluation.result as any, { methodologyVersionId: directionalEvaluation.methodologyVersionId ?? DIRECTIONAL_METHODOLOGY_V1_1_VERSION_ID, methodologyContentHash: directionalEvaluation.methodologyContentHash ?? DIRECTIONAL_METHODOLOGY_V1_1_CONTENT_HASH });
  const directionalReportCardDraft = createDirectionalReportCardDraft({ state, organisationId, caseId: caseRecord.id, projectId: project.id, floorId: floor.id, actor: nativeV1Owner, statements, expectedRecordVersion: caseRecord.recordVersion, idempotencyKey: "native-v1-directional-report-card-draft" });
  const directionalReportCard = finalizeDirectionalReportCard({ state, snapshotId: directionalReportCardDraft.id, actor: nativeV1Owner, expectedRecordVersion: directionalReportCardDraft.recordVersion, idempotencyKey: "native-v1-directional-report-card-final" });
  const directionalStageAPresentation = presentDirectionalStageA({ state, reportCardSnapshotId: directionalReportCard.id, actor: nativeV1Owner, expectedRecordVersion: directionalReportCard.recordVersion, idempotencyKey: "native-v1-directional-stage-a-presentation" });
  const siteEvidenceDraft = createSiteEvaluationEvidenceDraft({ state, organisationId, caseId: caseRecord.id, projectId: project.id, floorId: floor.id, mode: "LIVE_VIDEO", evidenceRef: "r2://native-v1/site-evaluation", artifactHash: "sha256:native-v1-site-evaluation", actor: nativeV1Owner, idempotencyKey: "native-v1-site-evidence-draft" });
  const siteEvidence = finalizeSiteEvaluationEvidence({ state, recordId: siteEvidenceDraft.id, actor: nativeV1Owner, expectedRecordVersion: siteEvidenceDraft.recordVersion, idempotencyKey: "native-v1-site-evidence-final" });
  const postSiteObservationDraft = createPostSiteObservationDraft({ state, organisationId, caseId: caseRecord.id, projectId: project.id, floorId: floor.id, naturalLight: "BALANCED", ventilation: "BALANCED", methodologyVersionId: POST_SITE_METHODOLOGY_VERSION, methodologyContentHash: POST_SITE_METHODOLOGY_CONTENT_IDENTIFIER, actor: nativeV1Owner, idempotencyKey: "native-v1-post-site-draft" });
  const postSiteObservation = finalizePostSiteObservation({ state, recordId: postSiteObservationDraft.id, actor: nativeV1Owner, expectedRecordVersion: postSiteObservationDraft.recordVersion, idempotencyKey: "native-v1-post-site-final" });
  const energyEvidenceDraft = createEnergyBarEvidenceDraft({ state, organisationId, caseId: caseRecord.id, projectId: project.id, floorId: floor.id, evidenceRef: "r2://native-v1/energy-bar", artifactHash: "sha256:native-v1-energy-bar", actor: nativeV1Owner, idempotencyKey: "native-v1-energy-evidence-draft", expectedRecordVersion: postSiteObservation.recordVersion });
  const energyEvidence = finalizeEnergyBarEvidence({ state, recordId: energyEvidenceDraft.id, actor: nativeV1Owner, expectedRecordVersion: energyEvidenceDraft.recordVersion, idempotencyKey: "native-v1-energy-evidence-final" });
  const energyStateSetDraft = createEnergyBarStateSetDraft({ state, organisationId, caseId: caseRecord.id, projectId: project.id, floorId: floor.id, evidenceVersionId: energyEvidence.id, directions: ENERGY_BAR_DIRECTIONS.map((direction) => ({ direction, state: (options.stageBRemedyPattern ? (["N"].includes(direction) ? "ABOVE_RED" : ["ENE", "E"].includes(direction) ? "ABOVE_RED" : ["SE"].includes(direction) ? "BELOW_BLUE" : ["SSW", "WSW"].includes(direction) ? "BELOW_BLUE" : "WITHIN_BAND") : "WITHIN_BAND") as "ABOVE_RED" | "WITHIN_BAND" | "BELOW_BLUE" })), methodologyVersionId: ELEMENTAL_METHODOLOGY_IDENTITY, methodologyContentHash: ELEMENTAL_METHODOLOGY_CONTENT_HASH, actor: nativeV1Owner, idempotencyKey: "native-v1-energy-state-set-draft" });
  const energyStateSet = finalizeEnergyBarStateSet({ state, recordId: energyStateSetDraft.id, actor: nativeV1Owner, expectedRecordVersion: energyStateSetDraft.recordVersion, idempotencyKey: "native-v1-energy-state-set-final" });
  const elementalEvaluation = createCanonicalElementalEvaluationSnapshot({ state, organisationId, caseId: caseRecord.id, projectId: project.id, floorId: floor.id, actor: nativeV1Owner, idempotencyKey: "native-v1-elemental-evaluation-final" });
  const elementalReportDraft = createElementalReportSnapshotDraft({ state, organisationId, caseId: caseRecord.id, projectId: project.id, floorId: floor.id, actor: nativeV1Owner, idempotencyKey: "native-v1-elemental-report-draft", expectedRecordVersion: elementalEvaluation.recordVersion });
  const elementalReport = finalizeElementalReportSnapshot({ state, snapshotId: elementalReportDraft.id, actor: nativeV1Owner, expectedRecordVersion: elementalReportDraft.recordVersion ?? 1, idempotencyKey: "native-v1-elemental-report-final" });
  const fullBalanceClearance = approveV1FullBalanceClearance({ state, organisationId, caseId: caseRecord.id, projectId: project.id, floorId: floor.id, actor: nativeV1Owner, expectedRecordVersion: 0, idempotencyKey: "native-v1-full-balance-clearance" });
  const remedyTypeHandoff = createV1RemedyHandoff({ state, organisationId, caseId: caseRecord.id, projectId: project.id, floorId: floor.id, actor: nativeV1Owner, expectedRecordVersion: elementalEvaluation.recordVersion, idempotencyKey: "native-v1-remedy-type-handoff" });
  const combinedReportDraft = createCombinedEvaluationReportDraft({ state, organisationId, caseId: caseRecord.id, projectId: project.id, floorId: floor.id, actor: nativeV1Owner, idempotencyKey: "native-v1-combined-report-draft" });
  const combinedReport = finalizeCombinedEvaluationReport({ state, snapshotId: combinedReportDraft.id, actor: nativeV1Owner, expectedRecordVersion: combinedReportDraft.recordVersion, idempotencyKey: "native-v1-combined-report-final" });
  const stageBMethodology = { id: "methodology-native-v1-stage-b", organisationId, module: "STAGE_B_REMEDIAL", lifecycleStatus: "ACTIVE", executionAdapterVersion: STAGE_B_RESOLVER_VERSION, sourceAssetHash: STAGE_B_AUTHORITY_HASH, contentHash: "sha256:native-v1-stage-b-methodology", recordVersion: 1 } as any;
  state.methodologyVersions.push(stageBMethodology);
  stageBMethodology.sourceAssetVersion = "TEST_ONLY_STAGE_B_GOVERNED_FIXTURE";
  const stageBActionByType: Record<string, string> = { TATTAV_BALANCER: "SUPPRESS", DISHA_BALANCER: "GROUND", TATTAV_ACTIVATION: "UPLIFT", DISHA_ACTIVATION: "PROMOTE", EQUALISER: "BALANCE" };
  for (const type of ["TATTAV_BALANCER", "DISHA_BALANCER", "TATTAV_ACTIVATION", "DISHA_ACTIVATION", "EQUALISER"]) {
    state.methodologyRules.push({ id: `rule-native-${type}`, organisationId, methodologyVersionId: stageBMethodology.id, ruleKey: `TEST_ONLY_${type}`, sourceReference: "tests/r3-3d2-native-v1-stageb-execution-certification.test.ts", decisionStatus: "APPROVED", conditionJson: { action: stageBActionByType[type] }, outcomeJson: { remedialType: type }, recordVersion: 1 } as any);
  }
  const stageBFixtures = [
    ["fixed_page_sequence_v1", { architectureVersion: "V1", pageCount: 5 }, { pageSequence: [8, 10, 12, 14, 16] }],
    ["case_used_exact_page_scope", { source: "ONE_TIME_USE_THIS_CASE", pageType: "DISHA_BALANCER" }, { scope: "EXACT_PAGE", permanent: false }],
    ["placement_manifest_integrity", { pageCount: 5, firstPageLocked: true }, { manifestVersion: "v5", immutable: true }],
    ["tamper_rejection", { numbering: "tampered", floorScope: "foreign" }, { rejected: true }],
    ["stale_cross_scope_input_rejected", { sourceStatus: "STALE", scope: "CROSS_FLOOR" }, { rejected: true }],
    ["complimentary_configuration_readiness", { engagementClassification: "INTERNAL_COMPLIMENTARY", totalPayablePaise: 0 }, { eligible: true, selectedRemedy: "NONE" }]
  ] as const;
  for (const [index, [fixtureKey, inputJson, expectedOutputJson]] of stageBFixtures.entries()) state.methodologyGoldenFixtures.push({ id: `fixture-native-${index + 1}`, organisationId, methodologyVersionId: stageBMethodology.id, fixtureKey, inputJson, expectedOutputJson, decisionStatus: "APPROVED", contentHash: `sha256:test-only-stage-b-fixture-${index + 1}`, recordVersion: 1 } as any);
  const existingLayoutPlan = { id: "plan-native-v1-existing-layout", organisationId, projectId: project.id, caseId: caseRecord.id, floorId: floor.id, protectedFileRef: "private/native-v1-existing-layout.pdf", status: "CURRENT", recordVersion: 1 } as any;
  state.planVersions.push(existingLayoutPlan);
  const stageBInputDraft = createStageBInputV1({ state, handoffId: remedyTypeHandoff.id, actor: nativeV1Owner, expectedRecordVersion: remedyTypeHandoff.recordVersion, idempotencyKey: "native-v1-stage-b-input-draft" });
  const stageBInput = finalizeStageBInputV1({ state, recordId: stageBInputDraft.id, actor: nativeV1Owner, expectedRecordVersion: stageBInputDraft.recordVersion ?? 0, idempotencyKey: "native-v1-stage-b-input-final" });
  const stageBReadiness = resolveV1FloorWorkflowReadiness(state, caseRecord.id, floor.id);
  const stageBReservation = ensureStageBReservation({ state, caseId: caseRecord.id, floorId: floor.id, actor: nativeV1Owner });
  const readiness = resolveV1FloorWorkflowReadiness(state, caseRecord.id, floor.id);
  return { state, owner: nativeV1Owner, organisationId, client, caseRecord, project, floor, propertyContext, d8, d16, d32: undefined, directionalInput, directionalEvaluation, directionalReportCard, directionalStageAPresentation, statements, siteEvidence, postSiteObservation, energyEvidence, energyStateSet, elementalEvaluation, elementalReport, fullBalanceClearance, remedyTypeHandoff, combinedReport, stageBMethodology, existingLayoutPlan, stageBInput, stageBReadiness, stageBReservation, readiness, resolvePropertyContext: () => resolveEffectivePropertyContext({ state, caseId: caseRecord.id }), resolveD16: () => getD16UtilityMapping({ state, caseId: caseRecord.id, projectId: project.id, floorId: floor.id }) };
}
