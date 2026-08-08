import { NextResponse } from "next/server";
import { loadStateFromPersistence } from "@/lib/persistence";
import { inspectIntegrity } from "@/lib/integrity";

export async function GET() {
  const state = await loadStateFromPersistence();
  const summary = inspectIntegrity(state);

  return NextResponse.json({
    ok: summary.ok,
    issueCount: summary.issues.length,
    counts: {
      clients: state.clients.length,
      proposals: state.commercialProposals.length,
      payments: state.payments.length,
      cases: state.vastuCases.length,
      reports: state.reportVersions.length,
      evaluationSnapshots: state.evaluationSnapshots.length,
      shaktiSnapshots: state.shaktiSnapshots.length,
      timelineEvents: state.timelineEvents.length
    },
    issues: summary.issues
  });
}
