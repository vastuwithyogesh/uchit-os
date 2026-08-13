import { NextResponse } from "next/server";
import { isExplicitLocalDemo, requireRouteActor } from "@/lib/auth";
import { resolveActiveOrganisationContext } from "@/lib/foundation.server";
import { createEmptyAppState, setAppState, type AppState } from "@/lib/store";
import { clients, commercialProposals, leadQualifications, payments, reportVersions, timelineEvents, utilityRules, vastuCases, whatsappTemplates } from "@/lib/seed";

export async function GET(request: Request) {
  const access = await requireRouteActor(request, "ADMIN");
  if (!access.ok) {
    return access.response;
  }
  if (!isExplicitLocalDemo(request.headers)) {
    return NextResponse.json(
      { ok: false, error: "Demo fixtures are unavailable outside an explicit local demo." },
      { status: 403, headers: { "Cache-Control": "private, no-store" } }
    );
  }
  return NextResponse.json({
    clients,
    commercialProposals,
    leadQualifications,
    payments,
    reportVersions,
    timelineEvents,
    utilityRules,
    vastuCases,
    whatsappTemplates
  }, { headers: { "Cache-Control": "private, no-store" } });
}

/** Explicit loopback-only fixture loader for the owner-visible walkthrough. */
export async function POST(request: Request) {
  const access = await requireRouteActor(request, "ADMIN");
  if (!access.ok) return access.response;
  if (!isExplicitLocalDemo(request.headers)) return NextResponse.json({ ok: false, error: "Walkthrough fixtures are local-only." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  if (body.mode !== "FOUNDER_WALKTHROUGH_TEST_ONLY") return NextResponse.json({ ok: false, error: "Unknown local fixture mode." }, { status: 400 });
  // Test fixtures are intentionally JavaScript so they can also be exercised by Node's
  // contract runner; this route is a guarded local-only adapter.
  // @ts-expect-error no declaration file is deliberately shipped for test fixtures
  const { buildReleaseableFounderPilotFixture, pilotIds } = await import("@/tests/fixtures/founder-pilot-fixture.mjs");
  const fixture = buildReleaseableFounderPilotFixture();
  const context = await resolveActiveOrganisationContext(access.actor, true);
  const remapped = JSON.parse(JSON.stringify(fixture.state)
    .replaceAll(pilotIds.organisationId, context.organisation.id)
    .replaceAll(pilotIds.founderId, access.actor.id));
  remapped.organisations = [context.organisation];
  remapped.organisationMemberships = [context.membership];
  const state = { ...createEmptyAppState(), ...structuredClone(remapped) } as AppState;
  // The pilot fixture is intentionally complete through the protected-report boundary.
  // It leaves Stage B and delivery blocked by the canonical scorecard, not a fixture override.
  setAppState(state);
  return NextResponse.json({ ok: true, label: "TEST_ONLY · Founder complete-flow snapshot", caseId: pilotIds.caseId, floorId: pilotIds.floorId, routes: Array.from({ length: 17 }, (_, index) => `/founder/${String(index + 1).padStart(2, "0")}?caseId=${pilotIds.caseId}&floorId=${pilotIds.floorId}`) }, { headers: { "Cache-Control": "no-store" } });
}
