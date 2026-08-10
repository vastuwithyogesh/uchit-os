import { NextResponse } from "next/server";
import { requireRouteActor } from "@/lib/auth";
import {
  getConnectionStatus,
  readPersistentConnectionSettings,
  redactConnectionSettings,
  writePersistentConnectionSettings
} from "@/lib/server-settings";

export async function GET(request: Request) {
  const access = await requireRouteActor(request, "ADMIN");
  if (!access.ok) {
    return access.response;
  }
  const settings = await readPersistentConnectionSettings();
  return NextResponse.json({
    settings: redactConnectionSettings(settings),
    status: getConnectionStatus(settings)
  });
}

export async function POST(request: Request) {
  const access = await requireRouteActor(request, "SUPER_ADMIN");
  if (!access.ok) {
    return access.response;
  }
  const body = await request.json().catch(() => ({}));
  const current = await readPersistentConnectionSettings();
  const retainWhenRedacted = (value: unknown, existing: string) => {
    const next = typeof value === "string" ? value.trim() : "";
    return next || existing;
  };
  const settings = await writePersistentConnectionSettings({
    databaseUrl: retainWhenRedacted(body.databaseUrl, current.databaseUrl),
    directUrl: retainWhenRedacted(body.directUrl, current.directUrl),
    supabaseUrl: retainWhenRedacted(body.supabaseUrl, current.supabaseUrl),
    supabaseAnonKey: retainWhenRedacted(body.supabaseAnonKey, current.supabaseAnonKey),
    supabaseServiceRoleKey: retainWhenRedacted(body.supabaseServiceRoleKey, current.supabaseServiceRoleKey),
    appUrl: retainWhenRedacted(body.appUrl, current.appUrl || "http://localhost:3000")
  });

  return NextResponse.json({
    ok: true,
    settings: redactConnectionSettings(settings),
    status: getConnectionStatus(settings)
  });
}
