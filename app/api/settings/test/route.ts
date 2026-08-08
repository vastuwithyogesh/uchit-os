import { NextResponse } from "next/server";
import { resolveRequestActor, listStaffRoleAssignments, requireRouteActor } from "@/lib/auth";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { readPersistentConnectionSettings, getConnectionStatus } from "@/lib/server-settings";

export async function POST(request: Request) {
  const access = await requireRouteActor(request, "ADMIN");
  if (!access.ok) {
    return access.response;
  }
  const actor = await resolveRequestActor(request.headers);
  const settings = await readPersistentConnectionSettings();
  const status = getConnectionStatus(settings);
  const env = getRuntimeEnv();

  let d1Reachable = false;
  let d1Error: string | null = null;
  if (env.DB) {
    try {
      await env.DB.prepare("SELECT 1 as ok").first();
      d1Reachable = true;
    } catch (error) {
      d1Error = error instanceof Error ? error.message : "D1 check failed";
    }
  }

  let r2Reachable = false;
  let r2Error: string | null = null;
  if (env.R2) {
    try {
      await env.R2.put("healthchecks/settings-test.txt", `checked:${new Date().toISOString()}`);
      r2Reachable = true;
    } catch (error) {
      r2Error = error instanceof Error ? error.message : "R2 check failed";
    }
  }

  const assignments = await listStaffRoleAssignments();

  return NextResponse.json({
    ok: true,
    settings: {
      mode: env.DB || env.R2 ? "sites-persistent" : "local-fallback",
      actor: {
        fullName: actor.fullName,
        email: actor.email,
        role: actor.role
      }
    },
    result: {
      d1: {
        configured: Boolean(env.DB),
        reachable: d1Reachable,
        error: d1Error
      },
      r2: {
        configured: Boolean(env.R2),
        reachable: r2Reachable,
        error: r2Error
      },
      connectionProfile: {
        configuredKeys: status,
        error: null
      },
      staffRoles: {
        configured: assignments.length > 0,
        reachable: true,
        error: null,
        count: assignments.length
      }
    }
  });
}
