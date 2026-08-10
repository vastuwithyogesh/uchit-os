import { NextResponse } from "next/server";
import { listStaffRoleAssignments, requireRouteActor } from "@/lib/auth";
import { readPaymentProofManifest, toPublicPaymentProofRecord } from "@/lib/payment-proof-assets.server";
import { loadStateFromPersistence } from "@/lib/persistence";
import { inspectIntegrity } from "@/lib/integrity";
import { getRuntimeEnv } from "@/lib/runtime-env";

export async function GET(request: Request) {
  const access = await requireRouteActor(request, "ADMIN");
  if (!access.ok) {
    return access.response;
  }
  const state = await loadStateFromPersistence();
  const env = getRuntimeEnv();
  const staffAssignments = await listStaffRoleAssignments();
  const paymentProofAssets = await readPaymentProofManifest();
  const summary = inspectIntegrity(state, {
    d1Configured: Boolean(env.DB),
    r2Configured: Boolean(env.R2),
    staffAssignments: staffAssignments.length
  }, paymentProofAssets);

  return NextResponse.json({
    ok: summary.ok,
    issueCount: summary.issues.length,
    runtime: {
      d1Configured: Boolean(env.DB),
      r2Configured: Boolean(env.R2),
      staffAssignments: staffAssignments.length
    },
    counts: {
      clients: state.clients.length,
      proposals: state.commercialProposals.length,
      payments: state.payments.length,
      paymentProofAssets: paymentProofAssets.length,
      cases: state.vastuCases.length,
      reports: state.reportVersions.length,
      evaluationSnapshots: state.evaluationSnapshots.length,
      shaktiSnapshots: state.shaktiSnapshots.length,
      timelineEvents: state.timelineEvents.length
    },
    issues: summary.issues,
    latestPaymentProofAssets: paymentProofAssets.slice(0, 5).map(toPublicPaymentProofRecord)
  });
}
