import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getMergedConnectionSettings } from "@/lib/server-settings";
import { prisma } from "@/lib/db";

export async function POST() {
  const settings = getMergedConnectionSettings();
  const result = {
    database: {
      configured: Boolean(settings.databaseUrl),
      reachable: false,
      error: null as string | null
    },
    supabase: {
      configured: Boolean(settings.supabaseUrl && settings.supabaseServiceRoleKey),
      reachable: false,
      error: null as string | null
    }
  };

  if (settings.databaseUrl) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      result.database.reachable = true;
    } catch (error) {
      result.database.error = error instanceof Error ? error.message : "Database test failed";
    }
  }

  const supabaseClient = createServerSupabaseClient();
  if (supabaseClient) {
    try {
      const { error } = await supabaseClient.auth.getSession();
      if (error) {
        result.supabase.error = error.message;
      } else {
        result.supabase.reachable = true;
      }
    } catch (error) {
      result.supabase.error = error instanceof Error ? error.message : "Supabase test failed";
    }
  }

  return NextResponse.json({
    ok: true,
    settings,
    result
  });
}
