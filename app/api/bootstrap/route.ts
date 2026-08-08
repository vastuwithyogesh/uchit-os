import { NextResponse } from "next/server";
import { loadStateFromPersistence, persistStateToDatabase } from "@/lib/persistence";

export async function GET() {
  return NextResponse.json(await loadStateFromPersistence());
}

export async function POST() {
  await persistStateToDatabase();
  const state = await loadStateFromPersistence();

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
  });
}
