import type { AppUser, UserRole, VastuCaseStatus } from "@/lib/domain";
import { users } from "@/lib/seed";
import { canonicalStageLabel, getActiveCaseForClient, getServiceReadiness, normalizeCaseService, serviceTypeLabel } from "@/lib/service-framework";
import type { AppState } from "@/lib/store";

export type CaseWorkspaceItem = {
  clientId: string;
  clientName: string;
  city: string;
  caseId?: string;
  caseNumber?: string;
  serviceType?: string;
  canonicalStage?: string;
  readiness?: string;
  stage: string;
  blocker: string;
  nextAction: string;
  owner: string;
  ownerRole: UserRole;
  sla: "ON_TRACK" | "DUE_SOON" | "OVERDUE" | "NO_DUE_DATE";
  slaLabel: string;
  dueAt?: string;
  links: Array<{ href: string; label: string }>;
};

const caseGuidance: Record<VastuCaseStatus, Pick<CaseWorkspaceItem, "stage" | "blocker" | "nextAction" | "ownerRole">> = {
  AWAITING_ADVANCE: { stage: "Waiting for advance", blocker: "Advance payment is not approved", nextAction: "Review payment proof", ownerRole: "ADMIN" },
  CASE_CREATED: { stage: "Case opened", blocker: "Floor work has not started", nextAction: "Set up floor workspace", ownerRole: "CONSULTANT" },
  FLOOR_WORKSPACE_ACTIVE: { stage: "Floor plan in progress", blocker: "Floor plan is not locked", nextAction: "Complete floor review", ownerRole: "CONSULTANT" },
  ORIENTATION_LOCKED: { stage: "Ready to evaluate", blocker: "Evaluation preview is not ready", nextAction: "Run evaluation", ownerRole: "CONSULTANT" },
  STAGE_A_READY: { stage: "Preview ready", blocker: "Balance payment is pending", nextAction: "Share preview and collect balance", ownerRole: "SETTER" },
  BALANCE_PENDING: { stage: "Waiting for balance", blocker: "Balance payment is not approved", nextAction: "Review balance proof", ownerRole: "ADMIN" },
  FULL_PAYMENT_APPROVED: { stage: "Paid in full", blocker: "Report needs approval", nextAction: "Prepare report for approval", ownerRole: "CONSULTANT" },
  REPORT_APPROVAL_PENDING: { stage: "Approval pending", blocker: "Two approvals are required", nextAction: "Review report", ownerRole: "ADMIN" },
  REPORT_APPROVED: { stage: "Approved", blocker: "Verdict has not been released", nextAction: "Release final verdict", ownerRole: "ADMIN" },
  VERDICT_RELEASED: { stage: "Complete", blocker: "No blocker", nextAction: "View delivery record", ownerRole: "CONSULTANT" },
  RECTIFICATION: { stage: "Needs correction", blocker: "Case changes are required", nextAction: "Review correction request", ownerRole: "CONSULTANT" }
};

function slaFromDueAt(dueAt: string | undefined, asOf: Date) {
  if (!dueAt) return { sla: "NO_DUE_DATE" as const, slaLabel: "No due date" };
  const remaining = new Date(dueAt).getTime() - asOf.getTime();
  if (remaining < 0) return { sla: "OVERDUE" as const, slaLabel: "Overdue" };
  if (remaining <= 24 * 60 * 60 * 1000) return { sla: "DUE_SOON" as const, slaLabel: "Due within 24 hours" };
  return { sla: "ON_TRACK" as const, slaLabel: `Due ${new Date(dueAt).toLocaleDateString("en-IN")}` };
}

export function buildCaseWorkspaceProjection(state: AppState, actor: AppUser, asOf = new Date()): CaseWorkspaceItem[] {
  if (actor.role === "CLIENT") return [];

  return state.clients
    .filter((client) => actor.role !== "SETTER" || client.assignedSetterId === actor.id)
    .map((client) => {
      const caseRecord = getActiveCaseForClient(state, client.id);
      const qualification = state.leadQualifications.find((item) => item.clientId === client.id);
      const assignedSetter = state.clients.find((item) => item.id === client.id)?.assignedSetterId;
      const setter = assignedSetter ? users.find((user) => user.id === assignedSetter) : undefined;

      if (!caseRecord) {
        const proposal = state.commercialProposals.find((item) => item.clientId === client.id);
        const needsQualification = !qualification?.qualificationCallCompletedAt;
        const nextAction = needsQualification ? "Complete qualification call" : proposal ? "Approve proposal and advance" : "Prepare proposal";
        const dueAt = needsQualification ? qualification?.qualificationCallDueAt : undefined;
        return {
          clientId: client.id,
          clientName: client.displayName,
          city: client.city,
          stage: client.stage === "CONVERTED" ? "Ready to open case" : "Lead and proposal",
          blocker: needsQualification ? "Qualification is incomplete" : "Advance approval is required",
          nextAction,
          owner: setter?.fullName ?? "Setter team",
          ownerRole: "SETTER" as const,
          ...slaFromDueAt(dueAt, asOf),
          dueAt,
          links: [{ href: "/crm", label: "Open CRM" }, { href: "/payment-proofs", label: "Open proofs" }]
        };
      }

      const guide = caseGuidance[caseRecord.status];
      const service = normalizeCaseService(caseRecord);
      const readiness = getServiceReadiness(caseRecord);
      const latestEvent = state.timelineEvents
        .filter((event) => event.clientId === client.id)
        .sort((a, b) => new Date(b.happenedAt).getTime() - new Date(a.happenedAt).getTime())[0];
      const ageBasedDueAt = latestEvent ? new Date(new Date(latestEvent.happenedAt).getTime() + 2 * 24 * 60 * 60 * 1000).toISOString() : undefined;
      const owner = guide.ownerRole === "SETTER" ? setter?.fullName ?? "Setter team" : `${guide.ownerRole === "CONSULTANT" ? "Consultant" : "Admin"} team`;
      const links = [{ href: "/timeline", label: "Timeline" }];
      if (["AWAITING_ADVANCE", "STAGE_A_READY", "BALANCE_PENDING"].includes(caseRecord.status)) links.unshift({ href: "/payment-proofs", label: "Payment proofs" });
      else if (["ORIENTATION_LOCKED", "FLOOR_WORKSPACE_ACTIVE", "CASE_CREATED", "RECTIFICATION"].includes(caseRecord.status)) links.unshift({ href: "/evaluation", label: "Evaluation" });
      else links.unshift({ href: "/reports", label: "Reports" });

      return {
        clientId: client.id,
        clientName: client.displayName,
        city: client.city,
        caseId: caseRecord.id,
        caseNumber: caseRecord.caseNumber,
        serviceType: serviceTypeLabel(service.serviceType),
        canonicalStage: canonicalStageLabel(service.canonicalStage),
        readiness: `${readiness.completed} of ${readiness.total} inputs ready`,
        stage: guide.stage,
        blocker: guide.blocker,
        nextAction: guide.nextAction,
        owner,
        ownerRole: guide.ownerRole,
        ...slaFromDueAt(caseRecord.status === "VERDICT_RELEASED" ? undefined : ageBasedDueAt, asOf),
        dueAt: caseRecord.status === "VERDICT_RELEASED" ? undefined : ageBasedDueAt,
        links
      };
    })
    .sort((a, b) => {
      const priority = { OVERDUE: 0, DUE_SOON: 1, ON_TRACK: 2, NO_DUE_DATE: 3 };
      return priority[a.sla] - priority[b.sla] || a.clientName.localeCompare(b.clientName);
    });
}
