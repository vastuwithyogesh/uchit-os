import type { FounderScorecard, FounderScorecardModule } from "./founder-scorecard.ts";

export const founderFlowRequiredInputs: Record<string, string[]> = {
  "case-project": ["Approved proposal", "Confirmed advance or approved Internal Complimentary exception", "Permanent Client ID"],
  "floor-setup": ["Confirmed floor count", "Independent floor workspace", "Exact case and project scope"],
  intake: ["Client requirement and desired outcome", "Service, property type and property status", "City and project context"],
  direction: ["Google Earth evidence", "Numeric orientation degree", "Deliberate Founder lock"],
  layout: ["Current protected 2D plan", "Exact floor and plan version", "Immutable replacement history"],
  gridding: ["Founder-confirmed 32-sector chakra", "Founder-confirmed 16-direction evidence", "At least one confirmed property or floor entrance zone"],
  "manual-sheet": ["Original full-colour hand-marked sheet", "Exact floor/plan binding", "Founder approval"],
  evaluation: ["Approved Utility methodology", "Approved graph inputs", "Exact evidence and version lineage"],
  "stage-a": ["Current Utility/Shakti outputs", "Human evidence verification", "Verdict presentation record"],
  site: ["Presented Stage A version", "Video analysis or physical visit evidence", "Required observations"],
  "post-site": ["Approved Site Analysis", "Differences and corrections", "New findings and additional observations"],
  balance: ["Presented verdict", "Approved post-site review", "Remaining balance evidence"],
  remedial: ["Approved Post-Site Findings", "Full balance clearance", "Approved Stage B methodology"],
  "report-assembly": ["Full payment", "Approved Stage B content when methodology exists", "Current one-floor report lineage"],
  "founder-approval": ["Exact assembled report version", "Founder review reason", "Founder approval checkpoint"],
  "protected-pdf": ["Founder-approved report", "Embedded approved manual sheet", "Verified immutable artifact hash"],
  delivery: ["Released protected PDF", "Exact pinned artifact and recipient", "Authorised delivery channel"],
};

export type FounderFlowStep = FounderScorecardModule & { flowPath: string; requiredInputs: string[]; selfRemediableOnCurrentStep: boolean };

export function isFounderStepSelfRemediable(module: FounderScorecardModule, isV1: boolean) {
  return isV1 && (
    ["direction", "gridding"].includes(module.id)
    || (module.id === "evaluation" && module.status === "BLOCKED" && module.explanation === "DIRECTIONAL_REVIEW_REQUIRED")
    || (module.id === "site" && module.status === "BLOCKED" && module.blockerCodes?.length === 1 && module.blockerCodes[0] === "SITE_EVIDENCE_REQUIRED")
  );
}

function contextQuery(scorecard: FounderScorecard) {
  const entries = new URLSearchParams();
  if (scorecard.caseRecord?.id) entries.set("caseId", scorecard.caseRecord.id);
  if (scorecard.selectedFloorId) entries.set("floorId", scorecard.selectedFloorId);
  const value = entries.toString();
  return value ? `?${value}` : "";
}

export function getFounderFlowSteps(scorecard: FounderScorecard): FounderFlowStep[] {
  const suffix = contextQuery(scorecard);
  const isV1 = scorecard.caseRecord?.evaluationArchitectureVersion === "V1" && scorecard.selectedFloor?.evaluationArchitectureVersion === "V1";
  const v1RequiredInputs: Record<string, string[]> = { gridding: ["Case Property Context", "Finalized D8 orientation", "Finalized D16 floor mapping"], "manual-sheet": ["Versioned V1 evidence records", "Exact case and floor binding", "Native V1 lineage"], evaluation: ["Finalized Directional input and evaluation", "Finalized Elemental evaluation", "Exact V1 evidence and version lineage"], "stage-a": ["Finalized Directional Report Card", "Native V1 Stage-A presentation", "Exact case and floor binding"], site: ["Finalized Site Evaluation evidence", "Exact case and floor binding", "Native V1 lineage"], "post-site": ["Finalized Post-Site observations", "Energy evidence and state", "Finalized Elemental report"], remedial: ["Approved Full Balance Clearance", "Current canonical Elemental Evaluation", "Finalized Elemental Report"], "report-assembly": ["Finalized Stage B render manifest", "Full payment", "Current one-floor V1 report lineage"], "protected-pdf": ["Founder-approved v5 report", "Canonical StageBRenderManifest", "Verified immutable artifact hash"] };
  return scorecard.modules.map((module) => ({ ...module, flowPath: `/founder/${module.number.toString().padStart(2, "0")}${suffix}`, requiredInputs: (isV1 ? v1RequiredInputs[module.id] : undefined) ?? founderFlowRequiredInputs[module.id] ?? [], selfRemediableOnCurrentStep: isFounderStepSelfRemediable(module, isV1) }));
}
export function getCurrentFounderFlowStep(scorecard: FounderScorecard) {
  const steps = getFounderFlowSteps(scorecard);
  const isV1 = scorecard.caseRecord?.evaluationArchitectureVersion === "V1" && scorecard.selectedFloor?.evaluationArchitectureVersion === "V1";
  const progressionSteps = isV1 ? steps.filter((step) => step.id !== "manual-sheet") : steps;
  return progressionSteps.find((step) => step.status !== "COMPLETE") ?? progressionSteps[progressionSteps.length - 1];
}
export function getFounderFlowStep(scorecard: FounderScorecard, number: number) { return getFounderFlowSteps(scorecard).find((step) => step.number === number); }
export function canOpenFounderFlowStep(scorecard: FounderScorecard, number: number) { const current = getCurrentFounderFlowStep(scorecard); return Boolean(current && number <= current.number); }
export function getPreviousFounderFlowStep(scorecard: FounderScorecard, number: number) { return getFounderFlowSteps(scorecard).find((step) => step.number === number - 1); }
export function getNextFounderFlowStep(scorecard: FounderScorecard, number: number) { return getFounderFlowSteps(scorecard).find((step) => step.number === number + 1); }
