import { NextResponse } from "next/server";
import { AuthenticationError, authErrorResponse, resolveRequestActor } from "@/lib/auth";
import { buildClientPortalView, ClientAccountUnlinkedError, ClientPortalAccessError } from "@/lib/client-portal";
import { loadStateFromPersistence } from "@/lib/persistence";

export async function GET(request: Request) {
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
