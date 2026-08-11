import { NextResponse } from "next/server";
import {
  AuthenticationError,
  SESSION_API_VERSION,
  authErrorResponse,
  isExplicitLocalDemo,
  isInitialOrganisationOwnerEmail,
  resolveRequestActor
} from "@/lib/auth";
import { users } from "@/lib/seed";
import { FoundationAccessError, resolveActiveOrganisationContext } from "@/lib/foundation.server";

export async function GET(request: Request) {
  const isLocalDemo = isExplicitLocalDemo(request.headers);
  const demoRole = isLocalDemo ? new URL(request.url).searchParams.get("role") : null;

  try {
    const actor = await resolveRequestActor(request.headers, demoRole);
    const foundation = isLocalDemo ? null : await resolveActiveOrganisationContext(actor, isInitialOrganisationOwnerEmail(actor.email));
    const sessionActor = foundation ? { ...actor, role: foundation.membership.role === "SPECIALIST" ? "CLIENT" as const : foundation.membership.role,
      organisationId: foundation.organisation.id, organisationCapability: foundation.membership.capability } : actor;
    return NextResponse.json(
      {
        version: SESSION_API_VERSION,
        ok: true,
        actor: sessionActor,
        availableUsers: isLocalDemo ? users : [sessionActor],
        isLocalDemo,
        organisation: foundation ? { id: foundation.organisation.id, name: foundation.organisation.name, status: foundation.organisation.status, recordVersion: foundation.organisation.recordVersion } : null,
        workflowPolicyVersion: foundation?.workflowPolicy.version ?? null,
        approvalPolicyVersion: foundation?.approvalPolicy.version ?? null,
        isFounderEdition: foundation?.isFounderEdition ?? false
      },
      { headers: { "Cache-Control": "no-store, private", Vary: "oai-authenticated-user-id, oai-authenticated-user-email" } }
    );
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return authErrorResponse(error);
    }
    if (error instanceof FoundationAccessError) {
      return NextResponse.json({ ok: false, error: { code: "FOUNDATION_ACCESS_DENIED", message: error.message } }, { status: error.statusCode, headers: { "Cache-Control": "no-store, private" } });
    }
    throw error;
  }
}
