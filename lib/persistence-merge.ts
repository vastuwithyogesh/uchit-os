import type { AppState } from "@/lib/store";

const collectionKeys = [
  "clients",
  "pipelineTransitions",
  "commercialPolicyHistory",
  "clientIntakeProfiles",
  "leadQualifications",
  "commercialProposals",
  "reviewCallBookings",
  "payments",
  "advanceVerifications",
  "vastuCases",
  "projects",
  "floorWorkspaces",
  "siteAnalyses",
  "siteAnalysisApprovals",
  "postSiteFindings",
  "postSiteFindingsApprovals",
  "planVersions",
  "spatialEvidenceVersions",
  "orientationVersions",
  "openingMappings",
  "spaceMappings",
  "dependencyInvalidations",
  "regenerationResolutions",
  "stageAFloorReviews",
  "stageAFloorApprovalCheckpoints",
  "remedialWorkflowReservations",
  "methodologyVersions",
  "methodologyRules",
  "methodologyGoldenFixtures",
  "aouMethodologyVersions",
  "aouReferenceRows",
  "reportVersions",
  "rectificationRequests",
  "assessmentObservations",
  "recommendations",
  "implementationTasks",
  "caseDocuments",
  "manualSheetApprovals",
  "deliveryMilestones",
  "evaluationSnapshots",
  "utilityVerdicts",
  "mapping32D",
  "mapping16D",
  "utilityRules",
  "shaktiSnapshots",
  "timelineEvents",
  "optInLeads",
  "whatsappTemplates",
  "whatsappLogs",
  "leadProfileVersions",
  "mediaAssets",
  "mediaAssetVersions",
  "secureAccessGrants",
  "communicationPreparations",
  "qualificationFormDefinitions",
  "qualificationInvitations",
  "qualificationResponseVersions",
  "prospectiveProjects",
  "founderReviewBookings",
  "zoomMeetingBindings",
  "founderReminderTasks"
  ,"founderCommercialPolicies", "founderCommercialLegalPolicies", "founderProposalTemplates", "founderProposalVersions",
  "founderProposalApprovals", "founderProposalArtifacts", "founderProposalGrants", "founderProposalResponses",
  "founderCommercialPaymentConfirmations", "founderBalanceDeadlines", "founderCommercialInvoices", "founderCommercialAuditEvents"
] as const satisfies readonly (keyof AppState)[];

/** Missing legacy fields inherit seeds; explicitly persisted empty arrays stay empty. */
export function mergeAppState(base: AppState, snapshot: AppState): AppState {
  const merged = { ...base, ...snapshot } as AppState;
  const partialSnapshot = snapshot as Partial<AppState>;

  for (const key of collectionKeys) {
    if (!Array.isArray(partialSnapshot[key])) {
      (merged as unknown as Record<string, unknown>)[key] = base[key];
    }
  }
  if (!partialSnapshot.commercialPolicy || typeof partialSnapshot.commercialPolicy !== "object") merged.commercialPolicy = base.commercialPolicy;
  return merged;
}
