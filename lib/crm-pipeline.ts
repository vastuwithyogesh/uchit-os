import type { CanonicalPipelineStage, ClientRecord, LeadStage } from "./domain.ts";

const normalPipelineTransitions: Readonly<Record<CanonicalPipelineStage, readonly CanonicalPipelineStage[]>> = {
  NEW: ["CONTACTED", "VSL_SENT", "DISQUALIFIED"],
  CONTACTED: ["VSL_SENT", "PAID_REVIEW_PENDING", "PRE_CASE_FOLLOW_UP", "DISQUALIFIED"],
  VSL_SENT: ["VSL_WATCHED", "CONTACTED", "DISQUALIFIED"],
  VSL_WATCHED: ["PAID_REVIEW_PENDING", "CONTACTED", "DISQUALIFIED"],
  PAID_REVIEW_PENDING: ["PAID_REVIEW_BOOKED", "PRE_CASE_FOLLOW_UP", "DISQUALIFIED"],
  PAID_REVIEW_BOOKED: ["FORM_PENDING", "PRE_CASE_FOLLOW_UP", "DISQUALIFIED"],
  FORM_PENDING: ["REVIEW_COMPLETED", "PRE_CASE_FOLLOW_UP", "DISQUALIFIED"],
  REVIEW_COMPLETED: ["QUALIFIED", "PRE_CASE_FOLLOW_UP", "DISQUALIFIED"],
  QUALIFIED: ["PROPOSAL_SCOPE", "PRE_CASE_FOLLOW_UP", "DISQUALIFIED"],
  PROPOSAL_SCOPE: ["WON", "PRE_CASE_FOLLOW_UP", "DISQUALIFIED"],
  WON: ["ONBOARDING"],
  ONBOARDING: ["IN_DELIVERY"],
  IN_DELIVERY: ["FOLLOW_UP"],
  FOLLOW_UP: ["CLOSED_REFERRAL"],
  PRE_CASE_FOLLOW_UP: ["CONTACTED", "PAID_REVIEW_PENDING", "DISQUALIFIED"],
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
