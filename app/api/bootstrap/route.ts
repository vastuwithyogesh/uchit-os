import { NextResponse } from "next/server";
import { isExplicitLocalDemo, requireRouteActor } from "@/lib/auth";
import { loadStateFromPersistence, loadStateSnapshotFromPersistence, persistStateToDatabase } from "@/lib/persistence";

export async function GET(request: Request) {
  const access = await requireRouteActor(request, "SETTER");
  if (!access.ok) {
    return access.response;
  }
  const snapshot = await loadStateSnapshotFromPersistence();
  return NextResponse.json({ ...snapshot.state, persistenceRevision: snapshot.revision });
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
