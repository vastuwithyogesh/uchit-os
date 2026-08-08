import { NextResponse } from "next/server";
import { getConnectionStatus, readLocalConnectionSettings, writeLocalConnectionSettings } from "@/lib/server-settings";

export async function GET() {
  const settings = readLocalConnectionSettings();
  return NextResponse.json({
    settings,
    status: getConnectionStatus(settings)
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const settings = writeLocalConnectionSettings({
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
