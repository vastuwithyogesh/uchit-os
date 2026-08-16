import { NextResponse } from "next/server";
import { isInitialOrganisationOwnerEmail, requireRouteActor } from "@/lib/auth";
import { canAccessFounderCase } from "@/lib/founder-case-access";
import { resolveActiveOrganisationContext } from "@/lib/foundation.server";
import { buildFounderScorecard } from "@/lib/founder-scorecard";
import { getCurrentFounderFlowStep } from "@/lib/founder-flow";
import { loadStateFromPersistence } from "@/lib/persistence";

const privateHeaders = { "Cache-Control": "private, no-store", Vary: "oai-authenticated-user-id, oai-authenticated-user-email" };

export async function GET(request: Request) {
  const access = await requireRouteActor(request, "SETTER");
  if (!access.ok) return access.response;
  const foundation = await resolveActiveOrganisationContext(access.actor, isInitialOrganisationOwnerEmail(access.actor.email));
  const actor = { ...access.actor, organisationId: foundation.organisation.id };
  const state = await loadStateFromPersistence();
  const cases = state.vastuCases.filter((item) => canAccessFounderCase(state, actor, item)).map((item) => {
    const client = state.clients.find((candidate) => candidate.id === item.clientId && candidate.organisationId === item.organisationId);
    const project = state.projects.find((candidate) => candidate.id === item.projectId && candidate.organisationId === item.organisationId);
    const prospective = state.prospectiveProjects.find((candidate) => candidate.caseId === item.id && candidate.clientId === item.clientId && candidate.organisationId === item.organisationId);
    const floors = state.floorWorkspaces.filter((candidate) => candidate.caseId === item.id && candidate.organisationId === item.organisationId).map((floor) => {
      const current = getCurrentFounderFlowStep(buildFounderScorecard(state, actor, item.clientId, item.id, floor.id));
      return { id: floor.id, label: floor.floorLabel, currentStep: current?.number, currentTitle: current?.title, currentStatus: current?.status };
    });
    const selectedFloor = floors[0];
    return {
      id: item.id,
      caseNumber: item.caseNumber,
      clientName: client?.displayName ?? "Client unavailable",
      projectName: project?.propertyName ?? prospective?.displayName ?? "Project pending",
      variation: prospective?.variation ?? [item.serviceType, prospective?.propertyType].filter(Boolean).join(" · "),
      propertyLocation: prospective?.propertyLocation ?? "",
      assignedToViewer: actor.role === "SUPER_ADMIN" || actor.role === "ADMIN" || project?.assignedConsultantUserId === actor.id || client?.assignedSetterId === actor.id,
      needsAction: selectedFloor ? selectedFloor.currentStatus !== "COMPLETE" : true,
      updatedAt: project?.completedAt ?? project?.createdAt,
      floors
    };
  });
  return NextResponse.json({ cases }, { headers: privateHeaders });
}
