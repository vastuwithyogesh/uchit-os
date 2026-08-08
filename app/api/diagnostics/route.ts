import { NextResponse } from "next/server";
import { loadStateFromPersistence } from "@/lib/persistence";

export async function GET() {
  const state = await loadStateFromPersistence();

  return NextResponse.json({
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
      utilityRules: state.utilityRules.length
    },
    latestReviewCallBookings: state.reviewCallBookings.slice(0, 5),
    latestAdvanceVerifications: state.advanceVerifications.slice(0, 5),
    latestEvaluationSnapshots: state.evaluationSnapshots.slice(0, 5),
    latestShaktiSnapshots: state.shaktiSnapshots.slice(0, 5),
    latestReports: state.reportVersions.slice(0, 5)
  });
}
