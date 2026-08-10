import type { CanonicalPipelineStage, ClientRecord, LeadStage } from "./domain.ts";

const normalPipelineTransitions: Readonly<Record<CanonicalPipelineStage, readonly CanonicalPipelineStage[]>> = {
  NEW: ["CONTACTED", "DISQUALIFIED"],
  CONTACTED: ["VSL_SENT", "DISQUALIFIED"],
  VSL_SENT: ["VSL_WATCHED", "DISQUALIFIED"],
  VSL_WATCHED: ["PAID_REVIEW_PENDING", "DISQUALIFIED"],
  PAID_REVIEW_PENDING: ["PAID_REVIEW_BOOKED", "DISQUALIFIED"],
  PAID_REVIEW_BOOKED: ["FORM_PENDING", "DISQUALIFIED"],
  FORM_PENDING: ["REVIEW_COMPLETED", "DISQUALIFIED"],
  REVIEW_COMPLETED: ["QUALIFIED", "DISQUALIFIED"],
  QUALIFIED: ["PROPOSAL_SCOPE", "DISQUALIFIED"],
  PROPOSAL_SCOPE: ["WON", "DISQUALIFIED"],
  WON: ["ONBOARDING"],
  ONBOARDING: ["IN_DELIVERY"],
  IN_DELIVERY: ["FOLLOW_UP"],
  FOLLOW_UP: ["CLOSED_REFERRAL"],
  CLOSED_REFERRAL: [],
  DISQUALIFIED: []
};

export function getAllowedPipelineTransitions(stage: CanonicalPipelineStage): CanonicalPipelineStage[] {
  return [...normalPipelineTransitions[stage]];
}

export function legacyPipelineStage(stage: LeadStage): CanonicalPipelineStage {
  if (stage === "DISQUALIFIED") return "DISQUALIFIED";
  if (stage === "CONVERTED") return "WON";
  if (stage === "QUALIFIED") return "QUALIFIED";
  if (stage === "QUALIFYING") return "CONTACTED";
  return "NEW";
}

export function normalizeClientPipeline(client: ClientRecord) {
  return { stage: client.pipelineStage ?? legacyPipelineStage(client.stage), owner: client.pipelineOwner, nextAction: client.nextAction, recordVersion: client.recordVersion ?? 0 };
}
