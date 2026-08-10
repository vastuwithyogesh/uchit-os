import type {
  AppUser,
  CommercialProposalRecord,
  FloorWorkspaceRecord,
  LeadQualificationRecord,
  PaymentRecord,
  PaymentStatus,
  ReportVersionRecord,
  ShaktiSnapshotRecord,
  TimelineEvent,
  UtilityRule,
  VastuCaseRecord
} from "./domain.ts";
import { validateShaktiInputs } from "./evaluation-provenance.ts";

export const MIN_ADVANCE_INR = 11000;
export const DEFAULT_PROPOSAL_AMOUNT_INR = 51000;
export const QUALIFICATION_CALL_TARGET_MINUTES = 2;

export function canCreateCase(proposal: CommercialProposalRecord, advance: PaymentRecord | undefined) {
  return proposal.status === "APPROVED"
    && Number.isSafeInteger(proposal.minAdvanceInr)
    && proposal.minAdvanceInr > 0
    && !!advance
    && advance.status === "APPROVED"
    && advance.amountInr >= proposal.minAdvanceInr
    && Boolean(advance.proofAssetId);
}

export function isPreviewWatermarked(report: ReportVersionRecord) {
  return report.isPreview && report.status === "PAYMENT_BLOCKED";
}

export function canReleaseOfficialVerdict(caseRecord: VastuCaseRecord, balancePayment: PaymentRecord | undefined) {
  return caseRecord.balanceApproved && caseRecord.fullPaymentApproved && !!balancePayment && balancePayment.status === "APPROVED" && Boolean(balancePayment.proofAssetId);
}

export function canApproveCommercialProposal(user: AppUser) {
  return user.role === "SUPER_ADMIN";
}

export function qualifyLead(lead: LeadQualificationRecord) {
  const scoreBand = lead.score >= 85 ? "hot" : lead.score >= 70 ? "warm" : "cool";
  const triggerDeliverable = lead.score >= 80 && !!lead.qualificationCallCompletedAt;
  const completedInMinutes = lead.qualificationCallCompletedAt && lead.qualificationCallDueAt
    ? Math.max(
        0,
        Math.round((new Date(lead.qualificationCallDueAt).getTime() - new Date(lead.qualificationCallCompletedAt).getTime()) / 60000)
      )
    : null;

  return {
    scoreBand,
    triggerDeliverable,
    completedInMinutes,
    callSlaMet: completedInMinutes !== null ? completedInMinutes <= QUALIFICATION_CALL_TARGET_MINUTES : false
  };
}

export function lockWorkspace(workspace: FloorWorkspaceRecord, reason = "Orientation locked and regeneration requested") {
  return {
    ...workspace,
    locked: true,
    status: "NEEDS_REGENERATION" as const,
    regenerationReason: reason
  };
}

export function generateUtilityEvaluation(rules: UtilityRule[], criteria: { zoneCode: string; targetVerdict?: UtilityRule["verdict"] }[]) {
  return criteria.map((criterion) => {
    const matchedRule = rules.find((rule) => rule.zoneCode === criterion.zoneCode);
    const verdict = matchedRule?.verdict ?? criterion.targetVerdict ?? "OK-OK";
    const confidence = matchedRule?.confidence ?? (verdict === "GOOD" ? 78 : verdict === "BAD" ? 82 : 70);

    return {
      zoneCode: criterion.zoneCode,
      description: matchedRule?.description ?? "Generated from the master rule table.",
      verdict,
      confidence
    };
  });
}

export const elementGroups = ["Air", "Fire", "Water", "Earth", "Space"] as const;
export type ElementGroup = (typeof elementGroups)[number];

export function rankShakti(inputs: number[]) {
  inputs = validateShaktiInputs(inputs);

  const grouped: Record<ElementGroup, number[]> = {
    Air: [inputs[0], inputs[5], inputs[10]],
    Fire: [inputs[1], inputs[6], inputs[11]],
    Water: [inputs[2], inputs[7], inputs[12]],
    Earth: [inputs[3], inputs[8], inputs[13]],
    Space: [inputs[4], inputs[9], inputs[14], inputs[15]]
  };

  const averages = Object.fromEntries(
    elementGroups.map((group) => {
      const values = grouped[group];
      const average = Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
      return [group, average];
    })
  ) as Record<ElementGroup, number>;

  const ranked = elementGroups
    .map((element) => ({ element, score: averages[element] }))
    .sort((a, b) => {
      const delta = b.score - a.score;
      if (Math.abs(delta) <= 2) {
        return elementGroups.indexOf(a.element) - elementGroups.indexOf(b.element);
      }
      return delta;
    });

  const tieBreakUsed = ranked.some((entry, index) => index > 0 && Math.abs(entry.score - ranked[index - 1].score) <= 2);

  return {
    averages,
    ranked,
    tieBreakUsed
  };
}

export function buildPermanentTimeline(events: TimelineEvent[], clientId?: string) {
  return [...events]
    .filter((event) => !clientId || event.clientId === clientId)
    .sort((a, b) => new Date(b.happenedAt).getTime() - new Date(a.happenedAt).getTime());
}

export function approvalSummary(caseRecord: VastuCaseRecord, proposal: CommercialProposalRecord, payments: PaymentRecord[]) {
  const advancePayment = payments.find((payment) => payment.proposalId === proposal.id && payment.type === "ADVANCE");
  const balancePayment = payments.find((payment) => payment.caseId === caseRecord.id && payment.type === "BALANCE");

  return {
    commercialApproved: proposal.status === "APPROVED",
    advanceApproved: !!advancePayment
      && advancePayment.status === "APPROVED"
      && advancePayment.amountInr >= proposal.minAdvanceInr
      && Boolean(advancePayment.proofAssetId),
    balanceApproved: !!balancePayment && balancePayment.status === "APPROVED" && Boolean(balancePayment.proofAssetId),
    verdictUnlocked: caseRecord.fullPaymentApproved
      && caseRecord.balanceApproved
      && Boolean(balancePayment?.proofAssetId)
  };
}

export function timelineHeadlineForLead(lead: LeadQualificationRecord) {
  const qualification = qualifyLead(lead);
  return qualification.callSlaMet ? "Call handled inside the 2-minute window" : "Call needs attention";
}

export function formatMoney(amountInr: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amountInr);
}

export function describeApprovalPath(user: AppUser) {
  if (user.role === "SUPER_ADMIN") {
    return "Can approve the commercial proposal but not release the verdict alone.";
  }
  if (user.role === "ADMIN") {
    return "Can approve reports and release verdicts after balance clearance.";
  }
  if (user.role === "CONSULTANT") {
    return "Can prepare reports and approve the draft review state.";
  }
  if (user.role === "SETTER") {
    return "Can run qualification, trigger deliverables, and keep the pipeline moving.";
  }
  return "Can see their own case updates and timeline.";
}
