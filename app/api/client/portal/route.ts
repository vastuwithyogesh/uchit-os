import { NextResponse } from "next/server";
import { AuthenticationError, authErrorResponse, resolveRequestActor } from "@/lib/auth";
import { buildClientPortalView, ClientAccountUnlinkedError, ClientPortalAccessError } from "@/lib/client-portal";
import { loadStateFromPersistence } from "@/lib/persistence";
const CLIENT_DELIVERY_ENABLED = false as const;

export async function GET(request: Request) {
  // Founder Edition is staff-only. Keep the ownership implementation dormant
  // for Team/SaaS activation, but fail closed before reading client data.
  if (!CLIENT_DELIVERY_ENABLED) {
    return NextResponse.json({ ok: false, error: { code: "CLIENT_DELIVERY_DEFERRED", message: "Client delivery is disabled during Founder Edition." } }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
  }
  try {
    const actor = await resolveRequestActor(request.headers);
    const state = await loadStateFromPersistence();
    return NextResponse.json({ ok: true, portal: buildClientPortalView(state, actor) }, {
      headers: { "Cache-Control": "private, no-store", Vary: "oai-authenticated-user-id, oai-authenticated-user-email" }
    });
  } catch (error) {
    if (error instanceof AuthenticationError) return authErrorResponse(error);
    if (error instanceof ClientPortalAccessError) {
      return NextResponse.json({ ok: false, error: { code: error.code, message: error.message } }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
    }
    if (error instanceof ClientAccountUnlinkedError) {
      return NextResponse.json({ ok: false, error: { code: error.code, message: error.message } }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
    }
    throw error;
  }
}
