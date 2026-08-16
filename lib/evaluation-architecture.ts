import type { AppState } from "./store";

export const evaluationArchitectureVersions = ["LEGACY", "V1"] as const;
export type EvaluationArchitectureVersion = (typeof evaluationArchitectureVersions)[number];

export function resolveEvaluationArchitecture(input: {
  state: AppState;
  caseId: string;
  floorId?: string;
}): { caseVersion: EvaluationArchitectureVersion; floorVersion?: EvaluationArchitectureVersion; caseId: string; floorId?: string } {
  const caseRecord = input.state.vastuCases.find((item) => item.id === input.caseId);
  if (!caseRecord) throw new Error("Case not found.");
  const caseVersion = caseRecord.evaluationArchitectureVersion ?? "LEGACY";
  const floor = input.floorId ? input.state.floorWorkspaces.find((item) => item.id === input.floorId && item.caseId === input.caseId) : undefined;
  if (input.floorId && !floor) throw new Error("Floor does not belong to the selected case.");
  return { caseVersion, floorVersion: floor ? (floor.evaluationArchitectureVersion ?? "LEGACY") : undefined, caseId: input.caseId, floorId: input.floorId };
}
