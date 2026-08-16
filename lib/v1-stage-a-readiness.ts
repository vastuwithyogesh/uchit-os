import type { AppState } from "./store.ts";
export function resolveV1StageAReadiness(state: AppState, caseId: string, floorId: string) {
  const card = state.directionalReportCardSnapshots.find((item) => item.caseId === caseId && item.floorId === floorId && item.status !== "SUPERSEDED");
  const presented = card ? state.directionalStageAPresentations.some((item) => item.reportCardSnapshotId === card.id && item.status === "PRESENTED") : false;
  return { directionalReportCardReady: card?.status === "FINALIZED" && card.cardStatus === "READY", directionalStageAPresented: presented, reportCardStatus: card?.cardStatus ?? "NOT_CREATED", reportCardSnapshotId: card?.id };
}
