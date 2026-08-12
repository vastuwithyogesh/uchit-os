import { NextResponse } from "next/server";
import { d1Migrations, migrateD1 } from "@/db/migrations";
import { isInitialOrganisationOwnerEmail, requireRouteActor } from "@/lib/auth";
import { resolveActiveOrganisationContext } from "@/lib/foundation.server";
import { getRuntimeEnv } from "@/lib/runtime-env";

const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(request: Request) {
  const access = await requireRouteActor(request, "SUPER_ADMIN");
  if (!access.ok) return access.response;
  const foundation = await resolveActiveOrganisationContext(access.actor, isInitialOrganisationOwnerEmail(access.actor.email));
  if (access.actor.id !== foundation.organisation.founderUserId || access.actor.organisationCapability !== "organisation_owner") {
    return NextResponse.json({ ok: false, error: "Only the configured Founder owner can verify migrations." }, { status: 403, headers });
  }
  const db = getRuntimeEnv().DB;
  if (!db) return NextResponse.json({ ok: false, error: "D1 binding is unavailable." }, { status: 503, headers });
  await migrateD1(db);
  const applied = await db.prepare("SELECT version FROM schema_migrations ORDER BY version").all<{ version: number }>();
  const integrity = await db.prepare("PRAGMA quick_check").all<Record<string, string>>();
  const versions = (applied.results ?? []).map((row) => row.version);
  const expected = d1Migrations.map((migration) => migration.version);
  const ready = expected.every((version) => versions.includes(version));
  const integrityValues = (integrity.results ?? []).flatMap((row) => Object.values(row));
  return NextResponse.json({ ok: ready && integrityValues.every((value) => value === "ok"), latestExpectedVersion: expected.at(-1), latestAppliedVersion: versions.at(-1), appliedCount: versions.length, expectedCount: expected.length, integrity: integrityValues.every((value) => value === "ok") ? "OK" : "FAILED" }, { status: ready ? 200 : 503, headers });
}
