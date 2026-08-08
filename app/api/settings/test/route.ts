import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    ok: true,
    settings: {
      mode: "local-first",
      database: "disabled",
      supabase: "disabled"
    },
    result: {
      database: {
        configured: false,
        reachable: false,
        error: "Database connector disabled in the deploy bundle"
      },
      supabase: {
        configured: false,
        reachable: false,
        error: "Supabase connector disabled in the deploy bundle"
      }
    }
  });
}
