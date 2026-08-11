import type { AppState } from "@/lib/store";

export interface ProjectProgress {
  projectId: string;
  totalFloors: number;
  releasedFloors: number;
  deliveredFloors: number;
  incompleteFloors: number;
  status: "IN_PROGRESS" | "COMPLETE";
}

/**
 * Project completion is derived only from independent floor results. A floor
 * is complete when its case has an immutable released final report and the
 * floor has an explicit delivery timestamp. Partial completion never closes
 * the project and floor reports are never merged.
 */
export function getProjectProgress(state: AppState, projectId: string): ProjectProgress {
  const floors = state.floorWorkspaces.filter((item) => item.projectId === projectId);
  let releasedFloors = 0;
  let deliveredFloors = 0;

  for (const floor of floors) {
    const released = state.reportVersions.some((report) => report.caseId === floor.caseId
      && report.floorId === floor.id
      && !report.isPreview
      && report.status === "RELEASED"
      && report.artifact?.immutable === true);
    if (released) releasedFloors += 1;
    if (released && floor.deliveredAt) deliveredFloors += 1;
  }

  const complete = floors.length > 0 && deliveredFloors === floors.length;
  return {
    projectId,
    totalFloors: floors.length,
    releasedFloors,
    deliveredFloors,
    incompleteFloors: floors.length - deliveredFloors,
    status: complete ? "COMPLETE" : "IN_PROGRESS"
  };
}

export function getProjectForCase(state: AppState, caseId: string) {
  const caseRecord = state.vastuCases.find((item) => item.id === caseId);
  return caseRecord?.projectId ? state.projects.find((item) => item.id === caseRecord.projectId) : undefined;
}
