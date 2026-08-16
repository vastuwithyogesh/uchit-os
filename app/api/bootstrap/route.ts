import { NextResponse } from "next/server";
import { isExplicitLocalDemo, isInitialOrganisationOwnerEmail, requireRouteActor } from "@/lib/auth";
import { loadStateFromPersistence, loadStateSnapshotFromPersistence, persistStateToDatabase } from "@/lib/persistence";
import { FoundationAccessError, resolveActiveOrganisationContext } from "@/lib/foundation.server";
import { projectOrganisationState } from "@/lib/foundation";
import { createServerTiming, withServerTiming } from "@/lib/server-timing";

export async function GET(request: Request) {
  const timing = createServerTiming();
  const authStartedAt = timing.start();
  const access = await requireRouteActor(request, "SETTER");
  timing.end("auth", authStartedAt);
  if (!access.ok) {
    return access.response;
  }
  try {
    // The disposable local demo has no hosted identity headers or pre-existing
    // organisation membership. Allow its synthetic SUPER_ADMIN to bootstrap a
    // local Founder organisation only; hosted requests still require the
    // configured initial-owner email or an active membership.
    const foundationStartedAt = timing.start();
    const allowBootstrap = isInitialOrganisationOwnerEmail(access.actor.email) || isExplicitLocalDemo(request.headers);
    const context = await resolveActiveOrganisationContext(access.actor, allowBootstrap);
    timing.end("foundation", foundationStartedAt);
    const snapshot = await loadStateSnapshotFromPersistence((name, durationMs) => timing.record(`persistence-${name}`, durationMs));
    const projectionStartedAt = timing.start();
    const scopedState = projectOrganisationState(snapshot.state, context.organisation.id);
    const optInLeads = access.actor.role === "SUPER_ADMIN" ? scopedState.optInLeads : scopedState.optInLeads.map((lead) => {
      const { dob: _dob, landingPage: _landingPage, referrer: _referrer, assignedTo: _assignedTo, deletedAt: _deletedAt,
        sourceRecordId: _sourceRecordId, externalClientCode: _externalClientCode, sourceProfile: _sourceProfile, ...safe } = lead;
      return safe;
    });
    timing.end("organisation-projection", projectionStartedAt);
    const response = NextResponse.json({ ...scopedState, persistenceRevision: snapshot.revision, optInLeads, foundation: {
      organisation: context.organisation,
      membership: context.membership,
      workflowPolicyVersion: context.workflowPolicy.version,
      approvalPolicyVersion: context.approvalPolicy.version,
      isFounderEdition: context.isFounderEdition
    } }, { headers: { "Cache-Control": "private, no-store", Vary: "oai-authenticated-user-id, oai-authenticated-user-email" } });
    return withServerTiming(response, timing);
  } catch (error) {
    if (error instanceof FoundationAccessError) return NextResponse.json({ ok: false, error: error.message }, { status: error.statusCode, headers: { "Cache-Control": "private, no-store" } });
    throw error;
  }
}

export async function POST(request: Request) {
  const access = await requireRouteActor(request, "SUPER_ADMIN");
  if (!access.ok) {
    return access.response;
  }
  if (!isExplicitLocalDemo(request.headers)) {
    return NextResponse.json(
      { ok: false, error: "Seed synchronization is disabled in production. Current records were not changed." },
      { status: 403, headers: { "Cache-Control": "private, no-store" } }
    );
  }

  const state = await loadStateFromPersistence();
  await persistStateToDatabase(state);

  return NextResponse.json({
    ok: true,
    synced: true,
    state,
    counts: {
      clients: state.clients.length,
      leads: state.leadQualifications.length,
      proposals: state.commercialProposals.length,
      reviewCallBookings: state.reviewCallBookings.length,
      payments: state.payments.length,
      advanceVerifications: state.advanceVerifications.length,
      cases: state.vastuCases.length,
      floors: state.floorWorkspaces.length,
      reports: state.reportVersions.length,
      utilityRules: state.utilityRules.length,
      templates: state.whatsappTemplates.length,
      timelineEvents: state.timelineEvents.length
    }
  }, { headers: { "Cache-Control": "private, no-store" } });
}
