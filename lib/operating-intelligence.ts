import type { AppUser, CanonicalPipelineStage, CanonicalServiceStage, UserRole, VastuServiceType } from "./domain.ts";
import { canonicalPipelineStages } from "./domain.ts";
import { normalizeClientPipeline } from "./crm-pipeline.ts";
import { canonicalServiceStages, serviceTypes } from "./domain.ts";
import { getActiveCaseForClient, normalizeCaseService } from "./service-framework.ts";
import type { AppState } from "./store.ts";

const terminalPipelineStages = new Set<CanonicalPipelineStage>(["CLOSED_REFERRAL", "DISQUALIFIED"]);
const terminalMilestoneStatuses = new Set(["COMPLETED", "DEFERRED"]);

export interface OperatingIntelligenceProjection {
  schemaVersion: "operating-intelligence/v1";
  asOf: string;
  scope: { kind: "ALL_STAFF"; viewerRole: "ADMIN" | "SUPER_ADMIN" };
  funnel: { total: number; byStage: Record<CanonicalPipelineStage, number> };
  workload: { active: number; overdue: number; dueSoon: number; missingNextAction: number; dueSoonHours: number };
  ownerWorkload: Array<{ ownerRole: UserRole | "UNASSIGNED"; active: number; overdue: number; dueSoon: number; missingNextAction: number }>;
  activeCases: { total: number; byService: Record<VastuServiceType, number>; byStage: Record<CanonicalServiceStage, number> };
  delivery: { open: number; overdue: number; dueSoon: number; blocked: number; missingDueDate: number };
  gates: {
    reports: { previewBlocked: number; paymentBlocked: number; awaitingApproval: number; approvedNotReleased: number };
    payments: { awaitingAdvance: number; balanceNotApproved: number; fullPaymentNotApproved: number };
  };
  unavailable: { averageStageDuration: "N/A"; conversionRate: "N/A"; reason: string };
  dataQuality: { invalidNextActionDates: number; invalidMilestoneDueDates: number };
}

function countRecord<T extends string>(values: readonly T[]): Record<T, number> {
  return Object.fromEntries(values.map((value) => [value, 0])) as Record<T, number>;
}

function dueBucket(value: string | undefined, now: number, dueSoonAt: number): "OVERDUE" | "DUE_SOON" | "LATER" | "MISSING" | "INVALID" {
  if (!value) return "MISSING";
  const due = Date.parse(value);
  if (!Number.isFinite(due)) return "INVALID";
  if (due < now) return "OVERDUE";
  if (due > now && due <= dueSoonAt) return "DUE_SOON";
  return "LATER";
}

/** Aggregate-only projection for the protected admin dashboard. Lower roles fail closed until durable consultant assignment exists. */
export function projectOperatingIntelligence(state: AppState, viewer: AppUser, asOf: string): OperatingIntelligenceProjection {
  if (viewer.role !== "ADMIN" && viewer.role !== "SUPER_ADMIN") throw new Error("Operating intelligence requires an admin account.");
  const now = Date.parse(asOf);
  if (!Number.isFinite(now)) throw new Error("asOf must be a valid ISO date-time.");
  const dueSoonHours = state.commercialPolicy.nextActionDueSoonHours;
  const dueSoonAt = now + dueSoonHours * 60 * 60 * 1000;
  const scopedClients = state.clients;
  const byStage = countRecord(canonicalPipelineStages);
  let active = 0, overdue = 0, dueSoon = 0, missingNextAction = 0, invalidNextActionDates = 0;
  const owners = new Map<string, OperatingIntelligenceProjection["ownerWorkload"][number]>();
  for (const client of scopedClients) {
    const pipeline = normalizeClientPipeline(client);
    byStage[pipeline.stage] += 1;
    if (terminalPipelineStages.has(pipeline.stage)) continue;
    active += 1;
    const bucket = dueBucket(pipeline.nextAction?.dueAt, now, dueSoonAt);
    if (bucket === "OVERDUE") overdue += 1;
    if (bucket === "DUE_SOON") dueSoon += 1;
    if (bucket === "MISSING") missingNextAction += 1;
    if (bucket === "INVALID") invalidNextActionDates += 1;
    const owner = pipeline.owner;
    const key = owner?.role ?? "UNASSIGNED";
    const aggregate = owners.get(key) ?? { ownerRole: key, active: 0, overdue: 0, dueSoon: 0, missingNextAction: 0 };
    aggregate.active += 1;
    if (bucket === "OVERDUE") aggregate.overdue += 1;
    if (bucket === "DUE_SOON") aggregate.dueSoon += 1;
    if (bucket === "MISSING") aggregate.missingNextAction += 1;
    owners.set(key, aggregate);
  }

  const activeCaseRecords = scopedClients.map((client) => getActiveCaseForClient(state, client.id)).filter((item) => item && item.status !== "VERDICT_RELEASED" && item.reportStatus !== "RELEASED");
  const activeCaseIds = new Set(activeCaseRecords.map((item) => item.id));
  const byService = countRecord(serviceTypes);
  const byCaseStage = countRecord(canonicalServiceStages);
  for (const caseRecord of activeCaseRecords) {
    const normalized = normalizeCaseService(caseRecord);
    byService[normalized.serviceType] += 1;
    byCaseStage[normalized.canonicalStage] += 1;
  }

  let openMilestones = 0, milestoneOverdue = 0, milestoneDueSoon = 0, blocked = 0, missingDueDate = 0, invalidMilestoneDueDates = 0;
  for (const milestone of state.deliveryMilestones.filter((item) => activeCaseIds.has(item.caseId) && !terminalMilestoneStatuses.has(item.status))) {
    openMilestones += 1;
    if (milestone.status === "BLOCKED" || milestone.blocker) blocked += 1;
    const bucket = dueBucket(milestone.dueDate, now, dueSoonAt);
    if (bucket === "OVERDUE") milestoneOverdue += 1;
    if (bucket === "DUE_SOON") milestoneDueSoon += 1;
    if (bucket === "MISSING") missingDueDate += 1;
    if (bucket === "INVALID") invalidMilestoneDueDates += 1;
  }

  const scopedCases = activeCaseRecords;
  return {
    schemaVersion: "operating-intelligence/v1", asOf: new Date(now).toISOString(),
    scope: { kind: "ALL_STAFF", viewerRole: viewer.role },
    funnel: { total: scopedClients.length, byStage },
    workload: { active, overdue, dueSoon, missingNextAction, dueSoonHours },
    ownerWorkload: [...owners.values()].sort((left, right) => left.ownerRole.localeCompare(right.ownerRole)),
    activeCases: { total: scopedCases.length, byService, byStage: byCaseStage },
    delivery: { open: openMilestones, overdue: milestoneOverdue, dueSoon: milestoneDueSoon, blocked, missingDueDate },
    gates: {
      reports: {
        previewBlocked: scopedCases.filter((item) => item.reportStatus === "PREVIEW_BLOCKED").length,
        paymentBlocked: scopedCases.filter((item) => item.reportStatus === "PAYMENT_BLOCKED").length,
        awaitingApproval: scopedCases.filter((item) => item.reportStatus === "READY_FOR_APPROVAL").length,
        approvedNotReleased: scopedCases.filter((item) => item.reportStatus === "APPROVED").length
      },
      payments: {
        awaitingAdvance: scopedCases.filter((item) => item.status === "AWAITING_ADVANCE").length,
        balanceNotApproved: scopedCases.filter((item) => !item.balanceApproved).length,
        fullPaymentNotApproved: scopedCases.filter((item) => !item.fullPaymentApproved).length
      }
    },
    unavailable: { averageStageDuration: "N/A", conversionRate: "N/A", reason: "Existing records do not provide complete canonical stage-entry timestamps or a defined analysis window." },
    dataQuality: { invalidNextActionDates, invalidMilestoneDueDates }
  };
}
