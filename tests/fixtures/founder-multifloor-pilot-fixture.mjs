import { deterministicContentHash } from "../../lib/evaluation-provenance.ts";
import { buildReleaseableFounderPilotFixture, PILOT_TIME, pilotIds, syntheticManualEvidence, syntheticManualEvidenceVariant, syntheticPlanEvidence } from "./founder-pilot-fixture.mjs";

export const multiFloorIds = Object.freeze({
  floorId: "20000000-0000-4000-8000-000000000002",
  planId: "20000000-0000-4000-8000-000000000003",
  marked32Id: "20000000-0000-4000-8000-000000000004",
  marked16Id: "20000000-0000-4000-8000-000000000005",
  brahmasthanId: "20000000-0000-4000-8000-000000000006",
  marmaaId: "20000000-0000-4000-8000-000000000007",
  graphEvidenceId: "20000000-0000-4000-8000-000000000008",
  evaluationId: "20000000-0000-4000-8000-000000000009",
  shaktiId: "20000000-0000-4000-8000-000000000010",
  verdictId: "20000000-0000-4000-8000-000000000011",
  manualSheetId: "20000000-0000-4000-8000-000000000012",
  previewReportId: "20000000-0000-4000-8000-000000000013",
  officialReportId: "20000000-0000-4000-8000-000000000014",
  siteId: "20000000-0000-4000-8000-000000000015",
  postSiteId: "20000000-0000-4000-8000-000000000016"
});

function unique(base, changes) {
  return { ...structuredClone(base), ...changes, recordVersion: 1 };
}

export function buildReleaseableMultiFloorFounderPilotFixture() {
  const base = buildReleaseableFounderPilotFixture();
  const groundPlanEvidence = syntheticPlanEvidence("ground-floor");
  const groundManualEvidence = syntheticManualEvidence();
  const firstPlanEvidence = syntheticPlanEvidence("first-floor");
  const firstManualEvidence = syntheticManualEvidenceVariant("first-floor");
  const state = structuredClone(base.state);
  const groundFloor = state.floorWorkspaces[0];
  const groundPlan = state.planVersions[0];
  const ground32 = state.spatialEvidenceVersions.find((item) => item.id === pilotIds.marked32Id);
  const ground16 = state.spatialEvidenceVersions.find((item) => item.id === pilotIds.marked16Id);
  const groundBrahmasthan = state.spatialEvidenceVersions.find((item) => item.id === pilotIds.brahmasthanId);
  const groundMarmaa = state.spatialEvidenceVersions.find((item) => item.id === pilotIds.marmaaId);
  const groundGraphEvidence = state.spatialEvidenceVersions.find((item) => item.id === pilotIds.graphEvidenceId);
  const groundEvaluation = state.evaluationSnapshots[0];
  const groundShakti = state.shaktiSnapshots[0];
  const groundVerdict = state.utilityVerdicts[0];
  const groundManual = state.caseDocuments[0];
  const groundPreview = state.reportVersions.find((item) => item.id === pilotIds.previewReportId);
  const groundOfficial = state.reportVersions.find((item) => item.id === pilotIds.officialReportId);
  const groundSite = state.siteAnalyses[0];
  const groundPostSite = state.postSiteFindings[0];

  state.projects[0].propertyName = "Synthetic two-floor residence";
  state.clientIntakeProfiles[0].propertyContext.propertyType = "Synthetic two-floor residence";
  state.floorWorkspaces.push(unique(groundFloor, {
    id: multiFloorIds.floorId, floorLabel: "First floor", deliveredAt: undefined,
    evidenceUploads: [], createdAt: "2026-08-11T06:31:00.000Z"
  }));
  state.planVersions.push(unique(groundPlan, {
    id: multiFloorIds.planId, floorId: multiFloorIds.floorId, versionLabel: "Synthetic first-floor plan v1",
    protectedFileRef: "case-file-pilot-first-floor-plan", idempotencyKey: "pilot-first-floor-plan"
  }));

  const evidenceCopies = [
    [ground32, multiFloorIds.marked32Id, "case-file-pilot-first-floor-32d", "pilot-first-floor-32d"],
    [ground16, multiFloorIds.marked16Id, "case-file-pilot-first-floor-16d", "pilot-first-floor-16d"],
    [groundBrahmasthan, multiFloorIds.brahmasthanId, "case-file-pilot-first-floor-brahmasthan", "pilot-first-floor-brahmasthan"],
    [groundMarmaa, multiFloorIds.marmaaId, "case-file-pilot-first-floor-marmaa", "pilot-first-floor-marmaa"],
    [groundGraphEvidence, multiFloorIds.graphEvidenceId, "case-file-pilot-first-floor-energy-graph", "pilot-first-floor-graph"]
  ];
  for (const [record, id, protectedFileRef, idempotencyKey] of evidenceCopies) state.spatialEvidenceVersions.push(unique(record, {
    id, floorId: multiFloorIds.floorId, planVersionId: multiFloorIds.planId, protectedFileRef, idempotencyKey
  }));

  const firstFloorOpening = unique(state.openingMappings[0], {
    id: "pilot-first-floor-opening-main", floorId: multiFloorIds.floorId, planVersionId: multiFloorIds.planId,
    evidenceVersionId: multiFloorIds.marked32Id, markerX: 0.48, markerY: 0.09, idempotencyKey: "pilot-first-floor-opening"
  });
  state.openingMappings.push(firstFloorOpening);
  const groundSpaces = state.spaceMappings.filter((item) => item.floorId === pilotIds.floorId);
  state.spaceMappings.push(...groundSpaces.map((record, index) => unique(record, {
    id: `pilot-first-floor-space-${index + 1}`, floorId: multiFloorIds.floorId, planVersionId: multiFloorIds.planId,
    evidenceVersionId: multiFloorIds.marked16Id, idempotencyKey: `pilot-first-floor-space-key-${index + 1}`
  })));

  const evaluationInputHash = deterministicContentHash({ floorId: multiFloorIds.floorId, planVersionId: multiFloorIds.planId, rows: groundEvaluation.generatedMatrix.map((row) => [row.utilityName, row.directionCode]) });
  state.evaluationSnapshots.push(unique(groundEvaluation, {
    id: multiFloorIds.evaluationId, floorId: multiFloorIds.floorId, planVersionId: multiFloorIds.planId,
    snapshotName: "Founder multi-floor pilot first-floor Utility evaluation",
    provenance: { ...groundEvaluation.provenance, inputHash: evaluationInputHash }, idempotencyKey: "pilot-first-floor-utility-evaluation"
  }));
  state.shaktiSnapshots.push(unique(groundShakti, {
    id: multiFloorIds.shaktiId, floorId: multiFloorIds.floorId, planVersionId: multiFloorIds.planId,
    provenance: { ...groundShakti.provenance, inputHash: deterministicContentHash({ floorId: multiFloorIds.floorId, bars: groundVerdict.bars, lines: groundVerdict.lines }) },
    idempotencyKey: "pilot-first-floor-shakti"
  }));
  state.utilityVerdicts.push(unique(groundVerdict, {
    id: multiFloorIds.verdictId, floorId: multiFloorIds.floorId, planVersionId: multiFloorIds.planId,
    utilityEvaluationSnapshotId: multiFloorIds.evaluationId,
    inputHash: deterministicContentHash({ floorId: multiFloorIds.floorId, planVersionId: multiFloorIds.planId, bars: groundVerdict.bars, lines: groundVerdict.lines }),
    outputHash: deterministicContentHash({ floorId: multiFloorIds.floorId, verdict: groundVerdict.verdict, triggers: groundVerdict.triggeredDirections }),
    idempotencyKey: "pilot-first-floor-verdict"
  }));
  state.caseDocuments.push(unique(groundManual, {
    id: multiFloorIds.manualSheetId, floorLabel: "First floor", versionLabel: "Synthetic first-floor manual utility sheet v1",
    evidenceRef: "case-file-pilot-first-floor-manual-sheet", idempotencyKey: "pilot-first-floor-manual-sheet"
  }));
  state.reportVersions.push(unique(groundPreview, {
    id: multiFloorIds.previewReportId, floorId: multiFloorIds.floorId, versionLabel: "Synthetic first-floor Stage A preview v1",
    artifact: undefined, createdAt: "2026-08-11T06:32:00.000Z"
  }), unique(groundOfficial, {
    id: multiFloorIds.officialReportId, floorId: multiFloorIds.floorId, versionLabel: "Synthetic first-floor official report v1",
    artifact: undefined, createdAt: "2026-08-11T06:33:00.000Z"
  }));
  state.siteAnalyses.push(unique(groundSite, {
    id: multiFloorIds.siteId, floorId: multiFloorIds.floorId, stageAVerdictReportId: multiFloorIds.previewReportId,
    stageAVerdictVersion: "Synthetic first-floor Stage A preview v1", upstreamEvaluationVersionId: multiFloorIds.evaluationId,
    idempotencyKey: "pilot-first-floor-site", contentHash: deterministicContentHash({ floorId: multiFloorIds.floorId, site: true })
  }));
  state.postSiteFindings.push(unique(groundPostSite, {
    id: multiFloorIds.postSiteId, floorId: multiFloorIds.floorId, siteAnalysisId: multiFloorIds.siteId,
    upstreamReportId: multiFloorIds.previewReportId, upstreamEvaluationVersionId: multiFloorIds.evaluationId,
    idempotencyKey: "pilot-first-floor-post-site", contentHash: deterministicContentHash({ floorId: multiFloorIds.floorId, postSite: true })
  }));
  state.assessmentObservations.push(unique(state.assessmentObservations[0], {
    id: "pilot-first-floor-observation", floorId: multiFloorIds.floorId, title: "Verified first-floor evidence lineage",
    idempotencyKey: "pilot-first-floor-observation"
  }));
  state.recommendations.push(unique(state.recommendations[0], {
    id: "pilot-first-floor-recommendation", floorId: multiFloorIds.floorId, observationIds: ["pilot-first-floor-observation"],
    idempotencyKey: "pilot-first-floor-recommendation"
  }));

  state.auditEvents.push(unique(state.auditEvents[0], {
    id: "pilot-audit-first-floor-created", action: "FLOOR_WORKSPACE_CREATED", entityType: "FLOOR",
    entityId: multiFloorIds.floorId, floorId: multiFloorIds.floorId, requestId: "pilot-request-first-floor-created",
    idempotencyKey: "pilot-audit-first-floor-created", beforeHash: deterministicContentHash(null), afterHash: deterministicContentHash({ floorId: multiFloorIds.floorId })
  }));
  state.timelineEvents.push(unique(state.timelineEvents[0], {
    id: "pilot-timeline-first-floor-created", headline: "FIRST FLOOR WORKSPACE CREATED",
    details: "Synthetic independent first-floor workflow opened.", floorId: multiFloorIds.floorId
  }));

  return {
    mode: "RELEASEABLE_MULTI_FLOOR", state, actor: base.actor,
    ground: { floor: state.floorWorkspaces.find((item) => item.id === pilotIds.floorId), report: state.reportVersions.find((item) => item.id === pilotIds.officialReportId), evidence: { plan: groundPlanEvidence, manual: groundManualEvidence } },
    first: { floor: state.floorWorkspaces.find((item) => item.id === multiFloorIds.floorId), report: state.reportVersions.find((item) => item.id === multiFloorIds.officialReportId), evidence: { plan: firstPlanEvidence, manual: firstManualEvidence } }
  };
}
