import type { AppState } from "@/lib/store";

const ownedCollections = [
  "clients", "pipelineTransitions", "clientIntakeProfiles", "leadQualifications", "commercialProposals",
  "reviewCallBookings", "payments", "advanceVerifications", "vastuCases", "floorWorkspaces", "reportVersions",
  "rectificationRequests", "assessmentObservations", "recommendations", "implementationTasks", "caseDocuments",
  "deliveryMilestones", "evaluationSnapshots", "shaktiSnapshots", "timelineEvents", "optInLeads"
  ,"projects", "planVersions", "spatialEvidenceVersions", "orientationVersions", "openingMappings", "spaceMappings", "dependencyInvalidations", "regenerationResolutions", "stageAFloorReviews", "stageAFloorApprovalCheckpoints", "remedialWorkflowReservations", "methodologyVersions", "methodologyRules", "methodologyGoldenFixtures",
  "aouMethodologyVersions", "aouReferenceRows", "leadProfileVersions", "mediaAssets", "mediaAssetVersions",
  "secureAccessGrants", "communicationPreparations", "qualificationFormDefinitions", "qualificationInvitations",
  "qualificationResponseVersions", "prospectiveProjects", "founderReviewBookings", "zoomMeetingBindings", "founderReminderTasks"
  ,"founderCommercialPolicies", "founderCommercialLegalPolicies", "founderProposalTemplates", "founderProposalVersions",
  "founderProposalApprovals", "founderProposalArtifacts", "founderProposalGrants", "founderProposalResponses",
  "founderCommercialPaymentConfirmations", "founderBalanceDeadlines", "founderCommercialInvoices", "founderCommercialAuditEvents",
  "founderStatutoryPolicies", "founderBillingProfileVersions", "founderStatutorySequenceReservations", "founderStatutoryDocuments"
] as const satisfies readonly (keyof AppState)[];

type Owned = { id?: string; organisationId?: string; createdByActorUserId?: string; updatedByActorUserId?: string; recordVersion?: number };

/** Additive legacy adoption plus ownership stamping for every new protected row. */
export function stampOrganisationOwnership(state: AppState, previous: AppState, organisationId: string, actorUserId: string) {
  for (const collection of ownedCollections) {
    const beforeRows = previous[collection];
    const rows = state[collection];
    if (!Array.isArray(rows) || !Array.isArray(beforeRows)) continue;
    const beforeById = new Map((beforeRows as Owned[]).filter((item) => item.id).map((item) => [item.id!, item]));
    for (const item of rows as Owned[]) {
      if (item.organisationId && item.organisationId !== organisationId) continue;
      const before = item.id ? beforeById.get(item.id) : undefined;
      if (!before) {
        item.organisationId ??= organisationId;
        item.updatedByActorUserId = actorUserId;
        item.createdByActorUserId ??= actorUserId;
        item.recordVersion ??= 1;
        continue;
      }

      const businessShape = (value: Owned) => {
        const { organisationId: _organisationId, createdByActorUserId: _createdBy, updatedByActorUserId: _updatedBy,
          recordVersion: _recordVersion, ...business } = value;
        return business;
      };
      if (JSON.stringify(businessShape(item)) !== JSON.stringify(businessShape(before))) {
        item.organisationId ??= organisationId;
        item.createdByActorUserId ??= before.createdByActorUserId;
        item.updatedByActorUserId = actorUserId;
        if ((item.recordVersion ?? 0) === (before.recordVersion ?? 0)) {
          item.recordVersion = (before.recordVersion ?? 0) + 1;
        }
      }
    }
  }
}

function ownerForId(state: AppState, id: string) {
  for (const collection of ownedCollections) {
    const rows = state[collection];
    if (!Array.isArray(rows)) continue;
    const found = (rows as Owned[]).find((item) => item.id === id);
    if (found) return found.organisationId;
  }
  return undefined;
}

/** Cross-organisation identifiers deliberately resolve as not found. */
export function assertOrganisationRequestScope(state: AppState, body: Record<string, unknown>, organisationId: string) {
  if ("organisationId" in body || "organizationId" in body || "tenantId" in body) {
    const error = new Error("Organisation scope is resolved by the server and cannot be supplied by the client.") as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }
  for (const key of ["clientId", "proposalId", "proposalVersionId", "caseId", "projectId", "prospectiveProjectId", "floorId", "reportId", "invalidationId", "recordId", "requestId", "bookingId", "leadId", "assetId", "assetVersionId", "formDefinitionId", "invitationId", "responseVersionId", "preparationId", "grantId", "templateVersionId", "policyId", "paymentConfirmationId", "invoiceId", "deadlineId"]) {
    const id = body[key];
    if (typeof id !== "string" || !id) continue;
    const owner = ownerForId(state, id);
    if (owner && owner !== organisationId) {
      const error = new Error("Record not found.") as Error & { statusCode?: number };
      error.statusCode = 404;
      throw error;
    }
  }
}
