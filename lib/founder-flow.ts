import type { FounderScorecard, FounderScorecardModule } from "./founder-scorecard.ts";

export const founderFlowRequiredInputs: Record<string, string[]> = {
  "client-commercial": ["Permanent Client ID", "Qualification and review", "Approved scope and proposal", "Confirmed advance"],
  "case-project": ["Confirmed advance", "Vastu Case ID", "Project workspace"],
  "floor-setup": ["Exact floor count", "Separate floor workspace", "Floor review and lock"],
  "plans-evidence": ["Current plan version", "Full-colour protected evidence", "Google Earth evidence", "Locked orientation"],
  gridding: ["Founder-confirmed 32D marked evidence", "Founder-confirmed 16D marked evidence", "Approved manual utility sheet"],
  evaluation: ["Approved Utility snapshot", "Approved Shakti snapshot", "Exact floor and plan lineage"],
  site: ["Presented Stage A verdict", "Founder-approved Site Analysis", "Founder-approved Post-Site Findings"],
  verdict: ["Current evaluation and evidence", "Stage A presentation", "Founder review checkpoint"],
  balance: ["Presented verdict", "Remaining balance evidence", "Full payment confirmation"],
  report: ["Full payment", "Founder approval", "Protected immutable report"],
  delivery: ["Released floor report", "Internal delivery history"],
  remedial: ["Released Stage A version", "Approved remedial methodology"],
};

export type FounderFlowStep = FounderScorecardModule & {
  flowPath: string;
  requiredInputs: string[];
};

export function getFounderFlowSteps(scorecard: FounderScorecard): FounderFlowStep[] {
  return scorecard.modules.map((module) => ({
    ...module,
    flowPath: `/founder/${module.number.toString().padStart(2, "0")}`,
    requiredInputs: founderFlowRequiredInputs[module.id] ?? [],
  }));
}

export function getCurrentFounderFlowStep(scorecard: FounderScorecard) {
  const steps = getFounderFlowSteps(scorecard);
  return steps.find((step) => step.status !== "COMPLETE") ?? steps[steps.length - 1];
}

export function getFounderFlowStep(scorecard: FounderScorecard, number: number) {
  return getFounderFlowSteps(scorecard).find((step) => step.number === number);
}

export function canOpenFounderFlowStep(scorecard: FounderScorecard, number: number) {
  const current = getCurrentFounderFlowStep(scorecard);
  return Boolean(current && number <= current.number);
}

export function getPreviousFounderFlowStep(scorecard: FounderScorecard, number: number) {
  return getFounderFlowSteps(scorecard).find((step) => step.number === number - 1);
}

export function getNextFounderFlowStep(scorecard: FounderScorecard, number: number) {
  return getFounderFlowSteps(scorecard).find((step) => step.number === number + 1);
}
