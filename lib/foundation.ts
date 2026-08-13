import type { AppState } from "@/lib/store";

export const organisationStatuses = ["ACTIVE", "SUSPENDED", "ARCHIVED"] as const;
export type OrganisationStatus = (typeof organisationStatuses)[number];
export const membershipStatuses = ["ACTIVE", "REVOKED"] as const;
export type MembershipStatus = (typeof membershipStatuses)[number];
export const policyStatuses = ["DRAFT", "ACTIVE", "RETIRED"] as const;
export type FoundationPolicyStatus = (typeof policyStatuses)[number];
export const policyEditions = ["FOUNDER", "TEAM"] as const;
export type FoundationEdition = (typeof policyEditions)[number];
export const organisationCapabilities = [
  "organisation_owner", "USER_MANAGEMENT", "CLIENT_CRM", "CASE_SETUP", "EVALUATION",
  "FILES", "DELIVERY", "PAYMENT_VERIFICATION", "REPORT_APPROVAL", "REPORT_RELEASE",
  "POLICY_MANAGEMENT", "AUDIT_ADMINISTRATION", "OWNERSHIP_TRANSFER"
] as const;
export type OrganisationCapability = (typeof organisationCapabilities)[number];
export const highRiskCapabilities = [
  "PAYMENT_VERIFICATION", "REPORT_APPROVAL", "REPORT_RELEASE", "POLICY_MANAGEMENT",
  "AUDIT_ADMINISTRATION", "OWNERSHIP_TRANSFER"
] as const satisfies readonly OrganisationCapability[];
export const userAccessRequestStates = [
  "DRAFT", "PENDING_SUPER_ADMIN_APPROVAL", "APPROVED", "ACTIVE", "REJECTED", "REVOKED", "CANCELLED"
] as const;
export type UserAccessRequestState = (typeof userAccessRequestStates)[number];

export type OrganisationRecord = {
  id: string;
  name: string;
  status: OrganisationStatus;
  founderUserId: string;
  activeWorkflowPolicyVersion: number;
  activeApprovalPolicyVersion: number;
  createdAt: string;
  updatedAt: string;
  recordVersion: number;
};

export type OrganisationMembership = {
  id: string;
  organisationId: string;
  userId: string;
  role: "SUPER_ADMIN" | "ADMIN" | "CONSULTANT" | "SETTER" | "SPECIALIST";
  capability: string;
  status: MembershipStatus;
  createdAt: string;
  revokedAt?: string;
};

export type UserAccessRequestRecord = {
  id: string;
  organisationId: string;
  targetUserId: string;
  targetEmail: string;
  requestedByUserId: string;
  requestedByRole: OrganisationMembership["role"];
  proposedRole: Exclude<OrganisationMembership["role"], "SUPER_ADMIN">;
  proposedCapabilities: OrganisationCapability[];
  finalRole?: Exclude<OrganisationMembership["role"], "SUPER_ADMIN">;
  finalCapabilities?: OrganisationCapability[];
  state: UserAccessRequestState;
  reason: string;
  requestId: string;
  idempotencyKey: string;
  reviewedByUserId?: string;
  reviewedAt?: string;
  activatedMembershipId?: string;
  createdAt: string;
  updatedAt: string;
  recordVersion: number;
};

export type WorkflowPolicyRecord = {
  id: string;
  organisationId: string;
  version: number;
  edition: FoundationEdition;
  status: FoundationPolicyStatus;
  policyJson: Record<string, unknown>;
  approvedByActorId: string;
  approvedAt: string;
  reason: string;
  contentHash: string;
};

export type ApprovalPolicyRecord = {
  id: string;
  organisationId: string;
  version: number;
  steps: string[];
  releaseGates: string[];
  creatorMayApprove: boolean;
  status: FoundationPolicyStatus;
  approvedByActorId: string;
  approvedAt: string;
  reason: string;
  contentHash: string;
};

export type ImmutableAuditEvent = {
  id: string;
  organisationId: string;
  actorUserId: string;
  actorDisplayName: string;
  action: string;
  entityType: string;
  entityId: string;
  caseId?: string;
  projectId?: string;
  floorId?: string;
  beforeHash?: string;
  afterHash?: string;
  reason: string;
  requestId: string;
  idempotencyKey: string;
  occurredAt: string;
  previousAuditHash?: string;
  eventHash: string;
};

export type FounderFoundationContext = {
  organisation: OrganisationRecord;
  membership: OrganisationMembership;
  workflowPolicy: WorkflowPolicyRecord;
  approvalPolicy: ApprovalPolicyRecord;
  isFounderEdition: boolean;
};

export const DEFAULT_FOUNDER_WORKFLOW_POLICY = {
  edition: "FOUNDER" as const,
  policyJson: {
    schemaVersion: "uchit-workflow-policy/v1",
    ownerCapability: "organisation_owner",
    teamOperationsEnabled: false,
    clientDeliveryEnabled: false,
    approvalFlow: ["DRAFT", "FOUNDER_REVIEWED", "FOUNDER_APPROVED", "RELEASED"]
  }
};

export const DEFAULT_FOUNDER_APPROVAL_POLICY = {
  steps: ["FOUNDER_REVIEWED", "FOUNDER_APPROVED"],
  releaseGates: [
    "MANDATORY_EVIDENCE_COMPLETE",
    "EVALUATION_VALID",
    "FULL_BALANCE_CONFIRMED",
    "NO_RELEASE_BLOCKERS"
  ],
  creatorMayApprove: true
};

const organisationCollections = [
  "clients", "pipelineTransitions", "clientIntakeProfiles", "leadQualifications",
  "commercialProposals", "reviewCallBookings", "payments", "advanceVerifications",
  "vastuCases", "floorWorkspaces", "reportVersions", "rectificationRequests",
  "assessmentObservations", "recommendations", "implementationTasks", "caseDocuments",
  "deliveryMilestones", "evaluationSnapshots", "utilityVerdicts", "shaktiSnapshots", "timelineEvents", "optInLeads"
  ,"projects", "planVersions", "spatialEvidenceVersions", "orientationVersions", "openingMappings", "spaceMappings", "dependencyInvalidations", "regenerationResolutions", "stageAFloorReviews", "stageAFloorApprovalCheckpoints", "remedialWorkflowReservations", "stageBRemediations", "revisedLayoutCandidates", "remediationBaseLayoutVersions", "remedyRepositoryRecords", "remedyEligibilityResolutions", "reportPlacementPages", "physicalPlacements", "placementImplementationRows", "masterAppendixRows", "stageBIntegrityRuns", "methodologyVersions", "methodologyRules", "methodologyGoldenFixtures", "aouMethodologyVersions", "aouReferenceRows",
  "leadProfileVersions", "mediaAssets", "mediaAssetVersions", "secureAccessGrants", "communicationPreparations",
  "qualificationFormDefinitions", "qualificationInvitations", "qualificationResponseVersions", "prospectiveProjects",
  "founderReviewBookings", "zoomMeetingBindings", "founderReminderTasks",
  "founderCommercialPolicies", "founderCommercialLegalPolicies", "founderProposalTemplates", "founderProposalVersions",
  "founderProposalApprovals", "founderProposalArtifacts", "founderProposalGrants", "founderProposalResponses",
  "founderCommercialPaymentConfirmations", "founderBalanceDeadlines", "founderCommercialInvoices", "founderCommercialPolicyEvents", "founderCommercialAuditEvents",
  "founderStatutoryPolicies", "founderBillingProfileVersions", "founderStatutorySequenceReservations", "founderStatutoryDocuments"
] as const satisfies readonly (keyof AppState)[];

/**
 * Founder Edition projects only the active organisation. Rows created before
 * organisation ownership existed are adopted into the sole founder
 * organisation in the response without mutating stored or released records.
 */
export function projectOrganisationState(state: AppState, organisationId: string): AppState {
  const projected = structuredClone(state) as AppState;
  for (const collection of organisationCollections) {
    const rows = state[collection];
    if (!Array.isArray(rows)) continue;
    (projected as unknown as Record<string, unknown[]>)[collection] = rows
      .filter((item) => {
        const owner = (item as { organisationId?: string }).organisationId;
        return owner === undefined || owner === organisationId;
      })
      .map((item) => ({ ...item, organisationId: (item as { organisationId?: string }).organisationId ?? organisationId }));
  }
  return projected;
}

export function isClientDeliveryEnabled(context: FounderFoundationContext) {
  return context.workflowPolicy.policyJson.clientDeliveryEnabled === true;
}

export function decodeMembershipCapabilities(value: string): OrganisationCapability[] {
  if (value === "organisation_owner") return ["organisation_owner"];
  let candidates: unknown = value.split(",").map((item) => item.trim()).filter(Boolean);
  try { candidates = JSON.parse(value); } catch { /* legacy comma/single capability */ }
  if (!Array.isArray(candidates)) return [];
  return [...new Set(candidates.filter((item): item is OrganisationCapability =>
    typeof item === "string" && (organisationCapabilities as readonly string[]).includes(item)
  ))].sort();
}

export function hasOrganisationCapability(membership: OrganisationMembership, capability: OrganisationCapability) {
  return membership.role === "SUPER_ADMIN" && membership.capability === "organisation_owner"
    ? true
    : decodeMembershipCapabilities(membership.capability).includes(capability);
}
