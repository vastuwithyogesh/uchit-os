import type { AppState } from "./store.ts";
import { resolveEvaluationArchitecture } from "./evaluation-architecture.ts";

export function resolveV1SpatialReadiness(state: AppState, caseId: string, floorId: string) {
  const architecture = resolveEvaluationArchitecture({ state, caseId, floorId });
  const floor = state.floorWorkspaces.find((item) => item.id === floorId && item.caseId === caseId);
  const projectId = floor?.projectId;
  const d8 = state.d8OrientationSnapshots.find((item) => item.caseId === caseId && item.status !== "SUPERSEDED");
  const mapping = projectId ? state.d16UtilityMappingVersions.find((item) => item.caseId === caseId && item.projectId === projectId && item.floorId === floorId && item.status === "FINALIZED") : undefined;
  const mainEntrance = state.entranceZoneVersions.find((item) => item.caseId === caseId && item.scope === "PROPERTY_MAIN_GATE" && ["CURRENT", "FINALIZED"].includes(item.status));
  const floorEntrance = state.entranceZoneVersions.find((item) => item.caseId === caseId && item.floorId === floorId && item.scope === "FLOOR_PRIMARY_ENTRANCE" && ["CURRENT", "FINALIZED"].includes(item.status));
  return { architecture, directionVerified: Boolean(d8), griddingEvidencePresent: Boolean(floor?.evidenceUploads.length), mappingFinal: Boolean(mapping), mainEntranceConfirmed: Boolean(mainEntrance), floorEntranceConfirmed: Boolean(floorEntrance) };
}
