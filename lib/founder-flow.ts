import type { FounderScorecard, FounderScorecardModule } from "./founder-scorecard.ts";

export const founderFlowRequiredInputs: Record<string, string[]> = {
  "case-project": ["Approved proposal", "Confirmed advance", "Permanent Client ID"],
  "floor-setup": ["Confirmed floor count", "Independent floor workspace", "Exact case and project scope"],
  intake: ["Approved client and service fields", "Property and layout context", "Location and consent"],
  direction: ["Google Earth evidence", "Numeric orientation degree", "Deliberate Founder lock"],
  layout: ["Current protected 2D plan", "Exact floor and plan version", "Immutable replacement history"],
  gridding: ["Founder-confirmed 32-sector chakra", "Founder-confirmed 16-direction evidence", "Manual Brahmasthan/Marmaa evidence when supplied"],
  "manual-sheet": ["Original full-colour hand-marked sheet", "Exact floor/plan binding", "Founder approval"],
  evaluation: ["Approved Utility methodology", "Approved graph inputs", "Exact evidence and version lineage"],
  "stage-a": ["Current Utility/Shakti outputs", "Human evidence verification", "Verdict presentation record"],
  site: ["Presented Stage A version", "Video analysis or physical visit evidence", "Required observations"],
  "post-site": ["Approved Site Analysis", "Differences and corrections", "New findings and additional observations"],
  balance: ["Presented verdict", "Approved post-site review", "Remaining balance evidence"],
  remedial: ["Released Stage A version", "Approved remedial methodology"],
  "report-assembly": ["Full payment", "Approved Stage B content when methodology exists", "Current one-floor report lineage"],
  "founder-approval": ["Exact assembled report version", "Founder review reason", "Founder approval checkpoint"],
  "protected-pdf": ["Founder-approved report", "Embedded approved manual sheet", "Verified immutable artifact hash"],
  delivery: ["Released protected PDF", "Authorised delivery channel", "Client delivery enablement approval"],
};

export type FounderFlowStep = FounderScorecardModule & { flowPath: string; requiredInputs: string[] };

function contextQuery(scorecard: FounderScorecard) {
  const entries = new URLSearchParams();
  if (scorecard.caseRecord?.id) entries.set("caseId", scorecard.caseRecord.id);
  if (scorecard.selectedFloorId) entries.set("floorId", scorecard.selectedFloorId);
  const value = entries.toString();
  return value ? `?${value}` : "";
}

export function getFounderFlowSteps(scorecard: FounderScorecard): FounderFlowStep[] {
  const suffix = contextQuery(scorecard);
  return scorecard.modules.map((module) => ({ ...module, flowPath: `/founder/${module.number.toString().padStart(2, "0")}${suffix}`, requiredInputs: founderFlowRequiredInputs[module.id] ?? [] }));
}
export function getCurrentFounderFlowStep(scorecard: FounderScorecard) { const steps = getFounderFlowSteps(scorecard); return steps.find((step) => step.status !== "COMPLETE") ?? steps[steps.length - 1]; }
export function getFounderFlowStep(scorecard: FounderScorecard, number: number) { return getFounderFlowSteps(scorecard).find((step) => step.number === number); }
export function canOpenFounderFlowStep(scorecard: FounderScorecard, number: number) { const current = getCurrentFounderFlowStep(scorecard); return Boolean(current && number <= current.number); }
export function getPreviousFounderFlowStep(scorecard: FounderScorecard, number: number) { return getFounderFlowSteps(scorecard).find((step) => step.number === number - 1); }
export function getNextFounderFlowStep(scorecard: FounderScorecard, number: number) { return getFounderFlowSteps(scorecard).find((step) => step.number === number + 1); }
