import { NextResponse } from "next/server";
import {
  AuthenticationError,
  SESSION_API_VERSION,
  authErrorResponse,
  isExplicitLocalDemo,
  resolveRequestActor
} from "@/lib/auth";
import { users } from "@/lib/seed";

export async function GET(request: Request) {
  const isLocalDemo = isExplicitLocalDemo(request.headers);
  const demoRole = isLocalDemo ? new URL(request.url).searchParams.get("role") : null;

  try {
    const actor = await resolveRequestActor(request.headers, demoRole);
    return NextResponse.json(
      {
        version: SESSION_API_VERSION,
        ok: true,
        actor,
        availableUsers: isLocalDemo ? users : [actor],
        isLocalDemo
      },
      { headers: { "Cache-Control": "no-store, private", Vary: "oai-authenticated-user-id, oai-authenticated-user-email" } }
    );
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return authErrorResponse(error);
    }
    throw error;
  }
}
