import type { AppState } from "./store.ts";
import { resolveEvaluationArchitecture } from "./evaluation-architecture.ts";

export function resolveV1DirectionalReadiness(state: AppState, caseId: string, floorId: string) {
  const architecture = resolveEvaluationArchitecture({ state, caseId, floorId });
  const input = state.directionalInputVersions.find((item) => item.caseId === caseId && item.floorId === floorId && item.status === "FINALIZED");
  const snapshot = state.directionalEvaluationSnapshots.find((item) => item.caseId === caseId && item.floorId === floorId && item.status !== "SUPERSEDED");
  return { architecture, directionalInputFinal: Boolean(input), directionalEvaluationComplete: snapshot?.status === "COMPLETE", evaluationStatus: snapshot?.status ?? "NOT_EVALUATED", reviewReasons: snapshot?.result && typeof snapshot.result === "object" && "reviewReasons" in snapshot.result ? (snapshot.result as { reviewReasons?: unknown }).reviewReasons ?? [] : [] };
}
