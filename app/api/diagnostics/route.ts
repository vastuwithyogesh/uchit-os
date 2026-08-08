import { NextResponse } from "next/server";
import { listStaffRoleAssignments, requireRouteActor, resolveRequestActor } from "@/lib/auth";
import { loadStateFromPersistence } from "@/lib/persistence";
import { getRuntimeEnv } from "@/lib/runtime-env";

export async function GET(request: Request) {
  const access = await requireRouteActor(request, "ADMIN");
  if (!access.ok) {
    return access.response;
  }
  const state = await loadStateFromPersistence();
  const env = getRuntimeEnv();
  const actor = await resolveRequestActor(request.headers);
  const staffAssignments = await listStaffRoleAssignments();

  return NextResponse.json({
    runtime: {
      actor: {
        fullName: actor.fullName,
        email: actor.email,
        role: actor.role
      },
      d1Configured: Boolean(env.DB),
      r2Configured: Boolean(env.R2),
      staffAssignments: staffAssignments.length
    },
    launchReadiness: {
      authGovernanceReady: staffAssignments.length > 0,
      storageReady: Boolean(env.DB) && Boolean(env.R2),
      leadIntakeReady: state.optInLeads.length > 0 && state.leadQualifications.length > 0,
      commercialReady: state.commercialProposals.some((proposal) => proposal.status === "APPROVED"),
      paymentReady:
        state.advanceVerifications.length > 0 &&
        state.payments.some((payment) => payment.type === "BALANCE" && payment.status === "APPROVED"),
      reportReady:
        state.reportVersions.some((report) => !report.isPreview && (report.approvals?.length ?? 0) >= 2) ||
        state.reportVersions.some((report) => report.status === "RELEASED"),
      timelineReady: state.timelineEvents.length > 0
    },
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
    latestPayments: state.payments.slice(0, 5),
    latestAdvanceVerifications: state.advanceVerifications.slice(0, 5),
    latestEvaluationSnapshots: state.evaluationSnapshots.slice(0, 5),
    latestShaktiSnapshots: state.shaktiSnapshots.slice(0, 5),
    latestReports: state.reportVersions.slice(0, 5)
  });
}
