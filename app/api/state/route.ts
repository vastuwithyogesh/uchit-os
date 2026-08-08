import { NextResponse } from "next/server";
import { requireRouteActor } from "@/lib/auth";
import { loadStateFromPersistence, persistStateToDatabase } from "@/lib/persistence";
import { inspectIntegrity } from "@/lib/integrity";
import { setAppState } from "@/lib/store";
import type { AppState } from "@/lib/store";

export async function GET(request: Request) {
  const access = await requireRouteActor(request, "ADMIN");
  if (!access.ok) {
    return access.response;
  }
  const state = await loadStateFromPersistence();
  const integrity = inspectIntegrity(state);

  return NextResponse.json({
    state,
    integrity,
    counts: {
      clients: state.clients.length,
      leadQualifications: state.leadQualifications.length,
      commercialProposals: state.commercialProposals.length,
      reviewCallBookings: state.reviewCallBookings.length,
      payments: state.payments.length,
      advanceVerifications: state.advanceVerifications.length,
      vastuCases: state.vastuCases.length,
      floorWorkspaces: state.floorWorkspaces.length,
      reportVersions: state.reportVersions.length,
      evaluationSnapshots: state.evaluationSnapshots.length,
      shaktiSnapshots: state.shaktiSnapshots.length,
      timelineEvents: state.timelineEvents.length,
      utilityRules: state.utilityRules.length,
      whatsappTemplates: state.whatsappTemplates.length,
      whatsappLogs: state.whatsappLogs.length
    }
  });
}

export async function POST(request: Request) {
  const access = await requireRouteActor(request, "SUPER_ADMIN");
  if (!access.ok) {
    return access.response;
  }
  const body = await request.json().catch(() => ({}));
  const nextState = body.state as AppState | undefined;

  if (!nextState) {
    return NextResponse.json({ ok: false, error: "Missing state payload." }, { status: 400 });
  }

  const integrity = inspectIntegrity(nextState);
  if (!integrity.ok && !body.force) {
    return NextResponse.json(
      {
        ok: false,
        error: "Imported state failed integrity checks.",
        integrity
      },
      { status: 400 }
    );
  }

  setAppState(nextState);
  await persistStateToDatabase(nextState);

  return NextResponse.json({
    ok: true,
    integrity,
    counts: {
      clients: nextState.clients.length,
      leadQualifications: nextState.leadQualifications.length,
      commercialProposals: nextState.commercialProposals.length,
      reviewCallBookings: nextState.reviewCallBookings.length,
      payments: nextState.payments.length,
      advanceVerifications: nextState.advanceVerifications.length,
      vastuCases: nextState.vastuCases.length,
      floorWorkspaces: nextState.floorWorkspaces.length,
      reportVersions: nextState.reportVersions.length,
      evaluationSnapshots: nextState.evaluationSnapshots.length,
      shaktiSnapshots: nextState.shaktiSnapshots.length,
      timelineEvents: nextState.timelineEvents.length,
      utilityRules: nextState.utilityRules.length,
      whatsappTemplates: nextState.whatsappTemplates.length,
      whatsappLogs: nextState.whatsappLogs.length
    }
  });
}
