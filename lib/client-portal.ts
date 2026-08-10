import type { AppUser, ClientRecord, VastuCaseStatus } from "@/lib/domain";
import type { AppState } from "@/lib/store";
import { getActiveCaseForClient } from "@/lib/service-framework";

export class ClientAccountUnlinkedError extends Error {
  readonly code = "CLIENT_ACCOUNT_UNLINKED";

  constructor() {
    super("We could not link this sign-in to a client account. Please ask the Uchit Vastu team to check the email on your case.");
    this.name = "ClientAccountUnlinkedError";
  }
}

export class ClientPortalAccessError extends Error {
  readonly code = "CLIENT_PORTAL_ONLY";

  constructor() {
    super("The client portal is available only to client accounts.");
    this.name = "ClientPortalAccessError";
  }
}

const journeyStages: Array<{ status: VastuCaseStatus; label: string }> = [
  { status: "AWAITING_ADVANCE", label: "Advance payment" },
  { status: "CASE_CREATED", label: "Case opened" },
  { status: "RECTIFICATION", label: "Revision opened" },
  { status: "FLOOR_WORKSPACE_ACTIVE", label: "Plan review" },
  { status: "ORIENTATION_LOCKED", label: "Direction confirmed" },
  { status: "STAGE_A_READY", label: "Preview prepared" },
  { status: "BALANCE_PENDING", label: "Balance payment" },
  { status: "FULL_PAYMENT_APPROVED", label: "Payment complete" },
  { status: "REPORT_APPROVAL_PENDING", label: "Final checks" },
  { status: "REPORT_APPROVED", label: "Report approved" },
  { status: "VERDICT_RELEASED", label: "Verdict delivered" }
];

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function findOwnedClient(actor: AppUser, clients: ClientRecord[]) {
  if (actor.role !== "CLIENT") throw new ClientPortalAccessError();
  const actorEmail = normalizeEmail(actor.email);
  if (!actorEmail) throw new ClientAccountUnlinkedError();
  const matches = clients.filter((client) => normalizeEmail(client.email) === actorEmail);
  if (matches.length !== 1) throw new ClientAccountUnlinkedError();
  return matches[0];
}

function nextActionFor(status?: VastuCaseStatus) {
  switch (status) {
    case "AWAITING_ADVANCE": return "Complete your advance payment, then tell our team.";
    case "CASE_CREATED": return "Your case is open. Our team will prepare your plan workspace.";
    case "FLOOR_WORKSPACE_ACTIVE": return "Your plan is being reviewed. No action is needed from you now.";
    case "ORIENTATION_LOCKED": return "Your direction is confirmed. We are preparing your evaluation.";
    case "STAGE_A_READY": return "Your preview is ready. Open it below.";
    case "BALANCE_PENDING": return "Complete the balance payment to unlock final delivery.";
    case "FULL_PAYMENT_APPROVED": return "Payment is complete. Your report is in final checks.";
    case "REPORT_APPROVAL_PENDING": return "Your report is being checked by two team members.";
    case "REPORT_APPROVED": return "Your report is approved and will be released shortly.";
    case "VERDICT_RELEASED": return "Your final verdict is ready. Download it below.";
    default: return "Your details are linked. Our team will open your case soon.";
  }
}

export function buildClientPortalView(state: AppState, actor: AppUser) {
  const client = findOwnedClient(actor, state.clients);
  const cases = state.vastuCases.filter((item) => item.clientId === client.id);
  const caseIds = new Set(cases.map((item) => item.id));
  const currentCase = getActiveCaseForClient(state, client.id);
  const currentIndex = currentCase ? journeyStages.findIndex((item) => item.status === currentCase.status) : -1;

  return {
    client: { displayName: client.displayName, city: client.city },
    currentCase: currentCase ? {
      caseNumber: currentCase.caseNumber,
      status: currentCase.status,
      reportStatus: currentCase.reportStatus,
      nextAction: nextActionFor(currentCase.status),
      progress: journeyStages.map((item, index) => ({
        label: item.label,
        state: index < currentIndex ? "done" : index === currentIndex ? "current" : "upcoming"
      }))
    } : null,
    appointments: state.reviewCallBookings
      .filter((item) => item.clientId === client.id)
      .map((item) => ({ id: item.id, provider: item.provider, scheduledAt: item.scheduledAt, durationMinutes: item.durationMinutes, meetingLink: item.meetingLink, status: item.status })),
    payments: state.payments
      .filter((item) => item.clientId === client.id)
      .map((item) => ({ id: item.id, type: item.type, amountInr: item.amountInr, status: item.status, approvedAt: item.approvedAt })),
    reports: state.reportVersions
      .filter((item) => caseIds.has(item.caseId))
      .map((item) => ({
        id: item.id,
        label: item.versionLabel,
        kind: item.isPreview ? "PREVIEW" : "FINAL",
        status: item.status,
        available: Boolean(item.artifact?.immutable && (item.isPreview || item.status === "RELEASED")),
        downloadPath: item.artifact?.immutable && (item.isPreview || item.status === "RELEASED")
          ? `/api/client/reports/${encodeURIComponent(item.id)}`
          : null
      })),
    timeline: state.timelineEvents
      .filter((item) => item.clientId === client.id)
      .sort((a, b) => new Date(b.happenedAt).getTime() - new Date(a.happenedAt).getTime())
      .map((item) => ({ id: item.id, category: item.category, headline: item.headline, details: item.details, happenedAt: item.happenedAt }))
  };
}

export type ClientPortalView = ReturnType<typeof buildClientPortalView>;
