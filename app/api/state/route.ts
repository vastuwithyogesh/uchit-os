import { NextResponse } from "next/server";
import { requireRouteActor } from "@/lib/auth";
import { readPaymentProofManifest } from "@/lib/payment-proof-assets.server";
import {
  loadStateSnapshotFromPersistence,
  persistStateToDatabase,
  PersistenceConflictError
} from "@/lib/persistence";
import { parseExpectedRevision } from "@/lib/persistence-version";
import { inspectIntegrity } from "@/lib/integrity";
import type { AppState } from "@/lib/store";

export async function GET(request: Request) {
  const access = await requireRouteActor(request, "ADMIN");
  if (!access.ok) {
    return access.response;
  }
  const { state, revision } = await loadStateSnapshotFromPersistence();
  const paymentProofAssets = await readPaymentProofManifest();
  const integrity = inspectIntegrity(state, undefined, paymentProofAssets);

  return NextResponse.json({
    state,
    revision,
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
      paymentProofAssets: paymentProofAssets.length,
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

  const current = await loadStateSnapshotFromPersistence();
  const expectedRevision = parseExpectedRevision(body.expectedRevision);
  if (current.revision !== null && expectedRevision === null) {
    return NextResponse.json(
      { ok: false, error: "expectedRevision is required for full-state replacement.", revision: current.revision },
      { status: 428 }
    );
  }

  const paymentProofAssets = await readPaymentProofManifest();
  const integrity = inspectIntegrity(nextState, undefined, paymentProofAssets);
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

  try {
    await persistStateToDatabase(nextState, expectedRevision ?? undefined);
  } catch (error) {
    if (error instanceof PersistenceConflictError) {
      const latest = await loadStateSnapshotFromPersistence();
      return NextResponse.json(
        { ok: false, error: error.message, revision: latest.revision },
        { status: 409 }
      );
    }
    throw error;
  }

  const revision = expectedRevision === null ? null : expectedRevision + 1;

  return NextResponse.json({
    ok: true,
    revision,
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
      paymentProofAssets: paymentProofAssets.length,
      utilityRules: nextState.utilityRules.length,
      whatsappTemplates: nextState.whatsappTemplates.length,
      whatsappLogs: nextState.whatsappLogs.length
    }
  });
}
