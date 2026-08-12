import {
  clients as seedClients,
  commercialProposals as seedCommercialProposals,
  evaluationSnapshots as seedEvaluationSnapshots,
  floorWorkspaces as seedFloorWorkspaces,
  leadQualifications as seedLeadQualifications,
  mapping16D as seedMapping16D,
  mapping32D as seedMapping32D,
  payments as seedPayments,
  reportVersions as seedReportVersions,
  shaktiSnapshots as seedShaktiSnapshots,
  timelineEvents as seedTimelineEvents,
  utilityRules as seedUtilityRules,
  vastuCases as seedVastuCases,
  whatsappLogs as seedWhatsappLogs,
  whatsappTemplates as seedWhatsappTemplates
} from "./seed.ts";
import type {
  CommercialProposalRecord,
  AdvanceVerificationRecord,
  EvaluationSnapshotRecord,
  UtilityGraphVerdictRecord,
  FloorWorkspaceRecord,
  SiteAnalysisRecord,
  SiteAnalysisApprovalRecord,
  PostSiteFindingsRecord,
  PostSiteFindingsApprovalRecord,
  LeadQualificationRecord,
  PaymentRecord,
  ReviewCallBookingRecord,
  ReportVersionRecord,
  RectificationRequestRecord,
  AssessmentObservation,
  Recommendation,
  ImplementationTask,
  CaseDocumentRecord,
  ManualSheetApprovalRecord,
  DeliveryMilestone,
  ClientIntakeProfile,
  ShaktiSnapshotRecord,
  TimelineEvent,
  UtilityRule,
  InboundLeadRecord,
  VastuCaseRecord,
  VastuProjectRecord,
  PlanVersionRecord,
  SpatialEvidenceVersionRecord,
  OrientationVersionRecord,
  OpeningMappingRecord,
  SpaceMappingRecord,
  DependencyInvalidationRecord,
  RegenerationResolutionRecord,
  StageAFloorReviewSnapshotRecord,
  StageAFloorApprovalCheckpointRecord,
  RemedialWorkflowReservation,
  MethodologyVersionRecord,
  MethodologyRuleRecord,
  MethodologyGoldenFixtureRecord,
  AouMethodologyVersionRecord,
  AouReferenceRowRecord,
  WhatsAppTemplateLogRecord,
  WhatsAppTemplateRecord
  ,LeadProfileVersionRecord, MediaAssetRecord, MediaAssetVersionRecord, SecureAccessGrantRecord, CommunicationPreparationRecord,
  QualificationFormDefinitionRecord, QualificationInvitationRecord, QualificationResponseVersionRecord, ProspectiveProjectRecord,
  FounderReviewBookingRecord, ZoomMeetingBindingRecord, FounderReminderTaskRecord
  ,FounderCommercialPolicyVersionRecord, FounderCommercialLegalPolicyRecord, FounderProposalTemplateVersionRecord,
  FounderProposalVersionRecord, FounderProposalApprovalRecord, FounderProposalArtifactRecord, FounderProposalGrantRecord,
  FounderProposalResponseRecord, FounderCommercialPaymentConfirmationRecord, FounderBalanceDeadlineRecord,
  FounderCommercialInvoiceRecord, FounderCommercialPolicyEventRecord, FounderCommercialAuditEventRecord, FounderStatutoryPolicyVersionRecord,
  FounderBillingProfileVersionRecord, FounderStatutorySequenceReservationRecord, FounderStatutoryDocumentRecord
} from "./domain.ts";
import { LEGACY_COMMERCIAL_POLICY_DEFAULTS } from "./commercial-policy.ts";

export interface AppState {
  /** Read-only response metadata used for optimistic concurrency; not a domain collection. */
  persistenceRevision?: number | null;
  clients: typeof seedClients;
  pipelineTransitions: import("./domain.ts").PipelineTransitionRecord[];
  commercialPolicy: import("./domain.ts").CommercialPolicy;
  commercialPolicyHistory: import("./domain.ts").CommercialPolicy[];
  clientIntakeProfiles: ClientIntakeProfile[];
  leadQualifications: LeadQualificationRecord[];
  commercialProposals: CommercialProposalRecord[];
  reviewCallBookings: ReviewCallBookingRecord[];
  payments: PaymentRecord[];
  advanceVerifications: AdvanceVerificationRecord[];
  vastuCases: VastuCaseRecord[];
  projects: VastuProjectRecord[];
  floorWorkspaces: FloorWorkspaceRecord[];
  siteAnalyses: SiteAnalysisRecord[];
  siteAnalysisApprovals: SiteAnalysisApprovalRecord[];
  postSiteFindings: PostSiteFindingsRecord[];
  postSiteFindingsApprovals: PostSiteFindingsApprovalRecord[];
  planVersions: PlanVersionRecord[];
  spatialEvidenceVersions: SpatialEvidenceVersionRecord[];
  orientationVersions: OrientationVersionRecord[];
  openingMappings: OpeningMappingRecord[];
  spaceMappings: SpaceMappingRecord[];
  dependencyInvalidations: DependencyInvalidationRecord[];
  regenerationResolutions: RegenerationResolutionRecord[];
  stageAFloorReviews: StageAFloorReviewSnapshotRecord[];
  stageAFloorApprovalCheckpoints: StageAFloorApprovalCheckpointRecord[];
  remedialWorkflowReservations: RemedialWorkflowReservation[];
  methodologyVersions: MethodologyVersionRecord[];
  methodologyRules: MethodologyRuleRecord[];
  methodologyGoldenFixtures: MethodologyGoldenFixtureRecord[];
  aouMethodologyVersions: AouMethodologyVersionRecord[];
  aouReferenceRows: AouReferenceRowRecord[];
  reportVersions: ReportVersionRecord[];
  rectificationRequests: RectificationRequestRecord[];
  assessmentObservations: AssessmentObservation[];
  recommendations: Recommendation[];
  implementationTasks: ImplementationTask[];
  caseDocuments: CaseDocumentRecord[];
  manualSheetApprovals: ManualSheetApprovalRecord[];
  deliveryMilestones: DeliveryMilestone[];
  evaluationSnapshots: EvaluationSnapshotRecord[];
  utilityVerdicts: UtilityGraphVerdictRecord[];
  mapping32D: typeof seedMapping32D;
  mapping16D: typeof seedMapping16D;
  utilityRules: UtilityRule[];
  shaktiSnapshots: ShaktiSnapshotRecord[];
  timelineEvents: TimelineEvent[];
  optInLeads: InboundLeadRecord[];
  whatsappTemplates: WhatsAppTemplateRecord[];
  whatsappLogs: WhatsAppTemplateLogRecord[];
  leadProfileVersions: LeadProfileVersionRecord[];
  mediaAssets: MediaAssetRecord[];
  mediaAssetVersions: MediaAssetVersionRecord[];
  secureAccessGrants: SecureAccessGrantRecord[];
  communicationPreparations: CommunicationPreparationRecord[];
  qualificationFormDefinitions: QualificationFormDefinitionRecord[];
  qualificationInvitations: QualificationInvitationRecord[];
  qualificationResponseVersions: QualificationResponseVersionRecord[];
  prospectiveProjects: ProspectiveProjectRecord[];
  founderReviewBookings: FounderReviewBookingRecord[];
  zoomMeetingBindings: ZoomMeetingBindingRecord[];
  founderReminderTasks: FounderReminderTaskRecord[];
  founderCommercialPolicies: FounderCommercialPolicyVersionRecord[];
  founderCommercialLegalPolicies: FounderCommercialLegalPolicyRecord[];
  founderProposalTemplates: FounderProposalTemplateVersionRecord[];
  founderProposalVersions: FounderProposalVersionRecord[];
  founderProposalApprovals: FounderProposalApprovalRecord[];
  founderProposalArtifacts: FounderProposalArtifactRecord[];
  founderProposalGrants: FounderProposalGrantRecord[];
  founderProposalResponses: FounderProposalResponseRecord[];
  founderCommercialPaymentConfirmations: FounderCommercialPaymentConfirmationRecord[];
  founderBalanceDeadlines: FounderBalanceDeadlineRecord[];
  founderCommercialInvoices: FounderCommercialInvoiceRecord[];
  founderCommercialPolicyEvents: FounderCommercialPolicyEventRecord[];
  founderCommercialAuditEvents: FounderCommercialAuditEventRecord[];
  founderStatutoryPolicies: FounderStatutoryPolicyVersionRecord[];
  founderBillingProfileVersions: FounderBillingProfileVersionRecord[];
  founderStatutorySequenceReservations: FounderStatutorySequenceReservationRecord[];
  founderStatutoryDocuments: FounderStatutoryDocumentRecord[];
}

export const createEmptyAppState = (): AppState => ({
  clients: [],
  pipelineTransitions: [],
  commercialPolicy: structuredClone(LEGACY_COMMERCIAL_POLICY_DEFAULTS),
  commercialPolicyHistory: [structuredClone(LEGACY_COMMERCIAL_POLICY_DEFAULTS)],
  clientIntakeProfiles: [],
  leadQualifications: [],
  commercialProposals: [],
  reviewCallBookings: [],
  payments: [],
  advanceVerifications: [],
  vastuCases: [],
  projects: [],
  floorWorkspaces: [],
  siteAnalyses: [],
  siteAnalysisApprovals: [],
  postSiteFindings: [],
  postSiteFindingsApprovals: [],
  planVersions: [],
  spatialEvidenceVersions: [],
  orientationVersions: [],
  openingMappings: [],
  spaceMappings: [],
  dependencyInvalidations: [],
  regenerationResolutions: [],
  stageAFloorReviews: [],
  stageAFloorApprovalCheckpoints: [],
  remedialWorkflowReservations: [],
  methodologyVersions: [],
  methodologyRules: [],
  methodologyGoldenFixtures: [],
  aouMethodologyVersions: [],
  aouReferenceRows: [],
  reportVersions: [],
  rectificationRequests: [],
  assessmentObservations: [],
  recommendations: [],
  implementationTasks: [],
  caseDocuments: [],
  manualSheetApprovals: [],
  deliveryMilestones: [],
  evaluationSnapshots: [],
  utilityVerdicts: [],
  mapping32D: [],
  mapping16D: [],
  utilityRules: [],
  shaktiSnapshots: [],
  timelineEvents: [],
  optInLeads: [],
  whatsappTemplates: [],
  whatsappLogs: [], leadProfileVersions: [], mediaAssets: [], mediaAssetVersions: [], secureAccessGrants: [], communicationPreparations: [],
  qualificationFormDefinitions: [], qualificationInvitations: [], qualificationResponseVersions: [], prospectiveProjects: [],
  founderReviewBookings: [], zoomMeetingBindings: [], founderReminderTasks: [],
  founderCommercialPolicies: [], founderCommercialLegalPolicies: [], founderProposalTemplates: [], founderProposalVersions: [],
  founderProposalApprovals: [], founderProposalArtifacts: [], founderProposalGrants: [], founderProposalResponses: [],
  founderCommercialPaymentConfirmations: [], founderBalanceDeadlines: [], founderCommercialInvoices: [], founderCommercialPolicyEvents: [], founderCommercialAuditEvents: [],
  founderStatutoryPolicies: [], founderBillingProfileVersions: [], founderStatutorySequenceReservations: [], founderStatutoryDocuments: []
});

const createDemoAppState = (): AppState => ({
  clients: structuredClone(seedClients),
  pipelineTransitions: [],
  commercialPolicy: structuredClone(LEGACY_COMMERCIAL_POLICY_DEFAULTS),
  commercialPolicyHistory: [structuredClone(LEGACY_COMMERCIAL_POLICY_DEFAULTS)],
  clientIntakeProfiles: [],
  leadQualifications: structuredClone(seedLeadQualifications),
  commercialProposals: structuredClone(seedCommercialProposals),
  reviewCallBookings: [],
  payments: structuredClone(seedPayments),
  advanceVerifications: [],
  vastuCases: structuredClone(seedVastuCases),
  projects: [],
  floorWorkspaces: structuredClone(seedFloorWorkspaces),
  siteAnalyses: [],
  siteAnalysisApprovals: [],
  postSiteFindings: [],
  postSiteFindingsApprovals: [],
  planVersions: [],
  spatialEvidenceVersions: [],
  orientationVersions: [],
  openingMappings: [],
  spaceMappings: [],
  dependencyInvalidations: [],
  regenerationResolutions: [],
  stageAFloorReviews: [],
  stageAFloorApprovalCheckpoints: [],
  remedialWorkflowReservations: [],
  methodologyVersions: [],
  methodologyRules: [],
  methodologyGoldenFixtures: [],
  aouMethodologyVersions: [],
  aouReferenceRows: [],
  reportVersions: structuredClone(seedReportVersions),
  rectificationRequests: [],
  assessmentObservations: [],
  recommendations: [],
  implementationTasks: [],
  caseDocuments: [],
  manualSheetApprovals: [],
  deliveryMilestones: [],
  evaluationSnapshots: structuredClone(seedEvaluationSnapshots),
  utilityVerdicts: [],
  mapping32D: structuredClone(seedMapping32D),
  mapping16D: structuredClone(seedMapping16D),
  utilityRules: structuredClone(seedUtilityRules),
  shaktiSnapshots: structuredClone(seedShaktiSnapshots),
  timelineEvents: structuredClone(seedTimelineEvents),
  optInLeads: [],
  whatsappTemplates: structuredClone(seedWhatsappTemplates),
  whatsappLogs: structuredClone(seedWhatsappLogs), leadProfileVersions: [], mediaAssets: [], mediaAssetVersions: [], secureAccessGrants: [], communicationPreparations: [],
  qualificationFormDefinitions: [], qualificationInvitations: [], qualificationResponseVersions: [], prospectiveProjects: [],
  founderReviewBookings: [], zoomMeetingBindings: [], founderReminderTasks: [],
  founderCommercialPolicies: [], founderCommercialLegalPolicies: [], founderProposalTemplates: [], founderProposalVersions: [],
  founderProposalApprovals: [], founderProposalArtifacts: [], founderProposalGrants: [], founderProposalResponses: [],
  founderCommercialPaymentConfirmations: [], founderBalanceDeadlines: [], founderCommercialInvoices: [], founderCommercialPolicyEvents: [], founderCommercialAuditEvents: [],
  founderStatutoryPolicies: [], founderBillingProfileVersions: [], founderStatutorySequenceReservations: [], founderStatutoryDocuments: []
});

const createInitialState = () => process.env.NODE_ENV === "production" ? createEmptyAppState() : createDemoAppState();

declare global {
  // eslint-disable-next-line no-var
  var uchitVastuState: AppState | undefined;
}

export function getAppState() {
  globalThis.uchitVastuState ??= createInitialState();
  return globalThis.uchitVastuState;
}

export function setAppState(nextState: AppState) {
  globalThis.uchitVastuState = nextState;
  return globalThis.uchitVastuState;
}

export function resetAppState() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Demo reset is unavailable in production.");
  }
  globalThis.uchitVastuState = createDemoAppState();
  return globalThis.uchitVastuState;
}
