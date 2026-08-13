import type { AppUser, VastuCaseRecord } from "./domain.ts";
import type { AppState } from "./store.ts";

/** Server-authoritative Case workspace permission. Client filtering is never sufficient. */
export function canAccessFounderCase(state: AppState, actor: Pick<AppUser, "role"> & Partial<Pick<AppUser, "id" | "organisationId">>, caseRecord: VastuCaseRecord) {
  if (actor.organisationId && caseRecord.organisationId !== actor.organisationId) return false;
  if (actor.role === "SUPER_ADMIN" || actor.role === "ADMIN") return true;
  if (actor.role === "CONSULTANT") {
    const project = state.projects.find((item) => item.id === caseRecord.projectId && item.organisationId === caseRecord.organisationId);
    return project?.assignedConsultantUserId === actor.id;
  }
  if (actor.role === "SETTER") {
    const client = state.clients.find((item) => item.id === caseRecord.clientId && item.organisationId === caseRecord.organisationId);
    return client?.assignedSetterId === actor.id;
  }
  return false;
}
