import { NextResponse } from "next/server";
import { resolveRequestActor } from "@/lib/auth";
import { users } from "@/lib/seed";

export async function GET(request: Request) {
  const actor = await resolveRequestActor(request.headers);
  const isLocalhost = new URL(request.url).hostname === "localhost";

  return NextResponse.json({
    ok: true,
    actor,
    availableUsers: isLocalhost ? users : [actor],
    isLocalDemo: isLocalhost
  });
}
