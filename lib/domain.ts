export const roles = ["CLIENT", "SETTER", "CONSULTANT", "ADMIN", "SUPER_ADMIN"] as const;
export type UserRole = (typeof roles)[number];

/**
 * Additive ownership metadata for the Founder Edition migration. Legacy
 * snapshot rows intentionally keep these fields optional until they are
 * adopted into the founder organisation; all new protected writes stamp them.
 */
export interface OrganisationOwnedRecord {
  organisationId?: string;
  createdByActorUserId?: string;
  updatedByActorUserId?: string;
  recordVersion?: number;
}

/**
 * Dormant integration metadata. These contracts are intentionally additive;
 * no external provider is enabled by defining them.
 */
export const integrationSourceStatuses = ["ACTIVE", "PAUSED", "RETIRED"] as const;
export type IntegrationSourceStatus = (typeof integrationSourceStatuses)[number];
export const integrationInboundModes = ["SIGNED_WEBHOOK", "POLL", "COHOSTED_API"] as const;
export type IntegrationInboundMode = (typeof integrationInboundModes)[number];
export const integrationLinkStatuses = ["ACTIVE", "REVIEW_REQUIRED", "REVOKED"] as const;
export type IntegrationLinkStatus = (typeof integrationLinkStatuses)[number];
export const integrationMatchMethods = ["EXACT_EMAIL", "EXACT_PHONE", "MANUAL", "NEW_CLIENT"] as const;
export type IntegrationMatchMethod = (typeof integrationMatchMethods)[number];
export const integrationEventStatuses = ["RECEIVED", "APPLIED", "REPLAYED", "REVIEW_REQUIRED", "FAILED", "DEAD_LETTER"] as const;
export type IntegrationEventStatus = (typeof integrationEventStatuses)[number];
export const integrationOutboxStatuses = ["PENDING", "SENT", "FAILED", "DEAD_LETTER"] as const;
export type IntegrationOutboxStatus = (typeof integrationOutboxStatuses)[number];
export const integrationConflictStatuses = ["REVIEW_REQUIRED", "ACCEPT_CANONICAL", "ACCEPT_INCOMING", "RESOLVED"] as const;
export type IntegrationConflictStatus = (typeof integrationConflictStatuses)[number];

export interface ExternalSourceRecord extends OrganisationOwnedRecord {
  id: string;
  sourceSystem: string;
  sourceEnvironment: string;
  sourceKey: string;
  status: IntegrationSourceStatus;
  inboundMode: IntegrationInboundMode;
  configVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExternalClientLinkRecord extends OrganisationOwnedRecord {
  id: string;
  externalSourceId: string;
  sourceRecordType: string;
  sourceRecordId: string;
  externalClientCode?: string;
  clientId: string;
  matchMethod: IntegrationMatchMethod;
  status: IntegrationLinkStatus;
  identityHash?: string;
  sourceCreatedAt?: string;
  lastSeenAt?: string;
  lastSyncedAt?: string;
}

export interface IntegrationEventRecord extends OrganisationOwnedRecord {
  id: string;
  externalSourceId: string;
  eventId: string;
  sourceRecordType: string;
  sourceRecordId: string;
  eventType: string;
  sourceActorId?: string;
  occurredAt: string;
  receivedAt: string;
  payloadHash: string;
  identityHash?: string;
  status: IntegrationEventStatus;
  retryCount: number;
  nextAttemptAt?: string;
  lastErrorCode?: string;
  processedAt?: string;
  requestId: string;
}

export interface IntegrationOutboxRecord extends OrganisationOwnedRecord {
  id: string;
  externalSourceId: string;
  targetSystem: string;
  entityType: string;
  entityId: string;
  eventType: string;
  canonicalRevision?: number;
  payloadVersion: string;
  payloadHash: string;
  status: IntegrationOutboxStatus;
  attemptCount: number;
  nextAttemptAt?: string;
  lastErrorCode?: string;
  idempotencyKey: string;
  sentAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationConflictRecord extends OrganisationOwnedRecord {
  id: string;
  externalSourceId: string;
  integrationEventId?: string;
  entityType: string;
  entityId: string;
  fieldName: string;
  canonicalHash?: string;
  incomingHash?: string;
  status: IntegrationConflictStatus;
  reason: string;
  resolvedByActorId?: string;
  resolvedAt?: string;
  createdAt: string;
}

export interface IntegrationCursorRecord extends OrganisationOwnedRecord {
  id: string;
  externalSourceId: string;
  cursor?: string;
  observedAt?: string;
  updatedAt: string;
}

export const leadStages = ["NEW", "QUALIFYING", "QUALIFIED", "DISQUALIFIED", "CONVERTED"] as const;
export type LeadStage = (typeof leadStages)[number];
export const canonicalPipelineStages = ["NEW", "CONTACTED", "VSL_SENT", "VSL_WATCHED", "PAID_REVIEW_PENDING", "PAID_REVIEW_BOOKED", "FORM_PENDING", "REVIEW_COMPLETED", "QUALIFIED", "PROPOSAL_SCOPE", "WON", "ONBOARDING", "IN_DELIVERY", "FOLLOW_UP", "CLOSED_REFERRAL", "DISQUALIFIED"] as const;
export type CanonicalPipelineStage = (typeof canonicalPipelineStages)[number];

export const inboundLeadStatuses = ["NEW", "FILTERED", "QUALIFIED", "DISQUALIFIED", "DUPLICATE"] as const;
export type InboundLeadStatus = (typeof inboundLeadStatuses)[number];

export const proposalStatuses = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED"] as const;
export type CommercialProposalStatus = (typeof proposalStatuses)[number];

export const paymentTypes = ["ADVANCE", "BALANCE", "ADDON"] as const;
export type PaymentType = (typeof paymentTypes)[number];

export const paymentStatuses = ["PENDING", "APPROVED", "FAILED", "REFUNDED"] as const;
export type PaymentStatus = (typeof paymentStatuses)[number];

export const caseStatuses = [
  "AWAITING_ADVANCE",
  "CASE_CREATED",
  "FLOOR_WORKSPACE_ACTIVE",
  "ORIENTATION_LOCKED",
  "STAGE_A_READY",
  "BALANCE_PENDING",
  "FULL_PAYMENT_APPROVED",
  "REPORT_APPROVAL_PENDING",
  "REPORT_APPROVED",
  "VERDICT_RELEASED",
  "RECTIFICATION"
] as const;
export type VastuCaseStatus = (typeof caseStatuses)[number];

export const serviceTypes = ["EXISTING_SPACE", "NEW_CONSTRUCTION"] as const;
export type VastuServiceType = (typeof serviceTypes)[number];

export const canonicalServiceStages = ["UNDERSTAND", "VERIFY", "MAP", "EVALUATE", "PRIORITISE", "RECOMMEND", "IMPLEMENT"] as const;
export type CanonicalServiceStage = (typeof canonicalServiceStages)[number];

export interface CaseInputReadiness {
  floorPlans?: boolean;
  siteLocation?: boolean;
  visualRecord?: boolean;
  currentUse?: boolean;
  clientPriorities?: boolean;
  plotMeasurements?: boolean;
  boundaryDrawing?: boolean;
  developmentControls?: boolean;
  projectBrief?: boolean;
  projectTeam?: boolean;
  constructionSchedule?: boolean;
}

export interface CaseDrawingReference {
  versionLabel: string;
  receivedAt?: string;
  verifiedAt?: string;
  discrepancy?: string;
  superseded?: boolean;
}

export const floorStatuses = ["DRAFT", "NEEDS_REGENERATION", "READY_FOR_REVIEW", "LOCKED"] as const;
export type FloorStatus = (typeof floorStatuses)[number];

export const reportStatuses = ["DRAFT", "PREVIEW_BLOCKED", "PAYMENT_BLOCKED", "READY_FOR_APPROVAL", "APPROVED", "RELEASED"] as const;
export type ReportStatus = (typeof reportStatuses)[number];

export interface AppUser {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  color: string;
  organisationId?: string;
  organisationCapability?: string;
}

export interface ClientRecord extends OrganisationOwnedRecord {
  id: string;
  displayName: string;
  city: string;
  source: string;
  assignedSetterId: string;
  email: string;
  phone: string;
  stage: LeadStage;
  recordVersion?: number;
  pipelineStage?: CanonicalPipelineStage;
  pipelineOwner?: { id: string; name: string; role: UserRole };
  nextAction?: { summary: string; dueAt: string };
}

export interface PipelineTransitionRecord extends OrganisationOwnedRecord {
  id: string; clientId: string; idempotencyKey: string;
  beforeStage: CanonicalPipelineStage; afterStage: CanonicalPipelineStage;
  owner: { id: string; name: string; role: UserRole }; nextAction?: { summary: string; dueAt: string };
  correctionReason?: string; actor: { id: string; name: string; role: UserRole }; happenedAt: string;
  sourceSystem?: string; sourceRecordType?: string; sourceRecordId?: string; integrationEventId?: string;
}

export interface CommercialPolicy {
  version: number; defaultProposalAmountInr: number; minimumAdvanceInr: number;
  qualificationCallTargetMinutes: number; nextActionDueSoonHours: number; defaultReviewCallMinutes: number;
  reason: string; updatedAt: string; updatedBy: { id: string; name: string; role: UserRole };
  idempotencyKey: string;
}

export const decisionMakerStatuses = ["SOLE", "JOINT", "NOT_DECISION_MAKER"] as const;
export type DecisionMakerStatus = (typeof decisionMakerStatuses)[number];
export interface ClientIntakeProfile extends OrganisationOwnedRecord {
  clientId: string; version: number; idempotencyKey: string;
  contactPreference?: { whatsapp?: string; preferredLanguage?: string; preferredContactWindow?: string };
  businessContext?: { company?: string; industry?: string; designation?: string; vision?: string };
  decisionMakerStatus?: DecisionMakerStatus; otherDecisionMakers?: string;
  propertyContext?: { serviceInterest?: VastuServiceType; propertyType?: string; propertyStatus?: string; areaValue?: number; areaUnit?: string; cityCountry?: string; constraints?: string };
  needs?: { mainChallenge?: string; desiredOutcome?: string; urgency?: string };
  consent: { version: "uchit-intake/v1"; contact?: boolean; accuracy?: boolean; confidentiality?: boolean; confirmedAt?: string };
  created: AssessmentAudit; updated: AssessmentAudit;
}

export interface LeadQualificationRecord extends OrganisationOwnedRecord {
  id: string;
  clientId: string;
  score: number;
  notes: string;
  qualificationCallDueAt: string;
  qualificationCallCompletedAt?: string;
  deliverableTriggeredAt?: string;
  conversationalForm: Array<{ label: string; answer: string }>;
}

export interface InboundLeadRecord extends OrganisationOwnedRecord {
  id: string;
  uniqueClientId: string;
  identityKey: string;
  fullName: string;
  email: string;
  phone: string;
  dob?: string;
  city: string;
  source: string;
  statusLabel?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  landingPage?: string;
  referrer?: string;
  assignedTo?: string;
  deletedAt?: string;
  score: number;
  message: string;
  status: InboundLeadStatus;
  importedAt: string;
  firstSeenAt: string;
  lastSeenAt: string;
  submissionCount: number;
  duplicateCount: number;
  isReturningLead: boolean;
  qualifiedAt?: string;
  convertedClientId?: string;
  notes?: string;
  sourceSystem?: string;
  externalSourceId?: string;
  sourceRecordType?: string;
  sourceRecordId?: string;
  externalClientCode?: string;
  syncStatus?: "RECEIVED" | "APPLIED" | "REVIEW_REQUIRED" | "FAILED";
  lastSyncedAt?: string;
  sourceEventId?: string;
}

export interface CommercialProposalRecord extends OrganisationOwnedRecord {
  id: string;
  clientId: string;
  amountInr: number;
  minAdvanceInr: number;
  status: CommercialProposalStatus;
  policyVersion?: number;
  termsSnapshot?: {
    totalFeeInr: number;
    minimumAdvanceInr: number;
    currency: "INR";
    policyVersion: number;
    capturedAt: string;
  };
  createdAt?: string;
  idempotencyKey?: string;
  reviewerId?: string;
  superAdminApprovedAt?: string;
}

export interface ReviewCallBookingRecord extends OrganisationOwnedRecord {
  id: string;
  clientId: string;
  proposalId: string;
  provider: "GOOGLE_MEET" | "ZOOM";
  scheduledAt: string;
  durationMinutes: number;
  meetingLink: string;
  calendarHoldId: string;
  status: "BOOKED" | "SENT" | "COMPLETED" | "CANCELLED";
  bookedBy: string;
  bookedAt: string;
}

export interface PaymentRecord extends OrganisationOwnedRecord {
  id: string;
  clientId: string;
  proposalId?: string;
  caseId?: string;
  type: PaymentType;
  amountInr: number;
  status: PaymentStatus;
  approvedAt?: string;
  referenceScreenshotUrl?: string;
  referenceScreenshotFileName?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  verificationNote?: string;
  proofAssetId?: string;
  idempotencyKey?: string;
}

export interface AdvanceVerificationRecord extends OrganisationOwnedRecord {
  id: string;
  clientId: string;
  proposalId: string;
  amountInr: number;
  referenceScreenshotUrl: string;
  referenceScreenshotFileName: string;
  verifiedBy: string;
  verifiedAt: string;
  paymentId: string;
  proofAssetId?: string;
  caseId?: string;
  status: "VERIFIED" | "CASE_OPENED";
  idempotencyKey?: string;
}

export interface VastuCaseRecord extends OrganisationOwnedRecord {
  id: string;
  caseNumber: string;
  clientId: string;
  proposalId: string;
  projectId?: string;
  status: VastuCaseStatus;
  reportStatus: ReportStatus;
  orientationLocked: boolean;
  balanceApproved: boolean;
  fullPaymentApproved: boolean;
  stageAVerdictStatus?: "DRAFT" | "READY" | "PRESENTED";
  stageAVerdictVersion?: string;
  verdictPresentedAt?: string;
  verdictPresentedByActorUserId?: string;
  verdictPresentationNote?: string;
  verdictPresentationIdempotencyKey?: string;
  /** Additive service metadata; legacy snapshots normalize safely to existing-space v1. */
  serviceType?: VastuServiceType;
  canonicalStage?: CanonicalServiceStage;
  serviceTemplateVersion?: string;
  scopeVersion?: string;
  inputReadiness?: CaseInputReadiness;
  currentDrawing?: CaseDrawingReference;
  /** Optimistic-concurrency token; legacy records normalize to version 0. */
  recordVersion?: number;
  /** Rectifications link forward only from the successor, preserving predecessor evidence. */
  parentCaseId?: string;
  revisionNumber?: number;
}

export interface VastuProjectRecord extends OrganisationOwnedRecord {
  id: string;
  clientId: string;
  activeCaseId: string;
  propertyName: string;
  status: "IN_PROGRESS" | "COMPLETE";
  assignedConsultantUserId?: string;
  createdAt: string;
  completedAt?: string;
}

export interface PlanVersionRecord extends OrganisationOwnedRecord {
  id: string; projectId: string; caseId: string; floorId: string; versionLabel: string;
  status: "DRAFT" | "CURRENT" | "SUPERSEDED"; protectedFileRef: string;
  idempotencyKey: string; createdAt: string; supersededAt?: string;
}

export interface SpatialEvidenceVersionRecord extends OrganisationOwnedRecord {
  id: string; projectId: string; caseId: string; floorId?: string; planVersionId?: string;
  kind: "HAND_MARKED_PLAN" | "GOOGLE_EARTH_ORIENTATION" | "SITE_PHOTO" | "OTHER";
  /** Explicit Founder-confirmed evidence classifications; legacy rows remain STANDARD/undefined. */
  classification?: "STANDARD" | "MARKED_32D_CHAKRA_V1" | "MARKED_16D_MAPPING_V1";
  /** Manual gridding evidence purpose only; it never implies computed geometry or a methodology result. */
  manualEvidencePurpose?: "BRAHMASTHAN_GRID" | "MARMAA_GRID" | "ENERGY_GRAPH";
  has32SectorChakra?: boolean;
  has16DirectionMapping?: boolean;
  protectedFileRef: string; fullColour: boolean; status: "CURRENT" | "SUPERSEDED";
  idempotencyKey: string; createdAt: string; supersededAt?: string;
}

export interface OrientationVersionRecord extends OrganisationOwnedRecord {
  id: string; projectId: string; caseId: string; exactDegree: number;
  googleEarthEvidenceVersionId: string; status: "DRAFT" | "LOCKED" | "SUPERSEDED";
  lockedAt?: string; lockedByActorUserId?: string; lockReason?: string;
  idempotencyKey: string; createdAt: string;
}

export interface OpeningMappingRecord extends OrganisationOwnedRecord {
  id: string; projectId: string; caseId: string; floorId: string; planVersionId: string;
  orientationVersionId: string; kind: "MAIN_ENTRANCE" | "ENTRANCE" | "WINDOW";
  markerX: number; markerY: number; verified: boolean;
  methodologyStatus: "APPROVED" | "REVIEW_REQUIRED" | "BLOCKED_METHOD_INPUT" | "NEEDS_REGENERATION";
  methodologyVersionId?: string; directionCode?: string; evidenceVersionId: string;
  idempotencyKey: string; createdAt: string;
}

export interface DependencyInvalidationRecord extends OrganisationOwnedRecord {
  id: string; projectId: string; caseId: string; floorId?: string;
  targetType: "OPENING_MAPPING" | "SPACE_MAPPING" | "UTILITY_EVALUATION" | "UTILITY_VERDICT" | "SHAKTI_EVALUATION" | "FINDING" | "DRAFT_REPORT";
  targetId: string;
  causeType?: "ORIENTATION" | "PLAN" | "EVIDENCE" | "MAPPING" | "METHODOLOGY" | "EVALUATION" | "SITE_ANALYSIS";
  sourceVersionId?: string;
  /** Legacy orientation invalidations retain this field for historical compatibility. */
  causedByOrientationVersionId?: string;
  replacementVersionId?: string;
  dependencyLinks?: string[];
  status: "NEEDS_REGENERATION" | "REPLACEMENT_REQUIRED" | "REGENERATED" | "READY_FOR_REVIEW";
  reason: string; createdAt: string; createdByActorUserId?: string; updatedAt?: string;
  resolutionIdempotencyKey?: string;
}

export interface RegenerationResolutionRecord extends OrganisationOwnedRecord {
  id: string; invalidationId: string; projectId: string; caseId: string; floorId: string;
  fromStatus: DependencyInvalidationRecord["status"];
  toStatus: DependencyInvalidationRecord["status"];
  sourceVersionId: string; replacementVersionId?: string; dependencyLinks: string[];
  actorUserId: string; actorDisplayName: string; actorRole: UserRole;
  reason: string; idempotencyKey: string; occurredAt: string;
}

export interface SpaceMappingRecord extends OrganisationOwnedRecord {
  id: string; projectId: string; caseId: string; floorId: string; planVersionId: string;
  orientationVersionId: string; spaceLabel: string; directionCode?: string;
  polygon: Array<{ x: number; y: number }>; verified: boolean; evidenceVersionId: string;
  methodologyVersionId?: string; idempotencyKey: string;
  methodologyStatus: "APPROVED" | "REVIEW_REQUIRED" | "BLOCKED_METHOD_INPUT" | "NEEDS_REGENERATION";
  createdAt: string;
}

export interface RectificationRequestRecord extends OrganisationOwnedRecord {
  id: string;
  predecessorCaseId: string;
  clientId: string;
  reason: string;
  idempotencyKey: string;
  requestedBy: { id: string; name: string; role: UserRole };
  requestedAt: string;
  status: "PENDING" | "APPROVED";
  approvedBy?: { id: string; name: string; role: UserRole };
  approvedAt?: string;
  successorCaseId?: string;
}

export const alignmentStatuses = ["ALIGNED", "REVIEW", "CONCERN"] as const;
export type AlignmentStatus = (typeof alignmentStatuses)[number];
export const energyStatuses = ["BALANCED", "WEAK", "EXCESS", "NA"] as const;
export type EnergyStatus = (typeof energyStatuses)[number];
export const placementStatuses = ["SUITABLE", "REVIEW", "RELOCATE", "NA"] as const;
export type PlacementStatus = (typeof placementStatuses)[number];
export const decisionPriorities = ["HIGH", "MEDIUM", "LOW"] as const;
export type DecisionPriority = (typeof decisionPriorities)[number];
export const attentionClasses = ["IMMEDIATE", "IMPORTANT", "ADVISORY"] as const;
export type AttentionClass = (typeof attentionClasses)[number];
export const implementationHorizons = ["IMMEDIATE", "SHORT_TERM", "MEDIUM_TERM", "LONG_TERM"] as const;
export type ImplementationHorizon = (typeof implementationHorizons)[number];
export const recommendationLevels = ["L1", "L2", "L3", "L4"] as const;
export type RecommendationLevel = (typeof recommendationLevels)[number];
export const implementationStatuses = ["NOT_STARTED", "PLANNED", "IN_PROGRESS", "COMPLETED", "DEFERRED", "NOT_APPLICABLE"] as const;
export type ImplementationStatus = (typeof implementationStatuses)[number];
export const responsibilityRoles = ["CLIENT", "CONSULTANT", "ARCHITECT", "STRUCTURAL_ENGINEER", "MEP_ENGINEER", "INTERIOR_DESIGNER", "CONTRACTOR", "SITE_TEAM"] as const;
export type ResponsibilityRole = (typeof responsibilityRoles)[number];
export const caseDocumentTypes = ["DIMENSIONED_PLAN", "LOCATION_MAP", "PHOTO_VIDEO", "ENTRANCE_ACCESS", "CURRENT_USE", "STRUCTURE_SERVICES", "FURNITURE_EQUIPMENT", "CLIENT_PRIORITIES", "SURVEY_BOUNDARY", "ROADS_ACCESS", "DEVELOPMENT_CONTROLS", "INTENT_ROOM_BRIEF", "USER_HIERARCHY_MOVEMENT", "ARCHITECTURAL_DRAWING", "EQUIPMENT_SERVICES", "FUTURE_NEEDS", "PROJECT_TEAM", "MILESTONES", "MANUAL_UTILITY_SHEET"] as const;
export type CaseDocumentType = (typeof caseDocumentTypes)[number];
export const documentRevisionStatuses = ["RECEIVED", "UNDER_REVIEW", "CHANGES_REQUIRED", "VERIFIED", "SUPERSEDED"] as const;
export type DocumentRevisionStatus = (typeof documentRevisionStatuses)[number];

export interface AssessmentAudit {
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  at: string;
}

export interface AssessmentObservation extends OrganisationOwnedRecord {
  id: string; caseId: string; floorId?: string; caseRevisionNumber: number; serviceType: VastuServiceType;
  version: number; idempotencyKey: string; title: string; observation: string;
  alignmentStatus: AlignmentStatus; energyStatus: EnergyStatus; placementStatus: PlacementStatus;
  evidenceRefs: readonly string[]; created: AssessmentAudit; updated: AssessmentAudit;
}

export interface Recommendation extends OrganisationOwnedRecord {
  id: string; caseId: string; floorId?: string; caseRevisionNumber: number; serviceType: VastuServiceType;
  version: number; idempotencyKey: string; title: string; rationale: string; action: string;
  decisionPriority: DecisionPriority; attentionClass: AttentionClass; implementationHorizon: ImplementationHorizon;
  level: RecommendationLevel; observationIds: readonly string[]; evidenceRefs: readonly string[];
  created: AssessmentAudit; updated: AssessmentAudit;
}

export interface ImplementationTask extends OrganisationOwnedRecord {
  id: string; caseId: string; floorId?: string; caseRevisionNumber: number; serviceType: VastuServiceType;
  version: number; idempotencyKey: string; recommendationId: string; title: string; notes?: string;
  status: ImplementationStatus; implementationHorizon: ImplementationHorizon; evidenceRefs: readonly string[];
  ownerRole: ResponsibilityRole; ownerName: string;
  created: AssessmentAudit; updated: AssessmentAudit;
}

export interface CaseDocumentRecord extends OrganisationOwnedRecord {
  id: string; caseId: string; caseRevisionNumber: number; serviceType: VastuServiceType;
  assetType: CaseDocumentType; floorLabel?: string; versionLabel: string; documentDate?: string;
  isCurrent: boolean; evidenceRef: string; discrepancy?: string; blocker: boolean;
  reviewObservation?: string; requiredChange?: string; preferredAlternative?: string; acceptableAlternative?: string;
  ownerRole: ResponsibilityRole; ownerName: string; revisionStatus: DocumentRevisionStatus;
  founderApprovalStatus?: "PENDING" | "APPROVED"; founderApprovedAt?: string; founderApprovedByActorUserId?: string;
  idempotencyKey: string; version: number; received: AssessmentAudit; verified?: AssessmentAudit; updated: AssessmentAudit;
}

export interface ManualSheetApprovalRecord extends OrganisationOwnedRecord {
  id: string; documentId: string; projectId: string; caseId: string; floorId: string;
  documentVersion: number; checkpoint: "FOUNDER_APPROVED"; actorUserId: string; actorDisplayName: string; actorRole: UserRole;
  reason: string; priorStatus: "PENDING" | "APPROVED"; currentStatus: "APPROVED";
  occurredAt: string; idempotencyKey: string;
}

export const deliveryMilestoneKinds = ["REVIEW_ROUND", "FINAL_COMPLIANCE_CHECK", "CONSTRUCTION_CHECKPOINT", "CLARIFICATION", "FOLLOW_UP", "OPTIONAL_VERIFICATION"] as const;
export type DeliveryMilestoneKind = (typeof deliveryMilestoneKinds)[number];
export const deliveryMilestoneStatuses = ["PLANNED", "READY", "IN_PROGRESS", "BLOCKED", "COMPLETED", "DEFERRED"] as const;
export type DeliveryMilestoneStatus = (typeof deliveryMilestoneStatuses)[number];
export interface DeliveryMilestone extends OrganisationOwnedRecord {
  id: string; caseId: string; caseRevisionNumber: number; serviceType: VastuServiceType;
  kind: DeliveryMilestoneKind; sequence: number; roundLabel: string; title: string;
  status: DeliveryMilestoneStatus; dueDate?: string; completedAt?: string;
  ownerRole: ResponsibilityRole; ownerName: string;
  drawingRef?: { caseDocumentId: string; version: number };
  observationSummary?: string; actionSummary?: string; reason?: string; blocker: boolean;
  evidenceRefs: readonly string[]; idempotencyKey: string; version: number;
  created: AssessmentAudit; updated: AssessmentAudit;
}

export interface FloorWorkspaceRecord extends OrganisationOwnedRecord {
  id: string;
  caseId: string;
  projectId?: string;
  floorLabel: string;
  status: FloorStatus;
  locked: boolean;
  regenerationReason?: string;
  evidenceUploads: string[];
  idempotencyKey?: string;
  stageAVerdictStatus?: "DRAFT" | "READY" | "PRESENTED";
  stageAVerdictVersion?: string;
  verdictPresentedAt?: string;
  verdictPresentedByActorUserId?: string;
  verdictPresentationIdempotencyKey?: string;
  reportStatus?: ReportStatus;
  deliveredAt?: string;
}

export const siteAnalysisEvidenceTypes = ["VIDEO_ANALYSIS", "PHYSICAL_VISIT"] as const;
export type SiteAnalysisEvidenceType = (typeof siteAnalysisEvidenceTypes)[number];
export const siteAnalysisStatuses = ["DRAFT", "FOUNDER_REVIEWED", "FOUNDER_APPROVED"] as const;
export type SiteAnalysisStatus = (typeof siteAnalysisStatuses)[number];

export interface SiteAnalysisRecord extends OrganisationOwnedRecord {
  id: string; projectId: string; caseId: string; floorId: string;
  caseRevisionNumber: number; floorRevisionNumber: number; version: number; supersedesId?: string;
  stageAVerdictReportId: string; stageAVerdictVersion: string; upstreamEvaluationVersionId: string;
  evidenceType: SiteAnalysisEvidenceType; evidenceRefs: string[]; capturedAt: string;
  visitMetadata?: string;
  observations: {
    site: string; entrance: string; surroundings: string; light: string;
    ventilation: string; airflow: string; neighbouringEffects: string; relevantObservations: string;
  };
  status: SiteAnalysisStatus; needsRegeneration?: boolean; regenerationReason?: string;
  idempotencyKey: string; contentHash: string; createdAt: string;
  createdByActorUserId: string; createdByActorName: string;
}

export interface SiteAnalysisApprovalRecord extends OrganisationOwnedRecord {
  id: string; analysisId: string; projectId: string; caseId: string; floorId: string;
  analysisVersion: number; checkpoint: "FOUNDER_REVIEWED" | "FOUNDER_APPROVED";
  actorUserId: string; actorDisplayName: string; actorRole: UserRole;
  reason: string; priorStatus: SiteAnalysisStatus; currentStatus: SiteAnalysisStatus;
  policyVersion?: number; occurredAt: string; idempotencyKey: string;
}

export const postSiteFindingsStatuses = ["DRAFT", "FOUNDER_REVIEWED", "FOUNDER_APPROVED"] as const;
export type PostSiteFindingsStatus = (typeof postSiteFindingsStatuses)[number];

export interface PostSiteFindingsRecord extends OrganisationOwnedRecord {
  id: string; projectId: string; caseId: string; floorId: string;
  caseRevisionNumber: number; floorRevisionNumber: number; version: number; supersedesId?: string;
  siteAnalysisId: string; upstreamReportId: string; upstreamEvaluationVersionId?: string; needsRegeneration?: boolean; regenerationReason?: string;
  differences: string; corrections: string; newFindings: string; additionalObservations: string;
  status: PostSiteFindingsStatus; idempotencyKey: string; contentHash: string; createdAt: string;
  createdByActorUserId: string; createdByActorName: string;
}

export interface PostSiteFindingsApprovalRecord extends OrganisationOwnedRecord {
  id: string; findingsId: string; projectId: string; caseId: string; floorId: string;
  findingsVersion: number; checkpoint: "FOUNDER_REVIEWED" | "FOUNDER_APPROVED";
  actorUserId: string; actorDisplayName: string; actorRole: UserRole;
  reason: string; priorStatus: PostSiteFindingsStatus; currentStatus: PostSiteFindingsStatus;
  policyVersion?: number; occurredAt: string; idempotencyKey: string;
}

export interface RemedialWorkflowReservation extends OrganisationOwnedRecord {
  id: string; projectId: string; caseId: string; floorId: string; stageAReportId: string;
  status: "BLOCKED_METHOD_INPUT" | "READY_FOR_CONFIGURATION" | "DRAFT";
  methodologyVersionId?: string; createdAt: string;
}

export const methodologyModules = ["DIRECTION_32", "DIRECTION_16", "SITE_ENVIRONMENT", "UTILITY", "SHAKTI_ELEMENT", "AOU_REFERENCE", "STAGE_B_REMEDIAL"] as const;
export type MethodologyModule = (typeof methodologyModules)[number];
export const methodologyDecisionStatuses = ["APPROVED", "CONFIGURABLE", "REVIEW_REQUIRED", "BLOCKED_METHOD_INPUT", "DEFERRED", "NEEDS_REGENERATION"] as const;
export type MethodologyDecisionStatus = (typeof methodologyDecisionStatuses)[number];

export interface MethodologyVersionRecord extends OrganisationOwnedRecord {
  id: string; module: MethodologyModule; version: number; label: string;
  lifecycleStatus: "DRAFT" | "ACTIVE" | "RETIRED";
  executionAdapterVersion?: string;
  sourceLabel: string; sourceAssetVersion?: string; sourceAssetHash?: string; contentHash: string; reason: string; idempotencyKey: string;
  createdAt: string; createdByActorUserId: string; approvedAt?: string; approvedByActorUserId?: string;
}

export interface MethodologyRuleRecord extends OrganisationOwnedRecord {
  id: string; methodologyVersionId: string; ruleKey: string; sourceReference: string;
  decisionStatus: MethodologyDecisionStatus; conditionJson: unknown; outcomeJson: unknown;
  contentHash: string; idempotencyKey: string; createdAt: string; createdByActorUserId: string;
}

export interface MethodologyGoldenFixtureRecord extends OrganisationOwnedRecord {
  id: string; methodologyVersionId: string; fixtureKey: string; inputJson: unknown; expectedOutputJson: unknown;
  decisionStatus: "APPROVED" | "REVIEW_REQUIRED" | "BLOCKED_METHOD_INPUT";
  contentHash: string; idempotencyKey: string; createdAt: string; createdByActorUserId: string;
}

export const aouRowStatuses = ["DRAFT", "REVIEW_REQUIRED", "APPROVED", "RETIRED", "BLOCKED_METHOD_INPUT"] as const;
export type AouRowStatus = (typeof aouRowStatuses)[number];

/** AOU is a separate, versioned framing reference; it never drives Utility execution. */
export interface AouMethodologyVersionRecord extends OrganisationOwnedRecord {
  id: string; version: number; label: string; lifecycleStatus: "DRAFT" | "ACTIVE" | "RETIRED";
  sourceLabel: string; sourceWorkbookHash?: string; sourceRangeHash?: string; sourceSheetRange?: string; contentHash: string; reason: string; idempotencyKey: string;
  createdAt: string; createdByActorUserId: string; approvedAt?: string; approvedByActorUserId?: string;
}

export interface AouReferenceRowRecord extends OrganisationOwnedRecord {
  id: string; methodologyVersionId: string; rowKey: string; sourceRowNumber: number; element: string; directionScope?: string[];
  sourceCells: { Element: string; Attributes: string; Directions: string; Colours: string; Shapes: string; Metals: string; Activities: string; Utilites: string; Objects: string };
  sourceCellReferences: { Element: string; Attributes: string; Directions: string; Colours: string; Shapes: string; Metals: string; Activities: string; Utilites: string; Objects: string };
  attributes?: string; directions?: string; colours?: string; shapes?: string; metals?: string;
  activities?: string; utilities?: string; objects?: string; status: AouRowStatus;
  sourceReference: string; contentHash: string; idempotencyKey: string; createdAt: string; createdByActorUserId: string;
  approvedAt?: string; approvedByActorUserId?: string;
  displayCopy?: {
    version: number; status: "DRAFT" | "APPROVED"; attributes?: string; directions?: string; colours?: string;
    shapes?: string; metals?: string; activities?: string; utilities?: string; objects?: string;
    contentHash: string; reason: string; idempotencyKey: string; createdAt: string; createdByActorUserId: string;
    approvedAt?: string; approvedByActorUserId?: string; approvalReason?: string; approvalIdempotencyKey?: string;
  };
}

export interface AouSnapshotRow {
  rowKey: string; element: string; directionScope?: string[]; attributes?: string; directions?: string;
  colours?: string; shapes?: string; metals?: string; activities?: string; utilities?: string; objects?: string;
  sourceReference: string; contentHash: string; copyLayer: "SOURCE" | "APPROVED_DISPLAY";
  displayCopyVersion?: number; displayCopyStatus: "DRAFT" | "APPROVED";
}

export interface AouVerdictReferenceSnapshot {
  methodologyVersionId: string; methodologyContentHash: string; selectedRowIds: string[];
  methodologyVersionLabel: string; sourceVersion: string; sourceWorkbookHash: string; sourceRangeHash: string;
  selectedRows: AouSnapshotRow[];
  appendixRows: AouSnapshotRow[];
  snapshotHash: string;
}

export interface ReportVersionRecord extends OrganisationOwnedRecord {
  id: string;
  caseId: string;
  floorId?: string;
  versionLabel: string;
  isPreview: boolean;
  status: ReportStatus;
  watermarkText?: string;
  idempotencyKey?: string;
  approvals: string[];
  /** Structured evidence is additive so legacy snapshots with approvals[] remain readable. */
  approvalEvidence?: ReportApprovalEvidence[];
  artifact?: ReportArtifactManifest;
}

export interface ReportApprovalEvidence {
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  approvedAt: string;
  comment: string;
  artifactHash: string;
  checkpoint?: "FOUNDER_REVIEWED" | "FOUNDER_APPROVED" | "RELEASED";
}

export interface StageAFloorReviewSnapshotRecord extends OrganisationOwnedRecord {
  id: string; projectId: string; caseId: string; floorId: string; reportId: string;
  reportVersion: string; planVersionId: string; evidenceVersionIds: string[];
  orientationVersionId: string; mappingVersionIds: string[]; evaluationVersionIds: string[];
  methodologyVersionIds: string[]; snapshotHash: string; reportArtifactHash: string;
  reviewerActorUserId: string; reviewerDisplayName: string;
  status: "DRAFT"; reason: string; createdAt: string; idempotencyKey: string;
}

export interface StageAFloorApprovalCheckpointRecord extends OrganisationOwnedRecord {
  id: string; reviewSnapshotId: string; projectId: string; caseId: string; floorId: string; reportId: string;
  checkpoint: "FOUNDER_REVIEWED" | "FOUNDER_APPROVED" | "RELEASED";
  snapshotHash: string; reportArtifactHash: string; actorUserId: string; actorDisplayName: string;
  actorRole: UserRole; reason: string; idempotencyKey: string; occurredAt: string;
}

export interface ReportArtifactManifest {
  schemaVersion: "report-artifact/v1";
  mediaType: "text/html";
  createdAt: string;
  createdBy: { id: string; name: string; role: UserRole };
  templateVersion: string;
  evaluationSnapshotId?: string;
  utilityVerdictIds?: string[];
  aouReferenceSnapshot?: AouVerdictReferenceSnapshot;
  shaktiSnapshotId?: string;
  floorId?: string;
  planVersionId?: string;
  orientationVersionId?: string;
  griddingEvidenceVersionIds?: string[];
  handMarkedEvidenceVersionId?: string;
  manualUtilitySheetDocumentId?: string;
  siteAnalysisId?: string;
  postSiteFindingsId?: string;
  contentHash: string;
  immutable: true;
  downloadPath: string;
  /** Exact client-safe intake fields frozen for v2 hashing/rendering; excludes consent, contact and business metadata. */
  intakeSnapshot?: ClientSafeIntakeSnapshot;
}

export interface ClientSafeIntakeSnapshot {
  mainChallenge: string | null; desiredOutcome: string | null; serviceInterest: VastuServiceType | null;
  propertyType: string | null; propertyStatus: string | null; cityCountry: string | null; constraints: string | null;
}

export interface EvaluationSnapshotRecord extends OrganisationOwnedRecord {
  id: string;
  caseId: string;
  floorId?: string;
  planVersionId?: string;
  orientationVersionId?: string;
  idempotencyKey?: string;
  snapshotName: string;
  sourceVersion: string;
  generatedMatrix: Array<{ code: string; verdict: string; confidence?: number; ruleId?: string; utilityName?: string; directionCode?: string; attributeText?: string; sourceRowNumber?: number; status?: "APPROVED" | "REVIEW_REQUIRED" | "BLOCKED_METHOD_INPUT" }>;
  provenance?: EvaluationProvenance;
}

export interface EvaluationCaseInputs {
  caseId: string;
  caseStatus: VastuCaseStatus;
  orientationLocked: boolean;
  floors: Array<{ id: string; floorLabel: string; status: FloorStatus; locked: boolean }>;
}

export interface EvaluationProvenance {
  inputHash: string;
  outputHash: string;
  sourceContentHash?: string;
  ruleSetFormatVersion?: string;
  algorithmVersion: string;
  methodologyVersionId?: string;
  methodologyContentHash?: string;
  mappingVersion?: string;
  roundingVersion?: string;
  caseInputs: EvaluationCaseInputs;
  selectedRuleIds?: string[];
  sourceRuleRefs?: string[];
  sourceWorkbookHash?: string;
  sourceWorkbookVersion?: string;
  explainabilityStatus?: "APPROVED" | "REVIEW_REQUIRED" | "BLOCKED_METHOD_INPUT";
}

export const utilityVerdictStatuses = ["APPROVED", "REVIEW_REQUIRED", "BLOCKED_METHOD_INPUT"] as const;
export type UtilityVerdictStatus = (typeof utilityVerdictStatuses)[number];
export const utilityGraphVerdicts = ["SUPPRESS", "GROUND", "UPLIFT", "PROMOTE", "BALANCE"] as const;
export type UtilityGraphVerdict = (typeof utilityGraphVerdicts)[number];

export interface UtilityGraphVerdictRecord extends OrganisationOwnedRecord {
  id: string;
  utilityEvaluationSnapshotId: string;
  caseId: string;
  floorId: string;
  planVersionId: string;
  orientationVersionId: string;
  element: string;
  directionSet: string[];
  bars: Array<{ directionCode: string; value: number }>;
  lines: { extension: number; balance: number; exhaustion: number };
  verdict?: UtilityGraphVerdict;
  solutionFraming?: "Disha Balancer" | "Tattva Balancer" | "Disha Activation" | "Tattva Activation" | "Equaliser";
  status: UtilityVerdictStatus;
  triggeredDirections: string[];
  matchedConditions: UtilityGraphVerdict[];
  explanation: string;
  sourceRuleIds: string[];
  sourceRowNumbers: number[];
  methodologyVersionId: string;
  methodologyContentHash: string;
  utilityWorkbookHash: string;
  utilityWorkbookVersion: string;
  inputHash: string;
  outputHash: string;
  idempotencyKey: string;
  createdAt: string;
}

export interface MappingEntry32D {
  code: string;
  label: string;
  element: "Air" | "Fire" | "Water" | "Earth" | "Space";
  direction: string;
  weight: number;
}

export interface MappingEntry16D {
  code: string;
  label: string;
  pairCode: string;
  weight: number;
}

export interface UtilityRule {
  id: string;
  tabName: string;
  zoneCode: string;
  description: string;
  verdict: "GOOD" | "BAD" | "OK-OK";
  confidence: number;
  sourceCsvRow: number;
}

export interface ShaktiSnapshotRecord extends OrganisationOwnedRecord {
  id: string;
  caseId: string;
  floorId?: string;
  planVersionId?: string;
  orientationVersionId?: string;
  idempotencyKey?: string;
  inputValues: number[];
  elementAverages: Record<string, number>;
  rankedVerdicts: Array<{ element: string; score: number }>;
  tieBreakUsed: boolean;
  provenance?: EvaluationProvenance;
}

export interface TimelineEvent extends OrganisationOwnedRecord {
  id: string;
  clientId: string;
  category: string;
  headline: string;
  details: string;
  happenedAt: string;
  actorRole?: UserRole;
  actorId?: string;
  actorName?: string;
}

export interface WhatsAppTemplateRecord {
  id: string;
  slug: string;
  title: string;
  category: string;
  body: string;
  variables: string[];
  active: boolean;
}

export interface WhatsAppTemplateLogRecord {
  id: string;
  clientId: string;
  templateId: string;
  recipientPhone: string;
  status: string;
  sentAt: string;
}
