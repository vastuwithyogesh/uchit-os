import type { AppState } from "./store.ts";
import { getCurrentElementalEvaluation } from "./elemental-evaluation-integration-v1.ts";
import { getCurrentV1FullBalanceClearance } from "./v1-full-balance-clearance.ts";

export type V1MilestoneStatus = "NOT_STARTED" | "IN_PROGRESS" | "READY" | "BLOCKED" | "COMPLETE";
export interface V1FloorWorkflowReadiness {
  architecture: "V1"; caseProperty: V1MilestoneStatus; floor: V1MilestoneStatus; spatial: V1MilestoneStatus;
  directional: V1MilestoneStatus; postSite: V1MilestoneStatus; remedyHandoff: V1MilestoneStatus; stageB: V1MilestoneStatus;
  report: V1MilestoneStatus; blockers: string[]; directionalEvaluationComplete: boolean; directionalStageAPresented: boolean;
  elementalComplete: boolean; elementalReportReady: boolean; fullBalanceClearance: V1MilestoneStatus; stageBInputFinalized: boolean;
}
const latest = <T extends { caseId: string; floorId: string; version?: number; status?: string }>(rows: T[], caseId: string, floorId: string, statuses?: string[]) => rows.filter((x) => x.caseId === caseId && x.floorId === floorId && (!statuses || statuses.includes(x.status ?? ""))).sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0];
const combine = (complete: boolean, started: boolean, blocker?: string): V1MilestoneStatus => complete ? "COMPLETE" : blocker ? "BLOCKED" : started ? "IN_PROGRESS" : "NOT_STARTED";
export function resolveV1FloorWorkflowReadiness(state: AppState, caseId: string, floorId: string): V1FloorWorkflowReadiness {
  const c = state.vastuCases.find((x) => x.id === caseId); const f = state.floorWorkspaces.find((x) => x.id === floorId && x.caseId === caseId);
  const project = c?.projectId ? state.projects.find((x) => x.id === c.projectId && x.activeCaseId === caseId) : undefined;
  const context = Boolean(c?.evaluationArchitectureVersion === "V1" && f?.evaluationArchitectureVersion === "V1" && project && state.casePropertyContexts.some((x) => x.caseId === caseId && x.projectId === project.id));
  const d8 = (state.d8OrientationSnapshots ?? []).find((x) => x.caseId === caseId && (x.status === "FINALIZED" || x.status === "DRAFT"));
  const d16 = (state.d16UtilityMappingVersions ?? []).find((x) => x.caseId === caseId && x.floorId === floorId && x.status === "FINALIZED");
  const entrance = (state.entranceZoneVersions ?? []).some((x) => x.caseId === caseId && x.status === "CURRENT" && (x.scope === "PROPERTY_MAIN_GATE" || x.floorId === floorId));
  const directionalInput = latest(state.directionalInputVersions, caseId, floorId, ["FINALIZED"]);
  const directionalEval = latest(state.directionalEvaluationSnapshots, caseId, floorId, ["COMPLETE"]);
  const card = latest(state.directionalReportCardSnapshots, caseId, floorId, ["FINALIZED"]);
  const presented = (state.directionalStageAPresentations ?? []).some((x) => x.caseId === caseId && x.floorId === floorId && x.status === "PRESENTED");
  const site = latest(state.siteEvaluationEvidenceVersions, caseId, floorId, ["FINALIZED"]);
  const post = latest(state.postSiteElementalObservations, caseId, floorId, ["FINALIZED"]);
  const energyEvidence = latest(state.energyBarEvidenceVersions, caseId, floorId, ["FINALIZED"]);
  const energyState = latest(state.energyBarStateSetVersions, caseId, floorId, ["FINALIZED"]);
  const elemental = c?.organisationId && c.projectId ? getCurrentElementalEvaluation(state, c.organisationId, caseId, c.projectId, floorId) : undefined;
  const elementalReport = elemental && c?.organisationId && c.projectId ? state.elementalReportSnapshots.find((x) => x.organisationId === c.organisationId && x.caseId === caseId && x.projectId === c.projectId && x.floorId === floorId && x.status === "FINALIZED" && x.elementalEvaluationSnapshotId === elemental.id && x.elementalEvaluationOutputHash === elemental.outputHash) : undefined;
  const clearance = c?.organisationId && c.projectId ? getCurrentV1FullBalanceClearance(state, c.organisationId, caseId, c.projectId, floorId) : undefined;
  const handoff = (state.evaluationRemedyHandoffs ?? []).find((x) => x.caseId === caseId && x.floorId === floorId && x.status === "READY");
  const input = (state.stageBInputsV1 ?? []).find((x) => x.caseId === caseId && x.floorId === floorId && x.status === "FINALIZED");
  // V1 does not make a raw entrance-zone record a universal Step 06 gate.
  // Entrance evidence is a separately scoped D32 input; spatial readiness is
  // established by the authoritative D8 orientation and finalized D16 map.
  const spatialComplete = Boolean(d8 && d16);
  const directionalComplete = Boolean(directionalInput && directionalEval && card && presented);
  const postComplete = Boolean(site && post && energyEvidence && energyState && elemental && elementalReport);
  const handoffComplete = Boolean(handoff);
  const blockers: string[] = [];
  if (!context) blockers.push("PROPERTY_CONTEXT_REQUIRED"); else if (!d16) blockers.push("D16_MAPPING_REQUIRED");
  if (!directionalEval) blockers.push("DIRECTIONAL_REVIEW_REQUIRED"); else if (!presented) blockers.push("DIRECTIONAL_STAGE_A_REQUIRED");
  if (!site) blockers.push("SITE_EVIDENCE_REQUIRED"); else if (!energyState) blockers.push("ENERGY_STATE_REQUIRED"); else if (!elemental) blockers.push("ELEMENTAL_REVIEW_REQUIRED");
  if (!input) blockers.push("STAGE_B_INPUT_REQUIRED");
  const fullBalanceClearance = clearance ? "COMPLETE" : elementalReport ? "READY" : "BLOCKED";
  return { architecture: "V1", caseProperty: combine(context, Boolean(c)), floor: combine(Boolean(f?.locked), Boolean(f)), spatial: combine(spatialComplete, Boolean(d8 || d16), !d16 ? "D16_MAPPING_REQUIRED" : undefined), directional: combine(directionalComplete, Boolean(directionalInput || directionalEval || card), !directionalEval ? "DIRECTIONAL_REVIEW_REQUIRED" : !presented ? "DIRECTIONAL_STAGE_A_REQUIRED" : undefined), postSite: combine(postComplete, Boolean(site || post || energyEvidence || energyState || elemental || elementalReport), !site ? "SITE_EVIDENCE_REQUIRED" : !energyState ? "ENERGY_STATE_REQUIRED" : !elemental ? "ELEMENTAL_REVIEW_REQUIRED" : undefined), fullBalanceClearance, remedyHandoff: combine(handoffComplete, Boolean(handoff || input), !input ? "STAGE_B_INPUT_REQUIRED" : undefined), stageB: combine(Boolean((state.stageBRemediations ?? []).some((x) => x.caseId === caseId && x.floorId === floorId && x.state === "PAGE_FINALISED")), Boolean((state.stageBRemediations ?? []).some((x) => x.caseId === caseId && x.floorId === floorId)), undefined), report: combine(Boolean((state.reportVersions ?? []).some((x) => x.caseId === caseId && x.floorId === floorId && !x.isPreview && ["APPROVED", "RELEASED"].includes(x.status))), Boolean((state.reportVersions ?? []).some((x) => x.caseId === caseId && x.floorId === floorId)), undefined), blockers, directionalEvaluationComplete: Boolean(directionalEval), directionalStageAPresented: presented, elementalComplete: Boolean(elemental), elementalReportReady: Boolean(elementalReport), stageBInputFinalized: Boolean(input) };
}
