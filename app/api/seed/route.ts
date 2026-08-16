import { NextResponse } from "next/server";
import { isExplicitLocalDemo, requireRouteActor } from "@/lib/auth";
import { resolveActiveOrganisationContext } from "@/lib/foundation.server";
import { createEmptyAppState, type AppState } from "@/lib/store";
import { activateLocalWalkthroughState } from "@/lib/persistence";
import { activateLocalEntranceZoneCatalogV1 } from "@/lib/entrance-zone-catalog-v1";
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
  if (body.mode === "FOUNDER_CONTINUOUS_TEST_ONLY") {
    const context = await resolveActiveOrganisationContext(access.actor, true);
    const { buildContinuousFounderWalkthrough } = await import("@/lib/founder-local-walkthrough.server");
    const fixture = await buildContinuousFounderWalkthrough({ organisation: context.organisation, membership: context.membership, actor: access.actor });
    activateLocalWalkthroughState(fixture.state);
    return NextResponse.json({ ok: true, label: "TEST_ONLY · Continuous Founder rehearsal", clientId: fixture.clientId, prospectiveProjectId: fixture.prospectiveProjectId, proposalVersionId: fixture.proposalVersionId, caseId: fixture.caseId, floorId: fixture.floorId, startUrl: `/founder/01?caseId=${fixture.caseId}&floorId=${fixture.floorId}` }, { headers: { "Cache-Control": "no-store" } });
  }
  if (!new Set(["FOUNDER_WALKTHROUGH_TEST_ONLY", "FOUNDER_STEP06_TEST_ONLY", "FOUNDER_STEP08_MIXED_TEST_ONLY"]).has(body.mode)) return NextResponse.json({ ok: false, error: "Unknown local fixture mode." }, { status: 400 });
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
  activateLocalEntranceZoneCatalogV1({ state, organisationId: context.organisation.id, actorUserId: access.actor.id });
  if (body.mode === "FOUNDER_STEP06_TEST_ONLY") {
    state.spatialEvidenceVersions = state.spatialEvidenceVersions.filter((item) => item.classification !== "MARKED_32D_CHAKRA_V1" && item.classification !== "MARKED_16D_MAPPING_V1");
    state.entranceZoneVersions = [];
    state.openingMappings = [];
    state.spaceMappings = [];
    state.evaluationSnapshots = [];
    state.utilityVerdicts = [];
    state.shaktiSnapshots = [];
    state.siteAnalyses = [];
    state.postSiteFindings = [];
    state.reportVersions = [];
    state.dependencyInvalidations = [];
  }
  if (body.mode === "FOUNDER_STEP08_MIXED_TEST_ONLY") {
    state.evaluationSnapshots = [];
    state.utilityVerdicts = [];
    state.stageAFloorReviews = [];
    state.stageAFloorApprovalCheckpoints = [];
    state.siteAnalyses = [];
    state.postSiteFindings = [];
    state.assessmentObservations = [];
    state.recommendations = [];
    state.implementationTasks = [];
    state.reportVersions = [];
    state.dependencyInvalidations = [];
    const floor = state.floorWorkspaces.find((item) => item.id === pilotIds.floorId);
    if (floor) { floor.stageAVerdictStatus = undefined; floor.reportStatus = "DRAFT"; }
  }
  // The pilot fixture is intentionally complete through the protected-report boundary.
  // It leaves Stage B and delivery blocked by the canonical scorecard, not a fixture override.
  activateLocalWalkthroughState(state);
  return NextResponse.json({ ok: true, label: body.mode === "FOUNDER_STEP06_TEST_ONLY" ? "TEST_ONLY · Step 06 entrance-zone rehearsal" : "TEST_ONLY · Founder complete-flow snapshot", caseId: pilotIds.caseId, floorId: pilotIds.floorId, routes: Array.from({ length: 17 }, (_, index) => `/founder/${String(index + 1).padStart(2, "0")}?caseId=${pilotIds.caseId}&floorId=${pilotIds.floorId}`) }, { headers: { "Cache-Control": "no-store" } });
}
