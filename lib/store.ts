import {
  clients as seedClients,
  commercialProposals as seedCommercialProposals,
  evaluationSnapshots as seedEvaluationSnapshots,
  floorWorkspaces as seedFloorWorkspaces,
  leadQualifications as seedLeadQualifications,
  mapping16D as seedMapping16D,
  mapping32D as seedMapping32D,
  payments as seedPayments,
  projects as seedProjects,
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
  V1FullBalanceClearanceRecord,
  LeadQualificationRecord,
  PaymentRecord,
  ReviewCallBookingRecord,
  ReportVersionRecord,
  DocumentDeliveryRecord,
  DocumentDeliveryEventRecord,
  RectificationRequestRecord,
  AssessmentObservation,
  Recommendation,
  ImplementationTask,
  CaseDocumentRecord,
  ManualSheetApprovalRecord,
  DeliveryMilestone,
  ClientIntakeProfile,
  CasePropertyContextRecord,
  ShaktiSnapshotRecord,
  TimelineEvent,
  UtilityRule,
  InboundLeadRecord,
  VastuCaseRecord,
  VastuProjectRecord,
  PlanVersionRecord,
  SpatialEvidenceVersionRecord,
  OrientationVersionRecord,
  D8OrientationSnapshotV1, DirectionalInputVersionV1, DirectionalEvaluationSnapshotV1,
  DirectionalReportCardSnapshotV1, DirectionalStageAPresentationV1,
  ElementalReportSnapshotV1, EvaluationRemedyHandoffRecordV1, CombinedEvaluationReportSnapshotV1,
  StageBInputV1Record,
  OpeningMappingRecord,
  EntranceZoneVersionRecord,
  SpaceMappingRecord,
  DependencyInvalidationRecord,
  RegenerationResolutionRecord,
  StageAFloorReviewSnapshotRecord,
  StageAFloorApprovalCheckpointRecord,
  RemedialWorkflowReservation,
  MethodologyVersionRecord,
  D16UtilityMappingVersionRecord,
  MethodologyRuleRecord,
  MethodologyGoldenFixtureRecord,
  AouMethodologyVersionRecord,
  AouReferenceRowRecord,
  WhatsAppTemplateLogRecord,
  WhatsAppTemplateRecord
  ,LeadProfileVersionRecord, MediaAssetRecord, MediaAssetVersionRecord, ImageProcessingTaskRecord, ImageDerivativeRecord,
  ImageProcessingBatchRecord, ImageUtilityAuditEventRecord, SecureAccessGrantRecord, CommunicationPreparationRecord,
  QualificationFormDefinitionRecord, QualificationInvitationRecord, QualificationResponseVersionRecord, ProspectiveProjectRecord,
  FounderReviewBookingRecord, ZoomMeetingBindingRecord, FounderReminderTaskRecord
  ,FounderCommercialPolicyVersionRecord, FounderCommercialLegalPolicyRecord, FounderProposalTemplateVersionRecord,
  FounderProposalVersionRecord, FounderProposalApprovalRecord, FounderProposalArtifactRecord, FounderProposalGrantRecord,
  FounderProposalResponseRecord, FounderCommercialPaymentConfirmationRecord, FounderBalanceDeadlineRecord,
  FounderCommercialInvoiceRecord, FounderCommercialPolicyEventRecord, FounderCommercialAuditEventRecord, FounderStatutoryPolicyVersionRecord,
  FounderBillingProfileVersionRecord, FounderStatutorySequenceReservationRecord, FounderStatutoryDocumentRecord
  ,OrganisationBrandProfileRecord, DocumentTemplateRecord, BrandingAuditEventRecord, LegacyBrandingSourceRecord
  ,StageBRemediationRecord, RevisedLayoutCandidateRecord, RemediationBaseLayoutVersionRecord, RemedyRepositoryRecord, CaseUsedRemedyRecord,
  ContextualRepositoryRecord, RepositoryAuditEventRecord, RepositoryImportBatchRecord, RepositoryImportRowRecord,
  RemedyEligibilityResolutionRecord, ReportPlacementPageRecord, PhysicalPlacementRecord, PlacementImplementationRowRecord,
  MasterAppendixRowRecord, StageBIntegrityRunRecord
  ,SectionAWorkspaceRecord, SectionAVisualPageRecord, SectionAAssetRecord, ExistingLayoutAnnotationRecord,
  ColourFrameCompositionRecord, SectionAIntegrityRunRecord, RemediationReportIntegrityRunRecord
  ,SectionCWorkspaceRecord, SectionCExtraPageRecord, SectionCAssetRecord, SectionCIntegrityRunRecord
} from "./domain.ts";
import type { SiteEvaluationEvidenceVersionRecord } from "./site-evaluation-evidence-v1.ts";
import type { PostSiteElementalObservationRecord } from "./post-site-observations-v1.ts";
import type { EnergyBarEvidenceVersionRecord } from "./energy-bar-evidence-v1.ts";
import type { EnergyBarStateSetVersionRecord } from "./energy-bar-state-v1.ts";
import type { ElementalEvaluationSnapshotV1 } from "./elemental-evaluation-integration-v1.ts";
import { LEGACY_COMMERCIAL_POLICY_DEFAULTS } from "./commercial-policy.ts";

export interface AppState {
  /** Read-only response metadata used for optimistic concurrency; not a domain collection. */
  persistenceRevision?: number | null;
  clients: typeof seedClients;
  pipelineTransitions: import("./domain.ts").PipelineTransitionRecord[];
  commercialPolicy: import("./domain.ts").CommercialPolicy;
  commercialPolicyHistory: import("./domain.ts").CommercialPolicy[];
  clientIntakeProfiles: ClientIntakeProfile[];
  casePropertyContexts: CasePropertyContextRecord[];
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
  v1FullBalanceClearances: V1FullBalanceClearanceRecord[];
  planVersions: PlanVersionRecord[];
  spatialEvidenceVersions: SpatialEvidenceVersionRecord[];
  orientationVersions: OrientationVersionRecord[];
  d8OrientationSnapshots: D8OrientationSnapshotV1[];
  directionalInputVersions: DirectionalInputVersionV1[];
  directionalEvaluationSnapshots: DirectionalEvaluationSnapshotV1[];
  directionalReportCardSnapshots: DirectionalReportCardSnapshotV1[];
  directionalStageAPresentations: DirectionalStageAPresentationV1[];
  openingMappings: OpeningMappingRecord[];
  entranceZoneVersions: EntranceZoneVersionRecord[];
  spaceMappings: SpaceMappingRecord[];
  d16UtilityMappingVersions: D16UtilityMappingVersionRecord[];
  dependencyInvalidations: DependencyInvalidationRecord[];
  regenerationResolutions: RegenerationResolutionRecord[];
  stageAFloorReviews: StageAFloorReviewSnapshotRecord[];
  stageAFloorApprovalCheckpoints: StageAFloorApprovalCheckpointRecord[];
  remedialWorkflowReservations: RemedialWorkflowReservation[];
  stageBRemediations: StageBRemediationRecord[];
  revisedLayoutCandidates: RevisedLayoutCandidateRecord[];
  remediationBaseLayoutVersions: RemediationBaseLayoutVersionRecord[];
  remedyRepositoryRecords: RemedyRepositoryRecord[];
  caseUsedRemedyRecords: CaseUsedRemedyRecord[];
  contextualRepositoryRecords: ContextualRepositoryRecord[];
  repositoryAuditEvents: RepositoryAuditEventRecord[];
  repositoryImportBatches: RepositoryImportBatchRecord[];
  repositoryImportRows: RepositoryImportRowRecord[];
  remedyEligibilityResolutions: RemedyEligibilityResolutionRecord[];
  reportPlacementPages: ReportPlacementPageRecord[];
  physicalPlacements: PhysicalPlacementRecord[];
  placementImplementationRows: PlacementImplementationRowRecord[];
  masterAppendixRows: MasterAppendixRowRecord[];
  stageBIntegrityRuns: StageBIntegrityRunRecord[];
  sectionAWorkspaces: SectionAWorkspaceRecord[];
  sectionAVisualPages: SectionAVisualPageRecord[];
  sectionAAssets: SectionAAssetRecord[];
  existingLayoutAnnotations: ExistingLayoutAnnotationRecord[];
  colourFrameCompositions: ColourFrameCompositionRecord[];
  sectionAIntegrityRuns: SectionAIntegrityRunRecord[];
  remediationReportIntegrityRuns: RemediationReportIntegrityRunRecord[];
  sectionCWorkspaces: SectionCWorkspaceRecord[];
  sectionCExtraPages: SectionCExtraPageRecord[];
  sectionCAssets: SectionCAssetRecord[];
  sectionCIntegrityRuns: SectionCIntegrityRunRecord[];
  methodologyVersions: MethodologyVersionRecord[];
  methodologyRules: MethodologyRuleRecord[];
  methodologyGoldenFixtures: MethodologyGoldenFixtureRecord[];
  aouMethodologyVersions: AouMethodologyVersionRecord[];
  aouReferenceRows: AouReferenceRowRecord[];
  reportVersions: ReportVersionRecord[];
  documentDeliveries: DocumentDeliveryRecord[];
  documentDeliveryEvents: DocumentDeliveryEventRecord[];
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
  imageProcessingTasks: ImageProcessingTaskRecord[];
  imageDerivatives: ImageDerivativeRecord[];
  imageProcessingBatches: ImageProcessingBatchRecord[];
  imageUtilityAuditEvents: ImageUtilityAuditEventRecord[];
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
  organisationBrandProfiles: OrganisationBrandProfileRecord[];
  documentTemplates: DocumentTemplateRecord[];
  brandingAuditEvents: BrandingAuditEventRecord[];
  legacyBrandingSources: LegacyBrandingSourceRecord[];
  siteEvaluationEvidenceVersions: SiteEvaluationEvidenceVersionRecord[];
  postSiteElementalObservations: PostSiteElementalObservationRecord[];
  energyBarEvidenceVersions: EnergyBarEvidenceVersionRecord[];
  energyBarStateSetVersions: EnergyBarStateSetVersionRecord[];
  elementalEvaluationSnapshots: ElementalEvaluationSnapshotV1[];
  elementalReportSnapshots: ElementalReportSnapshotV1[];
  evaluationRemedyHandoffs: EvaluationRemedyHandoffRecordV1[];
  stageBInputsV1: StageBInputV1Record[];
  combinedEvaluationReportSnapshots: CombinedEvaluationReportSnapshotV1[];
}

export const createEmptyAppState = (): AppState => ({
  clients: [],
  pipelineTransitions: [],
  commercialPolicy: structuredClone(LEGACY_COMMERCIAL_POLICY_DEFAULTS),
  commercialPolicyHistory: [structuredClone(LEGACY_COMMERCIAL_POLICY_DEFAULTS)],
  clientIntakeProfiles: [],
  casePropertyContexts: [],
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
  v1FullBalanceClearances: [],
  planVersions: [],
  spatialEvidenceVersions: [],
  orientationVersions: [],
  d8OrientationSnapshots: [],
  directionalInputVersions: [],
  directionalEvaluationSnapshots: [],
  directionalReportCardSnapshots: [],
  directionalStageAPresentations: [],
  openingMappings: [],
  entranceZoneVersions: [],
  spaceMappings: [],
  d16UtilityMappingVersions: [],
  dependencyInvalidations: [],
  regenerationResolutions: [],
  stageAFloorReviews: [],
  stageAFloorApprovalCheckpoints: [],
  remedialWorkflowReservations: [],
  stageBRemediations: [], revisedLayoutCandidates: [], remediationBaseLayoutVersions: [], remedyRepositoryRecords: [], caseUsedRemedyRecords: [],
  contextualRepositoryRecords: [], repositoryAuditEvents: [], repositoryImportBatches: [], repositoryImportRows: [],
  remedyEligibilityResolutions: [], reportPlacementPages: [], physicalPlacements: [], placementImplementationRows: [],
  masterAppendixRows: [], stageBIntegrityRuns: [], sectionAWorkspaces: [], sectionAVisualPages: [], sectionAAssets: [],
  existingLayoutAnnotations: [], colourFrameCompositions: [], sectionAIntegrityRuns: [], remediationReportIntegrityRuns: [],
  sectionCWorkspaces: [], sectionCExtraPages: [], sectionCAssets: [], sectionCIntegrityRuns: [],
  methodologyVersions: [],
  methodologyRules: [],
  methodologyGoldenFixtures: [],
  aouMethodologyVersions: [],
  aouReferenceRows: [],
  reportVersions: [],
  documentDeliveries: [],
  documentDeliveryEvents: [],
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
  whatsappLogs: [], leadProfileVersions: [], mediaAssets: [], mediaAssetVersions: [], imageProcessingTasks: [], imageDerivatives: [],
  imageProcessingBatches: [], imageUtilityAuditEvents: [], secureAccessGrants: [], communicationPreparations: [],
  qualificationFormDefinitions: [], qualificationInvitations: [], qualificationResponseVersions: [], prospectiveProjects: [],
  founderReviewBookings: [], zoomMeetingBindings: [], founderReminderTasks: [],
  founderCommercialPolicies: [], founderCommercialLegalPolicies: [], founderProposalTemplates: [], founderProposalVersions: [],
  founderProposalApprovals: [], founderProposalArtifacts: [], founderProposalGrants: [], founderProposalResponses: [],
  founderCommercialPaymentConfirmations: [], founderBalanceDeadlines: [], founderCommercialInvoices: [], founderCommercialPolicyEvents: [], founderCommercialAuditEvents: [],
  founderStatutoryPolicies: [], founderBillingProfileVersions: [], founderStatutorySequenceReservations: [], founderStatutoryDocuments: [],
   organisationBrandProfiles: [], documentTemplates: [], brandingAuditEvents: [], legacyBrandingSources: [], siteEvaluationEvidenceVersions: [], postSiteElementalObservations: [], energyBarEvidenceVersions: [], energyBarStateSetVersions: [], elementalEvaluationSnapshots: [], elementalReportSnapshots: [], evaluationRemedyHandoffs: [], stageBInputsV1: [], combinedEvaluationReportSnapshots: []
});

const createDemoAppState = (): AppState => ({
  clients: structuredClone(seedClients),
  pipelineTransitions: [],
  commercialPolicy: structuredClone(LEGACY_COMMERCIAL_POLICY_DEFAULTS),
  commercialPolicyHistory: [structuredClone(LEGACY_COMMERCIAL_POLICY_DEFAULTS)],
  clientIntakeProfiles: [],
  casePropertyContexts: [],
  leadQualifications: structuredClone(seedLeadQualifications),
  commercialProposals: structuredClone(seedCommercialProposals),
  reviewCallBookings: [],
  payments: structuredClone(seedPayments),
  advanceVerifications: [],
  vastuCases: structuredClone(seedVastuCases),
  projects: structuredClone(seedProjects),
  floorWorkspaces: structuredClone(seedFloorWorkspaces),
  siteAnalyses: [],
  siteAnalysisApprovals: [],
  postSiteFindings: [],
  postSiteFindingsApprovals: [],
  v1FullBalanceClearances: [],
  planVersions: [],
  spatialEvidenceVersions: [],
  orientationVersions: [],
  d8OrientationSnapshots: [],
  directionalInputVersions: [],
  directionalEvaluationSnapshots: [],
  directionalReportCardSnapshots: [],
  directionalStageAPresentations: [],
  openingMappings: [],
  entranceZoneVersions: [],
  spaceMappings: [],
  d16UtilityMappingVersions: [],
  dependencyInvalidations: [],
  regenerationResolutions: [],
  stageAFloorReviews: [],
  stageAFloorApprovalCheckpoints: [],
  remedialWorkflowReservations: [],
  stageBRemediations: [], revisedLayoutCandidates: [], remediationBaseLayoutVersions: [], remedyRepositoryRecords: [], caseUsedRemedyRecords: [],
  contextualRepositoryRecords: [], repositoryAuditEvents: [], repositoryImportBatches: [], repositoryImportRows: [],
  remedyEligibilityResolutions: [], reportPlacementPages: [], physicalPlacements: [], placementImplementationRows: [],
  masterAppendixRows: [], stageBIntegrityRuns: [], sectionAWorkspaces: [], sectionAVisualPages: [], sectionAAssets: [],
  existingLayoutAnnotations: [], colourFrameCompositions: [], sectionAIntegrityRuns: [], remediationReportIntegrityRuns: [],
  sectionCWorkspaces: [], sectionCExtraPages: [], sectionCAssets: [], sectionCIntegrityRuns: [],
  methodologyVersions: [],
  methodologyRules: [],
  methodologyGoldenFixtures: [],
  aouMethodologyVersions: [],
  aouReferenceRows: [],
  reportVersions: structuredClone(seedReportVersions),
  documentDeliveries: [],
  documentDeliveryEvents: [],
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
  whatsappLogs: structuredClone(seedWhatsappLogs), leadProfileVersions: [], mediaAssets: [], mediaAssetVersions: [], imageProcessingTasks: [], imageDerivatives: [],
  imageProcessingBatches: [], imageUtilityAuditEvents: [], secureAccessGrants: [], communicationPreparations: [],
  qualificationFormDefinitions: [], qualificationInvitations: [], qualificationResponseVersions: [], prospectiveProjects: [],
  founderReviewBookings: [], zoomMeetingBindings: [], founderReminderTasks: [],
  founderCommercialPolicies: [], founderCommercialLegalPolicies: [], founderProposalTemplates: [], founderProposalVersions: [],
  founderProposalApprovals: [], founderProposalArtifacts: [], founderProposalGrants: [], founderProposalResponses: [],
  founderCommercialPaymentConfirmations: [], founderBalanceDeadlines: [], founderCommercialInvoices: [], founderCommercialPolicyEvents: [], founderCommercialAuditEvents: [],
  founderStatutoryPolicies: [], founderBillingProfileVersions: [], founderStatutorySequenceReservations: [], founderStatutoryDocuments: [],
   organisationBrandProfiles: [], documentTemplates: [], brandingAuditEvents: [], legacyBrandingSources: [], siteEvaluationEvidenceVersions: [], postSiteElementalObservations: [], energyBarEvidenceVersions: [], energyBarStateSetVersions: [], elementalEvaluationSnapshots: [], elementalReportSnapshots: [], evaluationRemedyHandoffs: [], stageBInputsV1: [], combinedEvaluationReportSnapshots: []
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
