import { NextResponse } from "next/server";
import { requireRouteActor } from "@/lib/auth";
import { getConnectionStatus, readPersistentConnectionSettings, writePersistentConnectionSettings } from "@/lib/server-settings";

export async function GET(request: Request) {
  const access = await requireRouteActor(request, "ADMIN");
  if (!access.ok) {
    return access.response;
  }
  const settings = await readPersistentConnectionSettings();
  return NextResponse.json({
    settings,
    status: getConnectionStatus(settings)
  });
}

export async function POST(request: Request) {
  const access = await requireRouteActor(request, "ADMIN");
  if (!access.ok) {
    return access.response;
  }
  const body = await request.json().catch(() => ({}));
  const settings = await writePersistentConnectionSettings({
    databaseUrl: body.databaseUrl ?? "",
    directUrl: body.directUrl ?? "",
    supabaseUrl: body.supabaseUrl ?? "",
    supabaseAnonKey: body.supabaseAnonKey ?? "",
    supabaseServiceRoleKey: body.supabaseServiceRoleKey ?? "",
    appUrl: body.appUrl ?? "http://localhost:3000"
  });

  return NextResponse.json({
    ok: true,
    settings,
    status: getConnectionStatus(settings)
  });
}
