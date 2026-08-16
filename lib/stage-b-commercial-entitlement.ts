import type { FounderProposalVersionRecord } from "./domain.ts";
import type { AppState } from "./store.ts";

export type StageBCommercialEntitlement =
  | { eligible: true; kind: "COMPLIMENTARY_ACCEPTED_ZERO_VALUE" | "PAYMENT_REQUIRED_AND_SATISFIED"; proposalVersionId?: string }
  | { eligible: false; kind: "NOT_COMMERCIALLY_CLEARED" | "INVALID_COMMERCIAL_CONTRACT"; reason: string };

function invalid(reason: string): StageBCommercialEntitlement {
  return { eligible: false, kind: "INVALID_COMMERCIAL_CONTRACT", reason };
}

/**
 * Resolves the commercial entitlement for the architecture-specific Stage-B
 * reservation. The case's exact accepted proposal version is authoritative;
 * client-provided proposal identifiers are never consulted here.
 */
export function resolveCommercialEntitlementForStageB(input: {
  state: AppState;
  caseId: string;
  projectId: string;
  requireFounderContract?: boolean;
}): StageBCommercialEntitlement {
  const caseRecord = input.state.vastuCases.find((item) => item.id === input.caseId);
  if (!caseRecord || caseRecord.projectId !== input.projectId) return invalid("The case/project scope is not bound.");

  const proposal = input.state.founderProposalVersions.find((item) =>
    item.id === caseRecord.proposalId &&
    item.organisationId === caseRecord.organisationId &&
    item.clientId === caseRecord.clientId
  ) as FounderProposalVersionRecord | undefined;

  // Legacy cases predate Founder proposal versions. Their existing payment
  // booleans remain the compatibility contract for legacy Stage-B only.
  if (!proposal) {
    if (input.requireFounderContract) return invalid("The exact accepted Founder proposal version is unavailable.");
    return caseRecord.balanceApproved && caseRecord.fullPaymentApproved
      ? { eligible: true, kind: "PAYMENT_REQUIRED_AND_SATISFIED" }
      : { eligible: false, kind: "NOT_COMMERCIALLY_CLEARED", reason: "Required payment approvals are absent." };
  }

  if (proposal.status !== "ACCEPTED") return invalid("The case is not bound to an accepted proposal version.");
  const project = input.state.prospectiveProjects.find((item) =>
    item.id === proposal.prospectiveProjectId &&
    item.organisationId === proposal.organisationId &&
    item.clientId === proposal.clientId &&
    item.caseId === caseRecord.id
  );
  if (!project) return invalid("The accepted proposal's prospective project is not bound to this case.");
  const terms = proposal.content.commercial;
  if (terms.engagementClassification === "INTERNAL_COMPLIMENTARY") {
    const exactZeroValue = terms.professionalFeePaise === 0 && terms.gstAppliedBasisPoints === 0 &&
      terms.gstAmountPaise === 0 && terms.totalPayablePaise === 0 && terms.agreedAdvancePaise === 0 &&
      terms.remainingBalancePaise === 0 && terms.advanceExceptionApproved && Boolean(terms.classificationReason?.trim());
    return exactZeroValue
      ? { eligible: true, kind: "COMPLIMENTARY_ACCEPTED_ZERO_VALUE", proposalVersionId: proposal.id }
      : invalid("The complimentary proposal is not an exact approved zero-value contract.");
  }
  return caseRecord.balanceApproved && caseRecord.fullPaymentApproved
    ? { eligible: true, kind: "PAYMENT_REQUIRED_AND_SATISFIED", proposalVersionId: proposal.id }
    : { eligible: false, kind: "NOT_COMMERCIALLY_CLEARED", reason: "Required payment approvals are absent." };
}
