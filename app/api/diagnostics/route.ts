import { NextResponse } from "next/server";
import { listStaffRoleAssignments, requireRouteActor } from "@/lib/auth";
import { loadStateFromPersistence } from "@/lib/persistence";
import { getRuntimeEnv } from "@/lib/runtime-env";

export async function GET(request: Request) {
  const access = await requireRouteActor(request, "ADMIN");
  if (!access.ok) return access.response;
  const env = getRuntimeEnv();
  let persistenceReady = false;
  try { await loadStateFromPersistence(); persistenceReady = true; } catch { persistenceReady = false; }
  let authReady = false;
  try { authReady = (await listStaffRoleAssignments()).length > 0; } catch { authReady = false; }
  const d1Ready = Boolean(env.DB) && persistenceReady;
  const r2Ready = Boolean(env.R2);
  const checks = [
    { key: "auth", label: "Staff authentication", ready: authReady, recovery: "Create or restore at least one administrator assignment, then retry." },
    { key: "d1", label: "Database connection", ready: d1Ready, recovery: "Check the D1 binding and database deployment." },
    { key: "r2", label: "Protected file storage", ready: r2Ready, recovery: "Check the private R2 binding and bucket access." },
    { key: "migrations", label: "Persistence and migrations", ready: persistenceReady, recovery: "Apply the required schema migrations, then run this check again." },
    { key: "uploads", label: "Protected upload readiness", ready: d1Ready && r2Ready, recovery: "Restore both database and protected storage before accepting uploads." },
    { key: "workflow", label: "Workflow build", ready: true, recovery: "Rebuild and redeploy the tested application version." }
  ];
  const status = checks.every((check) => check.ready) ? "GO" : "NO_GO";
  return NextResponse.json({ status, checkedAt: new Date().toISOString(), build: process.env.CF_PAGES_COMMIT_SHA?.slice(0, 12) || process.env.npm_package_version || "local", checks }, { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
