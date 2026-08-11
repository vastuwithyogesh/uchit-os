import { NextResponse } from "next/server";
import { AuthenticationError, authErrorResponse, isInitialOrganisationOwnerEmail, resolveRequestActor } from "@/lib/auth";
import { FoundationAccessError, listAuditEvents, resolveActiveOrganisationContext } from "@/lib/foundation.server";

export async function GET(request: Request) {
  try {
    const actor = await resolveRequestActor(request.headers);
    const context = await resolveActiveOrganisationContext(actor, isInitialOrganisationOwnerEmail(actor.email));
    if (context.membership.role !== "SUPER_ADMIN" && context.membership.role !== "ADMIN") return NextResponse.json({ ok: false, error: "Audit access requires organisation administration capability." }, { status: 403 });
    const url = new URL(request.url);
    const events = await listAuditEvents(context.organisation.id, {
      entityType: url.searchParams.get("entityType") || undefined,
      entityId: url.searchParams.get("entityId") || undefined,
      caseId: url.searchParams.get("caseId") || undefined,
      projectId: url.searchParams.get("projectId") || undefined,
      floorId: url.searchParams.get("floorId") || undefined,
      limit: Number(url.searchParams.get("limit") || 50)
    });
    return NextResponse.json({ ok: true, organisationId: context.organisation.id, events }, { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    if (error instanceof AuthenticationError) return authErrorResponse(error);
    if (error instanceof FoundationAccessError) return NextResponse.json({ ok: false, error: error.message }, { status: error.statusCode, headers: { "Cache-Control": "private, no-store" } });
    throw error;
  }
}
