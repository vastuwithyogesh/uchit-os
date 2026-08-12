import { NextResponse } from "next/server";
import { requireRouteActor } from "@/lib/auth";
import { loadStateFromPersistence } from "@/lib/persistence";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { inspectIntegrity } from "@/lib/integrity";
import { getFounderZoomReadiness } from "@/lib/founder-zoom.server";

export async function GET(request: Request) {
  const access = await requireRouteActor(request, "ADMIN");
  if (!access.ok) return access.response;
  const env = getRuntimeEnv();
  let stateIntegrityReady = false;
  let persistenceReady = false;
  try {
    const state = await loadStateFromPersistence();
    persistenceReady = true;
    stateIntegrityReady = inspectIntegrity(state).ok;
  } catch {
    persistenceReady = false;
    stateIntegrityReady = false;
  }
  const founderOwnerReady = access.ok && access.actor.role === "SUPER_ADMIN";
  const d1Ready = Boolean(env.DB) && persistenceReady;
  const r2Ready = Boolean(env.R2);
  const pdfOwnerSecretReady = typeof env.PDF_OWNER_SECRET === "string" && env.PDF_OWNER_SECRET.length >= 32;
  const zoom = getFounderZoomReadiness(env);
  const checks = [
    { key: "auth", label: "Founder authentication", ready: founderOwnerReady, recovery: "Sign in as the organisation SUPER_ADMIN/Founder owner, then retry." },
    { key: "d1", label: "Database connection", ready: d1Ready, recovery: "Check the D1 binding and database deployment." },
    { key: "r2", label: "Protected file storage", ready: r2Ready, recovery: "Check the private R2 binding and bucket access." },
    { key: "migrations", label: "Persistence and migrations", ready: persistenceReady, recovery: "Apply the required schema migrations, then run this check again." },
    { key: "uploads", label: "Protected upload readiness", ready: d1Ready && r2Ready, recovery: "Restore both database and protected storage before accepting uploads." },
    { key: "pdf-owner-secret", label: "Protected PDF owner secret", ready: pdfOwnerSecretReady, recovery: "Configure the server-only PDF_OWNER_SECRET (minimum 32 characters) without exposing its value, then retry." },
    { key: "integrity", label: "No blocking data-integrity errors", ready: stateIntegrityReady, recovery: "Open Integrity, resolve every error-level issue, then run this check again." },
    { key: "workflow", label: "Workflow build", ready: true, recovery: "Rebuild and redeploy the tested application version." }
  ];
  const status = checks.every((check) => check.ready) ? "GO" : "NO_GO";
  return NextResponse.json({ scope: "FOUNDER_INTERNAL_PILOT", status, checkedAt: new Date().toISOString(), build: process.env.CF_PAGES_COMMIT_SHA?.slice(0, 12) || process.env.npm_package_version || "local", checks, deferredIntegrations: { zoom } }, { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
