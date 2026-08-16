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
  propertyContext?: { serviceInterest?: VastuServiceType; propertyType?: string; propertyStatus?: string; areaValue?: number; areaUnit?: string; cityCountry?: string; constraints?: string; floorCount?: number; locationLink?: string; latitude?: number; longitude?: number; locationVersion?: number };
  needs?: { mainChallenge?: string; desiredOutcome?: string; urgency?: string };
  consent: { version: "uchit-intake/v1"; contact?: boolean; accuracy?: boolean; confidentiality?: boolean; confirmedAt?: string };
  created: AssessmentAudit; updated: AssessmentAudit;
}

/** The validated property-context payload is intentionally shared by the
 * legacy client profile and the additive case-scoped successor. */
export type PropertyContext = NonNullable<ClientIntakeProfile["propertyContext"]>;

export const propertyContextProvenances = ["CASE_SCOPED", "LEGACY_CLIENT_FALLBACK", "AMBIGUOUS_LEGACY_CONTEXT", "NO_PROPERTY_CONTEXT"] as const;
export type PropertyContextProvenance = (typeof propertyContextProvenances)[number];

export interface CasePropertyContextRecord extends OrganisationOwnedRecord {
  id: string;
  clientId: string;
  caseId: string;
  projectId?: string;
  propertyContext: PropertyContext;
  version: number;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
  supersededAt?: string;
  status: "CURRENT" | "SUPERSEDED";
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

export interface LeadSourceProfile {
  format: "VASTU_WITH_YOGESH_APPLY_LEADS";
  sourceRowHash: string;
  rawPhone?: string;
  dob?: string;
  sourceAssignedTo?: string;
  sourceDeletedAt?: string;
  propertyStage?: "new" | "existing";
  sourceCreatedAt: string;
  sourceLastSubmittedAt: string;
  sourceSubmissionCount: number;
  landingPage?: string;
  referrer?: string;
  sourceNote?: string;
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
  serviceInterest?: VastuServiceType;
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
  sourceProfile?: LeadSourceProfile;
  syncStatus?: "RECEIVED" | "APPLIED" | "REVIEW_REQUIRED" | "FAILED";
  lastSyncedAt?: string;
  sourceEventId?: string;
  country?: string;
  timeZone?: string;
}

export const mediaAssetCategories = ["BRAND", "COMPANY_DOCUMENT", "QUALIFICATION_FORM", "BROCHURE", "PROPOSAL_TEMPLATE", "MESSAGE_TEMPLATE", "LEGAL_POLICY", "TRAINING_REFERENCE", "OTHER"] as const;
export type MediaAssetCategory = (typeof mediaAssetCategories)[number];
export const mediaAssetStatuses = ["DRAFT", "FOUNDER_APPROVED", "ACTIVE", "SUPERSEDED", "ARCHIVED"] as const;
export type MediaAssetStatus = (typeof mediaAssetStatuses)[number];
export type QualificationKind = "RESIDENTIAL" | "COMMERCIAL" | "HYBRID";
export type CommunicationChannel = "WHATSAPP" | "EMAIL";
export type CommunicationChannelState = "NOT_PREPARED" | "PREPARED" | "OPENED";

export interface LeadProfileVersionRecord extends OrganisationOwnedRecord {
  id: string; leadId: string; clientId?: string; version: number;
  canonicalSnapshot: { fullName: string; email: string; phone: string; city: string; country?: string; timeZone?: string; primaryServiceInterest?: VastuServiceType };
  priorSnapshotHash?: string; snapshotHash: string; requestHash: string; reason: string; actorUserId: string; createdAt: string; idempotencyKey: string;
}

export interface MediaAssetRecord extends OrganisationOwnedRecord {
  id: string; category: MediaAssetCategory; audience: "FOUNDER_PRIVATE" | "CLIENT_SENDABLE"; serviceApplicability: Array<VastuServiceType | "RESIDENTIAL" | "COMMERCIAL" | "HYBRID">;
  title: string; description: string; tags: string[]; activeVersionId?: string; createdAt: string;
}

export interface MediaAssetVersionRecord extends OrganisationOwnedRecord {
  id: string; assetId: string; version: number; filename: string; privateObjectKey: string; mimeType: "application/pdf" | "image/png" | "image/jpeg" | "image/webp";
  sizeBytes: number; checksumSha256: string; pageCount: number; status: MediaAssetStatus; clientSendable: boolean; statutoryPurpose?: "LOGO" | "SIGNATURE";
  widthPixels?: number; heightPixels?: number; hasAlphaChannel?: boolean;
  brandRole?: "PRIMARY_DARK_PREMIUM" | "LIGHT_MONOCHROME_PRINT" | "FOUNDER_SIGNATURE";
  uploadedByActorUserId: string; uploadedAt: string; approvedByActorUserId?: string; approvedAt?: string;
  activatedByActorUserId?: string; activatedAt?: string;
  supersedesVersionId?: string; supersededByVersionId?: string; reason: string; registrationHash: string;
}

export const documentFamilies = ["FOUNDER_COMMERCIAL_PROPOSAL", "FOUNDER_STATUTORY_DOCUMENT", "FOUNDER_FLOOR_REPORT", "VASTU_REMEDY_REPORT"] as const;
export type DocumentFamily = (typeof documentFamilies)[number];
export type BrandingLifecycleStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type BrandLogoPosition = "TOP_LEFT" | "TOP_CENTER" | "TOP_RIGHT";
export type BrandAlignment = "LEFT" | "CENTER" | "RIGHT";

export interface BrandingMediaReference {
  assetId: string; assetVersionId: string; checksumSha256: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
}

export interface BrandLogoConfig {
  enabled: boolean; media?: BrandingMediaReference; position: BrandLogoPosition;
  widthPercent: number; preserveAspectRatio: true;
}

export interface BrandBackdropConfig {
  enabled: boolean; media?: BrandingMediaReference; fit: "FIT" | "FILL";
  opacity: number; alignment: BrandAlignment; pageApplicability: "ALL" | "PREFIX_SUFFIX" | "BODY";
}

export interface BrandHeaderConfig {
  enabled: boolean; showLogo: boolean; showBrandName: boolean; showDocumentTitle: boolean;
  showConsumerReferences: boolean; divider: boolean; alignment: BrandAlignment;
  size: "COMPACT" | "STANDARD" | "SPACIOUS";
}

export interface BrandFooterConfig {
  enabled: boolean; showPageNumber: boolean; showOrganisationText: boolean; showContactLine: boolean;
  showConfidentialityLine: boolean; divider: boolean; alignment: BrandAlignment;
}

export interface BrandStandardTextConfig {
  organisationNote: string; confidentialityStatement: string; disclaimer: string;
  introductoryText: string; contactInformation: string;
}

export interface OrganisationBrandProfileRecord extends OrganisationOwnedRecord {
  id: string; stableProfileId: string; version: number; status: BrandingLifecycleStatus;
  brandDisplayName: string; primaryLogo: BrandLogoConfig; secondaryLogo?: BrandLogoConfig;
  defaultBackdrop: BrandBackdropConfig; defaultHeader: BrandHeaderConfig; defaultFooter: BrandFooterConfig;
  contactText: string; confidentialityLegalText: string;
  colours: { primary: string; secondary: string; accent: string; paper: string; text: string };
  sharedApprovedMediaVersionIds: string[]; source: "CENTRAL_ADMIN" | "LEGACY_EQUIVALENT_BOOTSTRAP";
  legacySourceRefs: string[]; createdAt: string; updatedAt: string; activatedAt?: string; archivedAt?: string;
  createdByActorUserId: string; updatedByActorUserId: string; activatedByActorUserId?: string; archivedByActorUserId?: string;
  reason: string; idempotencyKey: string; requestHash: string; recordVersion: number;
}

export interface DocumentTemplatePageRecord {
  id: string; internalTitle: string; active: boolean; order: number; media: BrandingMediaReference;
}

export interface DocumentTemplateRecord extends OrganisationOwnedRecord {
  id: string; stableTemplateId: string; family: DocumentFamily; name: string; version: number;
  status: BrandingLifecycleStatus; isDefault: boolean; brandProfileId: string; brandProfileVersion: number;
  logoRule: { mode: "INHERIT" | "HIDE" | "OVERRIDE"; override?: BrandLogoConfig };
  backdropRule: { mode: "INHERIT" | "HIDE" | "OVERRIDE"; override?: BrandBackdropConfig };
  headerOverride?: Partial<BrandHeaderConfig>; footerOverride?: Partial<BrandFooterConfig>;
  prefixPages: DocumentTemplatePageRecord[]; suffixPages: DocumentTemplatePageRecord[];
  standardTextOverride: Partial<BrandStandardTextConfig>; visibleDocumentFields: string[];
  source: "CENTRAL_ADMIN" | "LEGACY_EQUIVALENT_BOOTSTRAP"; legacySourceRefs: string[];
  createdAt: string; updatedAt: string; activatedAt?: string; archivedAt?: string; effectiveAt?: string;
  createdByActorUserId: string; updatedByActorUserId: string; activatedByActorUserId?: string; archivedByActorUserId?: string;
  reason: string; idempotencyKey: string; requestHash: string; recordVersion: number;
}

export interface DocumentTemplateSnapshot {
  schemaVersion: "document-template-snapshot/v1"; source: "CENTRAL" | "LEGACY_COMPATIBILITY";
  organisationId: string; family: DocumentFamily;
  brandProfile: { id: string; stableProfileId: string; version: number };
  documentTemplate: { id: string; stableTemplateId: string; version: number; name: string };
  brandDisplayName: string; logo: BrandLogoConfig; secondaryLogo?: BrandLogoConfig;
  backdrop: BrandBackdropConfig; header: BrandHeaderConfig; footer: BrandFooterConfig;
  colours: OrganisationBrandProfileRecord["colours"]; prefixPages: DocumentTemplatePageRecord[]; suffixPages: DocumentTemplatePageRecord[];
  standardText: BrandStandardTextConfig; documentFields: Record<string, string>; snapshotHash: string;
}

export interface BrandingAuditEventRecord extends OrganisationOwnedRecord {
  id: string; entityType: "BRAND_PROFILE" | "DOCUMENT_TEMPLATE" | "LEGACY_BRANDING";
  entityId: string; action: string; family?: DocumentFamily; actorUserId: string; actorRole: UserRole;
  reason: string; beforeHash?: string; afterHash?: string; happenedAt: string; idempotencyKey: string; requestHash: string;
}

export interface LegacyBrandingSourceRecord extends OrganisationOwnedRecord {
  id: string; sourceKey: string; owningModule: string; sourceFiles: string[];
  disposition: "MIGRATED" | "SUPERSEDED" | "COMPATIBILITY_ADAPTED" | "RETAINED_READ_ONLY" | "RETIRED";
  writable: false; centralProfileId?: string; centralTemplateId?: string; notes: string;
  recordedAt: string; recordedByActorUserId: string; recordVersion: number;
}

export const imageTransformationTypes = ["CROP", "RESIZE", "UPSCALE", "ROTATE", "BRIGHTNESS", "CONTRAST", "WHITESPACE_TRIM", "TYPE_CONVERT", "BACKGROUND_REMOVE"] as const;
export type ImageTransformationType = (typeof imageTransformationTypes)[number];
export type ImageProcessingStatus = "QUEUED" | "PROCESSING" | "SUCCEEDED" | "FAILED";
export type ImageOutputFormat = "PNG" | "JPEG" | "WEBP";
export type ImageDerivativeStatus = "AVAILABLE" | "RETIRED";
export type ImageDerivativePurpose = "CANONICAL" | "WEB_EDITOR" | "PRINT_REPORT";
export type ImageTransformationParameters = Record<string, string | number | boolean | null>;

export interface ImageProcessingTaskRecord extends OrganisationOwnedRecord {
  id: string; batchId?: string; retryOfTaskId?: string; sourceVersionId: string; sourceAssetId: string;
  transformationType: ImageTransformationType; normalizedParameters: ImageTransformationParameters;
  outputFormat: ImageOutputFormat; purpose: ImageDerivativePurpose; implementationVersion: string;
  status: ImageProcessingStatus; attempt: number; derivativeId?: string; errorReason?: string;
  requestedAt: string; startedAt?: string; completedAt?: string; requestedByActorUserId: string;
  idempotencyKey: string; requestHash: string; deduplicationKey: string; recordVersion: number;
}

export interface ImageDerivativeRecord extends OrganisationOwnedRecord {
  id: string; sourceVersionId: string; parentVersionId: string; rootVersionId: string;
  outputAssetId: string; outputVersionId: string; taskId: string;
  transformationType: ImageTransformationType; normalizedParameters: ImageTransformationParameters;
  implementationVersion: string; purpose: ImageDerivativePurpose; outputFormat: ImageOutputFormat;
  outputMimeType: "image/png" | "image/jpeg" | "image/webp"; widthPixels: number; heightPixels: number;
  hasAlphaChannel: boolean; checksumSha256: string; sizeBytes: number; deduplicationKey: string;
  status: ImageDerivativeStatus; createdAt: string; createdByActorUserId: string;
  retiredAt?: string; retiredByActorUserId?: string; retirementReason?: string; recordVersion: number;
}

export interface ImageProcessingBatchRecord extends OrganisationOwnedRecord {
  id: string; sourceVersionIds: string[]; transformationType: ImageTransformationType;
  normalizedParameters: ImageTransformationParameters; outputFormat: ImageOutputFormat;
  purpose: ImageDerivativePurpose; taskIds: string[]; status: "QUEUED" | "PROCESSING" | "SUCCEEDED" | "PARTIAL" | "FAILED";
  requestedAt: string; completedAt?: string; requestedByActorUserId: string;
  idempotencyKey: string; requestHash: string; recordVersion: number;
}

export interface ImageUtilityAuditEventRecord extends OrganisationOwnedRecord {
  id: string; action: string; sourceVersionId: string; derivativeId?: string; taskId?: string; batchId?: string;
  actorUserId: string; actorRole: UserRole; transformationSummary: string; reason: string;
  occurredAt: string; idempotencyKey?: string; requestHash?: string; beforeHash?: string; afterHash?: string;
}

export interface SecureAccessGrantRecord extends OrganisationOwnedRecord {
  id: string; purpose: "BROCHURE" | "QUALIFICATION_PDF" | "QUALIFICATION_FORM" | "BOOKING_RESPONSE";
  leadId: string; clientId?: string; assetVersionId?: string; formDefinitionId?: string; bookingId?: string;
  tokenHash: string; expiresAt: string; revokedAt?: string; replacedByGrantId?: string; openedAt?: string; createdAt: string; createdByActorUserId: string;
}

export interface CommunicationPreparationRecord extends OrganisationOwnedRecord {
  id: string; leadId: string; clientId?: string; prospectiveProjectIds: string[]; templateKey: string; templateVersion: number;
  channel: CommunicationChannel; state: CommunicationChannelState; recipientHash: string; renderedContentHash: string;
  assetVersionIds: string[]; formDefinitionId?: string; bookingId?: string; grantIds: string[];
  renderedTimeZoneSnapshot?: string; manualNote?: string; preparedAt: string; openedAt?: string; actorUserId: string; idempotencyKey: string; requestHash: string;
}

export interface QualificationQuestionRecord {
  id: string; sourcePage: number; section: string; prompt: string; helpText?: string;
  kind: "TEXT" | "DATE" | "SINGLE" | "MULTI" | "CONSENT"; choices?: string[]; required: boolean; shared?: boolean;
}

export interface QualificationFormDefinitionRecord extends OrganisationOwnedRecord {
  id: string; kind: QualificationKind; version: number; title: string; sourceAssetVersionId: string; sourceChecksumSha256: string;
  questions: QualificationQuestionRecord[]; definitionHash: string; status: "DRAFT" | "FOUNDER_APPROVED" | "ACTIVE" | "RETIRED"; createdAt: string; approvedAt?: string; approvedByActorUserId?: string;
}

export interface QualificationInvitationRecord extends OrganisationOwnedRecord {
  id: string; leadId: string; clientId: string; formDefinitionId: string; grantId: string; status: "OPEN" | "SUBMITTED" | "EXPIRED" | "REPLACED";
  selectedServices: Array<"RESIDENTIAL" | "COMMERCIAL">; createdAt: string; expiresAt: string; submittedAt?: string; requestHash: string; recordVersion: number;
}

export interface QualificationResponseVersionRecord extends OrganisationOwnedRecord {
  id: string; invitationId: string; clientId: string; formDefinitionId: string; version: number; status: "DRAFT" | "SUBMITTED" | "SUPERSEDED";
  answers: Record<string, unknown>; answersHash: string; selectedServices: Array<"RESIDENTIAL" | "COMMERCIAL">; secondaryInterestSelected: boolean;
  sourceQuestionIds: string[]; predecessorResponseId?: string; savedAt: string; submittedAt?: string; recordVersion: number;
}

export interface ProspectiveProjectRecord extends OrganisationOwnedRecord {
  id: string; clientId: string; leadId: string; responseVersionId: string; kind: "RESIDENTIAL" | "COMMERCIAL"; status: "QUALIFICATION_SUBMITTED" | "REVIEW_PENDING" | "COMMERCIAL_PENDING" | "CONVERTED";
  serviceType?: VastuServiceType; caseId?: string; displayName?: string; variation?: string; propertyType?: "Residential" | "Commercial" | "Factory" | "Shop" | "Hospital" | "Hotel" | "Temple"; propertyLocation?: string; floorCount?: number; importantNotes?: string; createdAt: string; recordVersion: number; idempotencyKey?: string;
}

export interface FounderReviewBookingRecord extends OrganisationOwnedRecord {
  id: string; clientId: string; prospectiveProjectIds: string[]; responseVersionId: string; formDefinitionId: string;
  startsAt: string; timeZone: string; durationMinutes: 30; bufferMinutes: 15; renderedClientTime: string; renderedIstTime?: string;
  status: "ASSIGNED" | "CLIENT_CONFIRMED" | "RESCHEDULE_REQUESTED" | "MEETING_SETUP_FAILED" | "CONFIRMED" | "CANCELLED";
  confirmationGrantId: string; assignedByActorUserId: string; assignedAt: string; confirmedAt?: string; priorBookingId?: string; reason?: string;
  idempotencyKey: string; assignmentHash: string; recordVersion: number;
}

export interface ZoomMeetingBindingRecord extends OrganisationOwnedRecord {
  id: string; bookingId: string; provider: "ZOOM"; providerMeetingId: string; privateJoinMetadataCiphertext: string;
  hostUserEmail: "iyogesh2020@gmail.com"; oauthMode: "SERVER_TO_SERVER_OAUTH"; scopeSnapshot: string[];
  status: "ACTIVE" | "RETIRED" | "FAILED"; createdAt: string; retiredAt?: string; idempotencyKey: string; recordVersion: number;
}

export interface FounderReminderTaskRecord extends OrganisationOwnedRecord {
  id: string; bookingId: string; threshold: "24H" | "2H"; dueAt: string; status: "PENDING" | "PREPARED" | "OPENED" | "SKIPPED" | "CANCELLED";
  whatsappState: CommunicationChannelState; emailState: CommunicationChannelState; templateKey: string; templateVersion: number; createdAt: string; recordVersion: number;
}

export type FounderEngagementClassification = "STANDARD_PAID" | "SPECIAL_DISCOUNTED" | "INTERNAL_COMPLIMENTARY";
export type FounderProposalStatus = "DRAFT" | "SUPER_ADMIN_REVIEWED" | "SUPER_ADMIN_APPROVED" | "SENT" | "ACCEPTED" | "CHANGES_REQUESTED" | "DECLINED" | "EXPIRED" | "SUPERSEDED";
export type FounderLegalPolicyKind = "PROFESSIONAL_BOUNDARIES" | "ACCEPTANCE_DECLARATION" | "CANCELLATION_REFUND_DELAY" | "INVOICE_STATUTORY_CONFIG";
export type FounderLegalPolicyStatus = "DRAFT" | "FOUNDER_APPROVED" | "ACTIVE" | "SUPERSEDED" | "ARCHIVED";
export type FounderBalanceDeadlineStatus = "NOT_DUE" | "DUE" | "PAID" | "OVERDUE" | "EXTENDED" | "WAIVED";
export type FounderInvoiceStatus = "NOT_DUE" | "DUE" | "ISSUED" | "OVERDUE" | "GENERATION_FAILED";
export type FounderProposalStep = 1 | 2 | 3 | 4 | 5 | 6;

export interface FounderCommercialPolicyVersionRecord extends OrganisationOwnedRecord {
  id: string; version: number; status: "ACTIVE" | "SUPERSEDED";
  referenceFeePaise: number; referenceAdvancePaise: number; defaultGstBasisPoints: number;
  balanceDeadlineDays: 7; advanceInvoiceSlaMinutes: 60;
  refundPolicy: "NO_REFUNDS";
  reason: string; actorUserId: string; createdAt: string; idempotencyKey: string; requestHash: string;
}

export interface FounderCommercialLegalPolicyRecord extends OrganisationOwnedRecord {
  id: string; kind: FounderLegalPolicyKind; version: number; status: FounderLegalPolicyStatus;
  title: string; exactText: string; contentHash: string;
  configuration?: { acceptanceCheckboxLabel?: string; typedConfirmationPhrase?: string; typedConfirmationMode?: "FULL_NAME"; invoicePrefix?: string; startingSequence?: number; jurisdictionLabel?: string; requiredFields?: string[]; refundPolicy?: "NO_REFUNDS" | "LAW_PRESERVING_REFUND_ASSESSMENT"; creditPolicy?: "NO_CREDITS_VOUCHERS_OR_FEE_OFFSETS" | "NO_AUTOMATIC_CREDITS_OR_VOUCHERS"; correctionPolicyApproval?: "REVIEW_REQUIRED_ACCOUNTANT" | "NORMAL_ACCOUNTING_PROCESS" };
  reason: string; createdByActorUserId: string; createdAt: string; approvedByActorUserId?: string; approvedAt?: string; activatedAt?: string; supersedesPolicyId?: string; idempotencyKey: string; requestHash: string;
}

export interface FounderProposalScopeItem { id: string; order: number; title: string; status: "INCLUDED" | "OPTIONAL_ADD_ON" | "EXCLUDED"; prospectiveProjectId: string; floorIds: string[]; note?: string; }
export interface FounderProposalDeliverable { id: string; order: number; name: string; status: "INCLUDED" | "OPTIONAL_ADD_ON"; prospectiveProjectId: string; floorIds: string[]; deliveryFormat: string; expectedStage: string; description: string; clientDependency: string; }

export interface FounderProposalTemplateVersionRecord extends OrganisationOwnedRecord {
  id: string; serviceType: VastuServiceType; version: number; name: string; kind: "DEFAULT" | "REUSABLE_VARIANT";
  status: "DRAFT" | "ACTIVE" | "SUPERSEDED" | "ARCHIVED"; scopeItems: FounderProposalScopeItem[]; deliverables: FounderProposalDeliverable[];
  sourceProposalVersionId?: string; supersedesTemplateId?: string; contentHash: string; reason: string; actorUserId: string; createdAt: string; activatedAt?: string; idempotencyKey: string; requestHash: string;
}

export interface FounderCommercialTermsSnapshot {
  engagementClassification: FounderEngagementClassification;
  professionalFeePaise: number; referenceFeePaise: number; gstReferenceBasisPoints: number; gstAppliedBasisPoints: number;
  gstAmountPaise: number; totalPayablePaise: number; agreedAdvancePaise: number; remainingBalancePaise: number;
  feeDeviationReason?: string; classificationReason?: string; gstDeviationReason?: string; advanceExceptionReason?: string; advanceExceptionApproved: boolean;
  paymentMilestones: Array<{ id: string; label: string; amountPaise: number; trigger: string }>;
}

export interface FounderProposalContentSnapshot {
  clientProject: { clientName: string; clientId: string; prospectiveProjectId: string; projectKind: "RESIDENTIAL" | "COMMERCIAL"; serviceType: VastuServiceType; propertyType?: string; propertyLocation?: string; knownFloorCount?: number; primaryRequirement?: string; proposalDate: string };
  requirements: { qualificationResponseVersionId: string; qualificationResponseHash: string; exactAnswerSnapshotHash: string; refinedSummary?: string; refinedByActorUserId?: string; refinedAt?: string };
  scopeItems: FounderProposalScopeItem[]; deliverables: FounderProposalDeliverable[];
  interactions: { includedReviewRounds: number; includedPresentationCalls: number; clarificationPeriodDays: number; expectedResponseTime: string; additionalInteractionTreatment: string };
  timeline: { expectedCommencement: string; estimatedDateRange: string; milestones: string[]; prerequisites: string[]; clientDependencies: string[]; pauseOrExtensionConditions: string[]; isEstimate: true };
  commercial: FounderCommercialTermsSnapshot;
  projectExclusions: string[];
  policyBindings: { professionalBoundariesPolicyId?: string; acceptanceDeclarationPolicyId?: string; cancellationPolicyId?: string; cancellationPolicyVersion?: number; cancellationPolicyContentHash?: string; commercialPolicyId: string; templateVersionId?: string; brochureAssetVersionId?: string; brochureAssetKey?: string; brochureChecksumSha256?: string };
  nextSteps: { advanceRequired: boolean; balanceAfterAdvanceDeadline: true; paymentProofRequiresConfirmation: true; reportGatesRemainServerEnforced: true };
}

export interface FounderProposalVersionRecord extends OrganisationOwnedRecord {
  id: string; proposalId: string; version: number; clientId: string; prospectiveProjectId: string; serviceType: VastuServiceType;
  status: FounderProposalStatus; currentStep: FounderProposalStep; content: FounderProposalContentSnapshot; contentHash: string;
  validityEndsAt?: string; predecessorVersionId?: string; successorVersionId?: string; createdAt: string; createdByActorUserId: string;
  reviewedAt?: string; approvedAt?: string; sentAt?: string; acceptedAt?: string; recordVersion: number; idempotencyKey: string; requestHash: string;
}

export interface FounderProposalApprovalRecord extends OrganisationOwnedRecord {
  id: string; proposalVersionId: string; checkpoint: "SUPER_ADMIN_REVIEWED" | "SUPER_ADMIN_APPROVED"; actorUserId: string; actorName: string; actorRole: "SUPER_ADMIN"; reason: string; contentHash: string; createdAt: string; idempotencyKey: string;
}

export interface FounderProposalArtifactRecord extends OrganisationOwnedRecord {
  id: string; proposalVersionId: string; proposalContentHash: string; clientProjectionHash: string; artifactHashSha256: string; privateObjectKey: string;
  mimeType: "application/pdf"; sizeBytes: number; pageCount: number; rendererVersion: string; generatedAt: string; idempotencyKey: string; recordVersion: number;
  documentTemplateSnapshot?: DocumentTemplateSnapshot;
}

export interface FounderProposalGrantRecord extends OrganisationOwnedRecord {
  id: string; proposalVersionId: string; clientId: string; prospectiveProjectId: string; tokenHash: string; expiresAt: string; revokedAt?: string; replacedByGrantId?: string; openedAt?: string; createdAt: string; createdByActorUserId: string; recordVersion: number;
}

export interface FounderProposalResponseRecord extends OrganisationOwnedRecord {
  id: string; proposalVersionId: string; proposalContentHash: string; artifactHashSha256: string; clientId: string; prospectiveProjectId: string;
  response: "ACCEPTED" | "CHANGES_REQUESTED" | "DECLINED"; fullName: string; acceptanceChecked?: boolean; typedConfirmationHash?: string;
  organisationName?: string; designation?: string; requestedChanges?: string; respondedAt: string; idempotencyKey: string; requestHash: string; recordVersion: number;
}

export interface FounderCommercialPaymentConfirmationRecord extends OrganisationOwnedRecord {
  id: string; proposalVersionId: string; clientId: string; prospectiveProjectId: string; paymentId: string; type: "ADVANCE" | "BALANCE";
  amountPaise: number; confirmedAt: string; confirmedByActorUserId: string; proposalContentHash: string; idempotencyKey: string; requestHash: string; recordVersion: number;
}

export interface FounderBalanceDeadlineRecord extends OrganisationOwnedRecord {
  id: string; proposalVersionId: string; clientId: string; prospectiveProjectId: string; advancePaymentConfirmationId?: string;
  advanceConfirmedAt?: string; dueAt?: string; status: FounderBalanceDeadlineStatus; remainingAmountPaise: number;
  commercialPolicyId: string; commercialPolicyVersion: number; engagementClassification: FounderEngagementClassification;
  priorDueAt?: string; exceptionReason?: string; exceptionActorUserId?: string; exceptionAt?: string; recordVersion: number;
}

export interface FounderCommercialInvoiceRecord extends OrganisationOwnedRecord {
  id: string; proposalVersionId: string; clientId: string; prospectiveProjectId: string; advancePaymentConfirmationId?: string;
  status: FounderInvoiceStatus; dueAt?: string; amountReceivedPaise: number; gstBasisPoints: number; gstAmountSnapshotPaise: number; remainingBalancePaise: number;
  invoicePolicyId?: string; invoiceNumber?: string; artifactHashSha256?: string; privateObjectKey?: string; issuedAt?: string; issuedByActorUserId?: string;
  failureCode?: string; failureAt?: string; idempotencyKey: string; requestHash: string; recordVersion: number;
}

export type FounderCommercialPolicyEventType = "CLIENT_CANCELLATION_REQUESTED" | "CLIENT_DEPENDENCY_DELAY_RECORDED" | "UCHIT_RESCHEDULE_RECORDED";
export interface FounderCommercialPolicyEventRecord extends OrganisationOwnedRecord {
  id: string; clientId: string; prospectiveProjectId: string; proposalVersionId?: string;
  eventType: FounderCommercialPolicyEventType; reason: string; revisedEstimate?: string; replacementDateOrSlot?: string;
  noRefundOrCreditEntitlement: true; paymentHistoryPreserved: true; createdByActorUserId: string; createdAt: string;
  idempotencyKey: string; requestHash: string; recordVersion: 1;
}

export type FounderStatutoryDocumentKind = "RECEIPT_VOUCHER" | "PROFORMA" | "TAX_INVOICE" | "INTERNAL_NON_COMMERCIAL";
export type FounderStatutoryDocumentStatus = "NOT_DUE" | "DUE" | "READY" | "REVIEW_REQUIRED" | "BLOCKED" | "OVERDUE" | "ISSUED" | "GENERATION_FAILED" | "VOID";
export type FounderTaxMode = "CGST_SGST" | "IGST" | "ZERO" | "REVIEW_REQUIRED";
export type FounderAccountantApprovalState = "REVIEW_REQUIRED_ACCOUNTANT" | "ACCOUNTANT_APPROVED" | "SUPERSEDED";

export interface FounderStatutoryPolicyVersionRecord extends OrganisationOwnedRecord {
  id: string; version: number; status: "DRAFT" | "FOUNDER_APPROVED" | "ACTIVE" | "SUPERSEDED" | "ARCHIVED";
  legalBusinessName: "Uchit Vastu India"; gstin: "03AEVPH1562F1ZM"; registeredAddress: string;
  email: "info@uchitvastu.com"; phoneE164: "+919115530756"; phoneDisplay: "+91 91155 30756";
  authorisedSignatory: "Yogesh K Hora"; designation: "Proprietor"; sac: "9983";
  lineDescription: "Professional Vastu Consultancy Services"; defaultGstBasisPoints: 1800;
  reverseChargeText: "Tax payable under reverse charge: No";
  placeOfSupplyBasis: "CLIENT_LOCATION"; operationalPlaceOfSupplySelection: "CLIENT_LOCATION_ONLY"; placeOfSupplyApproval: FounderAccountantApprovalState;
  activePlaceOfSupplyPolicy: "FIXED_LUDHIANA_PUNJAB";
  placeOfSupplyDisplay: "Ludhiana, Punjab, India"; outsideIndiaBillingLabel: "Cash Sale"; taxTreatment: "CGST_SGST_9_9_ALL_CLIENT_LOCATIONS";
  serviceTimingApproval: FounderAccountantApprovalState; correctionPolicyApproval: FounderAccountantApprovalState;
  receiptVoucherTrigger: "CONFIRMED_ADVANCE"; receiptVoucherSlaMinutes: 60;
  proformaPolicy: "AFTER_CONFIRMED_ADVANCE_ONLY"; taxInvoiceTrigger: "CONFIRMED_FULL_PAYMENT";
  refundPolicy: "NO_REFUNDS"; correctionPosture: "EXCEPTION_ONLY_ACCOUNTANT_APPROVAL";
  purchaseSideDebitNotesInScope: false; opexTrackingScope: "OUTSIDE_CLIENT_INVOICE_MODULE";
  serviceTimingPolicyText?: string; accountantApprovalReference?: string; accountantApprovedServiceTypes?: VastuServiceType[];
  createdByActorUserId: string; createdAt: string; approvedAt?: string; activatedAt?: string;
  reason: string; idempotencyKey: string; requestHash: string; recordVersion: number;
}

export interface FounderBillingProfileVersionRecord extends OrganisationOwnedRecord {
  id: string; clientId: string; prospectiveProjectId: string; version: number;
  billingLegalName: string; billingAddress: string; billingState: string; billingPin: string;
  recipientRegisteredForGst: boolean; recipientGstin?: string; clientLocationCountry: string;
  clientLocationState?: string; propertyLocation?: string; serviceLocation?: string; timeZone: string;
  createdByActorUserId: string; createdAt: string; reason: string; predecessorId?: string;
  idempotencyKey: string; requestHash: string; recordVersion: number;
}

export interface FounderStatutorySequenceReservationRecord extends OrganisationOwnedRecord {
  id: string; documentKind: Exclude<FounderStatutoryDocumentKind, "INTERNAL_NON_COMMERCIAL">;
  fiscalYear: string; fiscalYearCompact: string; sequence: number; documentNumber: string;
  status: "RESERVED" | "ISSUED" | "FAILED" | "VOID"; reservedAt: string; reservedByActorUserId: string;
  documentId: string; failureCode?: string; idempotencyKey: string; requestHash: string; recordVersion: number;
}

export interface FounderStatutoryDocumentRecord extends OrganisationOwnedRecord {
  id: string; kind: FounderStatutoryDocumentKind; status: FounderStatutoryDocumentStatus;
  proposalVersionId: string; proposalContentHash: string; clientId: string; prospectiveProjectId: string; caseId?: string;
  advancePaymentConfirmationId?: string; balancePaymentConfirmationIds: string[]; triggeringPaymentId?: string;
  dueAt?: string; serviceSuppliedAt?: string; statutoryDeadlineAt?: string; issuedAt?: string; issuedByActorUserId?: string;
  policyVersionId?: string; billingProfileVersionId?: string; documentNumber?: string; sequenceReservationId?: string;
  professionalFeePaise: number; gstBasisPoints: number; cgstPaise: number; sgstPaise: number; igstPaise: number;
  gstTotalPaise: number; roundOffPaise: number; totalPayablePaise: number; amountReceivedPaise: number;
  remainingBalancePaise: number; amountInWords: string; taxMode: FounderTaxMode;
  balanceDueAt?: string; balanceDeadlineStatus?: FounderBalanceDeadlineStatus;
  logoAssetVersionId?: string; logoChecksumSha256?: string; signatureAssetVersionId?: string; signatureChecksumSha256?: string;
  artifactHashSha256?: string; privateObjectKey?: string; rendererVersion?: string; failureCode?: string; failureAt?: string;
  documentTemplateSnapshot?: DocumentTemplateSnapshot;
  idempotencyKey: string; requestHash: string; recordVersion: number;
}

export interface FounderCommercialAuditEventRecord extends OrganisationOwnedRecord {
  id: string; eventType: string; entityType: string; entityId: string; actorUserId: string; happenedAt: string; reason: string;
  proposalVersionId?: string; prospectiveProjectId?: string; beforeHash?: string; afterHash?: string; idempotencyKey: string; requestHash?: string;
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
  /** Additive closed evaluation architecture discriminator; absent legacy records resolve to LEGACY. */
  evaluationArchitectureVersion?: "LEGACY" | "V1";
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
  /** Required when one protected file is deliberately confirmed for both distinct marked layers. */
  dualPurposeMarkedLayersConfirmed?: boolean;
  protectedFileRef: string; fullColour: boolean; status: "CURRENT" | "SUPERSEDED";
  idempotencyKey: string; createdAt: string; supersededAt?: string;
}

export interface OrientationVersionRecord extends OrganisationOwnedRecord {
  id: string; projectId: string; caseId: string; exactDegree: number;
  googleEarthEvidenceVersionId: string; status: "DRAFT" | "LOCKED" | "SUPERSEDED";
  lockedAt?: string; lockedByActorUserId?: string; lockReason?: string;
  idempotencyKey: string; createdAt: string;
}

export interface D8OrientationSnapshotV1 extends OrganisationOwnedRecord {
  id: string; caseId: string; projectId: string; /** Optional source floor only; never authority scope. */ floorId?: string; sourceFloorId?: string; sourcePlanVersionId?: string; architectureVersion: "V1";
  status?: "DRAFT" | "FINALIZED" | "SUPERSEDED"; supersedesVersionId?: string; finalizedAt?: string;
  /** The locked OrientationVersion that supplied the exact degree/evidence. */
  sourceOrientationVersionId?: string;
  orientationEvidenceVersionId: string; exactDegree: number; normalizedDegree: number; direction: "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
  resultCode: "D8_RESOLVED"; rulesetVersion: string; catalogHash: string; methodologyVersionId?: string; methodologyContentHash?: string;
  inputHash: string; outputHash: string; idempotencyKey: string; requestHash: string; createdAt: string; createdByActorUserId: string;
}

export interface DirectionalInputModifierV1 { modifier: "CUT_OUT" | "EXTENSION" | "MARGA_VEDHA" | "OPEN_SIDE" | "CORNER"; direction?: "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW"; confirmed?: boolean; openSidePattern?: string; cornerImpact?: boolean; result: unknown; }
export interface DirectionalInputVersionV1 extends OrganisationOwnedRecord {
  id: string; caseId: string; projectId: string; floorId: string; architectureVersion: "V1";
  modifierFindings: DirectionalInputModifierV1[]; noConfirmedD8Modifiers: boolean;
  circulationState: "CLEAR" | "PARTIALLY_RESTRICTED" | "BLOCKED" | "OVERACTIVE" | "FRAGMENTED";
  methodologyVersionId?: string; methodologyContentHash?: string; status: "DRAFT" | "FINALIZED" | "SUPERSEDED";
  predecessorVersionId?: string; idempotencyKey: string; requestHash: string; inputHash: string; createdAt: string; updatedAt: string;
  finalizedAt?: string; finalizedByActorUserId?: string;
}
export interface DirectionalEvaluationSnapshotV1 extends OrganisationOwnedRecord {
  id: string; caseId: string; projectId: string; floorId: string; architectureVersion: "V1";
  status: "COMPLETE" | "REVIEW_REQUIRED" | "SUPERSEDED"; result: unknown; sourceD8SnapshotId?: string; sourceD8Hash?: string;
  sourceD16MappingId: string; sourceD16Hash: string; sourceMainEntranceId?: string; sourceMainEntranceHash?: string;
  sourceFloorEntranceId?: string; sourceFloorEntranceHash?: string; sourceDirectionalInputId: string; sourceDirectionalInputHash: string;
  methodologyVersionId?: string; methodologyContentHash?: string; inputHash: string; outputHash: string; idempotencyKey?: string; snapshotVersion: number;
  supersedesSnapshotId?: string; createdAt: string; createdByActorUserId: string; finalizedAt?: string;
}

export interface DirectionalReportCardSnapshotV1 extends OrganisationOwnedRecord {
  id: string; caseId: string; projectId: string; floorId: string; architectureVersion: "V1";
  status: "DRAFT" | "FINALIZED" | "SUPERSEDED"; cardStatus: "READY" | "REVIEW_REQUIRED";
  sourceDirectionalEvaluationSnapshotId: string; sourceDirectionalEvaluationHash: string;
  payload: unknown; statementSelections: unknown[]; reviewReasons: unknown[];
  methodologyVersionId?: string; methodologyContentHash?: string; contentHash: string;
  snapshotVersion: number; supersedesSnapshotId?: string; idempotencyKey: string; requestHash: string;
  createdAt: string; finalizedAt?: string; finalizedByActorUserId?: string;
}

export interface DirectionalStageAPresentationV1 extends OrganisationOwnedRecord {
  id: string; caseId: string; projectId: string; floorId: string; architectureVersion: "V1";
  reportCardSnapshotId: string; reportCardContentHash: string; status: "PRESENTED";
  presentedAt: string; presentedByActorUserId: string; idempotencyKey: string; requestHash: string;
}

export interface ElementalReportSnapshotV1 extends OrganisationOwnedRecord {
  id: string; organisationId: string; caseId: string; projectId: string; floorId: string; architectureVersion: "V1";
  elementalEvaluationSnapshotId: string; elementalEvaluationOutputHash: string; report: unknown; status: "DRAFT" | "FINALIZED" | "SUPERSEDED" | "REVIEW_REQUIRED";
  contentHash: string; methodologyVersionId: string; methodologyContentHash: string; snapshotVersion: number; predecessorId?: string;
  idempotencyKey: string; requestHash: string; createdAt: string; finalizedAt?: string; finalizedByActorUserId?: string;
}

export interface EvaluationRemedyHandoffRecordV1 extends OrganisationOwnedRecord {
  id: string; organisationId: string; caseId: string; projectId: string; floorId: string; architectureVersion: "V1";
  elementalEvaluationSnapshotId: string; elementalEvaluationOutputHash: string; elementalReportSnapshotId: string; elementalReportContentHash: string; fullBalanceClearanceId: string; handoff: unknown; contentHash: string; status: "READY" | "SUPERSEDED";
  idempotencyKey: string; requestHash: string; createdAt: string;
}

export type StageBInputV1Status = "DRAFT" | "FINALIZED" | "SUPERSEDED";
export interface StageBInputV1Decision {
  element: string; verdict: string; correctionScope: "WHOLE_ELEMENT" | "SPECIFIC_DIRECTION";
  specificDirection?: string; remedyType: string; stageBRemedyType: StageBRemedyType;
  statementId: string; statementContentHash: string;
}
export interface StageBInputV1Record extends OrganisationOwnedRecord {
  id: string; architectureVersion: "V1"; sourceKind: "V1_ELEMENTAL";
  clientId?: string; caseId: string; projectId: string; floorId: string;
  sourceEvaluationRemedyHandoffId: string; sourceEvaluationRemedyHandoffHash: string;
  sourceElementalEvaluationSnapshotId: string; sourceElementalEvaluationHash: string;
  sourceCombinedEvaluationReportId: string; sourceCombinedEvaluationReportHash: string;
  reportSourceId: string; reportSourceHash: string;
  decisions: StageBInputV1Decision[]; methodologyVersionId: string; methodologyContentHash: string;
  deterministicInputHash: string; deterministicOutputHash: string; status: StageBInputV1Status;
  predecessorId?: string; successorId?: string; createdAt: string; finalizedAt?: string; finalizedByActorUserId?: string;
  idempotencyKey: string; requestHash: string;
}

export type CombinedEvaluationReportLifecycleV1 = "DRAFT" | "FINALIZED" | "APPROVED" | "SUPERSEDED";
export interface CombinedEvaluationReportSnapshotV1 extends OrganisationOwnedRecord {
  id: string; caseId: string; projectId: string; floorId: string; architectureVersion: "V1";
  status: CombinedEvaluationReportLifecycleV1; reportVersion: number;
  directionalReportCardSnapshotId: string; directionalReportCardContentHash: string;
  directionalStageAPresentationId: string; directionalStageAPresentationHash: string;
  siteEvidenceVersionId: string; siteEvidenceArtifactHash: string;
  energyBarEvidenceVersionId: string; energyBarEvidenceArtifactHash: string;
  elementalReportSnapshotId: string; elementalReportContentHash: string;
  remedyHandoffId: string; remedyHandoffContentHash: string;
  methodologyVersionIds: string[]; methodologyContentHashes: string[];
  reportTemplateVersion: string; renderModel: unknown; contentHash: string;
  predecessorId?: string; successorId?: string; idempotencyKey: string; requestHash: string;
  createdAt: string; finalizedAt?: string; finalizedByActorUserId?: string; approvedAt?: string; approvedByActorUserId?: string;
}

export interface OpeningMappingRecord extends OrganisationOwnedRecord {
  id: string; projectId: string; caseId: string; floorId: string; planVersionId: string;
  orientationVersionId: string; kind: "MAIN_ENTRANCE" | "ENTRANCE" | "WINDOW";
  markerX: number; markerY: number; verified: boolean;
  methodologyStatus: "APPROVED" | "REVIEW_REQUIRED" | "BLOCKED_METHOD_INPUT" | "NEEDS_REGENERATION";
  methodologyVersionId?: string; directionCode?: string; evidenceVersionId: string;
  idempotencyKey: string; createdAt: string;
}

/**
 * Immutable Founder-confirmed entrance classifications. The zone code/name are
 * snapshotted from the exact active DIRECTION_32 methodology version; legacy
 * percentage opening markers remain separate read-only evidence.
 */
export interface EntranceZoneVersionRecord extends OrganisationOwnedRecord {
  id: string; projectId?: string; caseId: string;
  scope: "PROPERTY_MAIN_GATE" | "FLOOR_PRIMARY_ENTRANCE";
  /** Present only for floor-level entrance classifications. */
  floorId?: string;
  /** The floor whose current 32D evidence supported a property-level choice. */
  sourceFloorId?: string;
  planVersionId: string; marked32DEvidenceVersionId: string;
  methodologyVersionId: string; methodologyContentHash: string;
  /** Explicit entrance-catalog identity retained alongside generic methodology lineage. */
  catalogVersionId: string; catalogContentHash: string;
  zoneCode: string; zoneNameSnapshot: string;
  classificationSnapshot: "GOOD" | "BAD" | "OK-OK";
  ownerInterpretationHash: string;
  /** New writes use DRAFT/FINALIZED/SUPERSEDED; CURRENT remains readable legacy status. */
  status: "DRAFT" | "FINALIZED" | "CURRENT" | "SUPERSEDED";
  supersedesVersionId?: string; supersededAt?: string;
  finalizedAt?: string; finalizedByActorUserId?: string;
  parentDirection?: "N" | "E" | "S" | "W";
  degreeStart?: number; degreeEnd?: number;
  sourceRuleId?: string; sourceWorkbookSheet?: string; sourceWorkbookRow?: string;
  reason?: string; confirmedAt: string; confirmedByActorUserId: string;
  idempotencyKey: string; requestHash: string;
}

export interface DependencyInvalidationRecord extends OrganisationOwnedRecord {
  id: string; projectId: string; caseId: string; floorId?: string;
  targetType: "OPENING_MAPPING" | "SPACE_MAPPING" | "UTILITY_EVALUATION" | "UTILITY_VERDICT" | "SHAKTI_EVALUATION" | "FINDING" | "DRAFT_REPORT" | "STAGE_B_PLACEMENT" | "SECTION_A_PLACEMENT" | "COLOUR_FRAME_COMPOSITION";
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
  requestIdempotencyKey?: string;
  requestHash?: string;
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

export const d16UtilityZones = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"] as const;
export type D16UtilityZone = (typeof d16UtilityZones)[number];
export const d16UtilityMappingStatuses = ["DRAFT", "FINALIZED", "SUPERSEDED"] as const;
export type D16UtilityMappingStatus = (typeof d16UtilityMappingStatuses)[number];

export interface D16UtilityMappingRowRecord {
  id: string; serialNumber: number; utilityId: string; utilityName: string;
  floorPlanLabel: string; zone: D16UtilityZone;
}

export interface D16UtilityMappingVersionRecord extends OrganisationOwnedRecord {
  id: string; organisationId: string; caseId: string; projectId: string; floorId: string;
  version: number; status: D16UtilityMappingStatus; rows: D16UtilityMappingRowRecord[];
  methodologyVersionId?: string; methodologyVersion?: number; methodologyContentHash?: string;
  utilityMasterSourceVersion?: string; utilityMasterWorkbookHash?: string; utilityMasterAdapterVersion?: string;
  provenanceRecoveryMode?: "POST_HOC_SOURCE_CERTIFICATION";
  provenanceRecoveryOfVersionId?: string; provenanceCertifiedAt?: string; provenanceCertifiedByActorUserId?: string;
  externalD16EvidenceVersionId?: string; predecessorVersionId?: string; successorVersionId?: string;
  idempotencyKey: string; requestHash: string; createdAt: string; updatedAt: string;
  finalizedAt?: string; finalizedByActorUserId?: string;
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
  /** A replacement remains non-current until its exact verified version receives Founder approval. */
  successorOfDocumentId?: string;
  issueHistory?: Array<{
    id: string; status: "OPEN" | "RESOLVED"; discrepancy: string; requiredChange: string;
    ownerRole: ResponsibilityRole; ownerName: string; openedAt: string; openedByActorUserId: string;
    resolvedAt?: string; resolvedByActorUserId?: string; resolutionNote?: string; resolutionIdempotencyKey?: string;
  }>;
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
  /** Additive closed evaluation architecture discriminator; absent legacy floors resolve to LEGACY. */
  evaluationArchitectureVersion?: "LEGACY" | "V1";
  readyIdempotencyKey?: string;
  readyRequestHash?: string;
  evidenceIdempotencyKey?: string;
  evidenceRequestHash?: string;
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

export interface V1FullBalanceClearanceRecord extends OrganisationOwnedRecord {
  id: string; caseId: string; projectId: string; floorId: string;
  scope: "FULL_BALANCE_CLEARANCE_V1"; version: number; status: "APPROVED";
  elementalEvaluationSnapshotId: string; elementalEvaluationOutputHash: string;
  elementalReportSnapshotId: string; elementalReportContentHash: string;
  directionalReportCardSnapshotId?: string;
  actorUserId: string; actorDisplayName: string; actorRole: UserRole;
  approvedAt: string; recordVersion: number; idempotencyKey: string; requestHash: string;
}

export interface RemedialWorkflowReservation extends OrganisationOwnedRecord {
  id: string; projectId: string; caseId: string; floorId: string;
  /** Historical LEGACY records retain stageAReportId: string; V1 records use the native source fields below. */
  stageAReportId?: string; stageASourceKind?: "LEGACY_STAGE_A_REPORT" | "V1_DIRECTIONAL_STAGE_A"; stageASourceId?: string; stageASourceHash?: string;
  reportSourceId?: string; reportSourceHash?: string;
  status: "BLOCKED_METHOD_INPUT" | "READY_FOR_CONFIGURATION" | "DRAFT";
  idempotencyKey?: string;
  methodologyVersionId?: string; createdAt: string;
}

export type StageBRemedyType = "DISHA_BALANCER" | "DISHA_ACTIVATION" | "TATTAV_BALANCER" | "TATTAV_ACTIVATION" | "EQUALISER";
export type StageBWorkflowState = "NOT_STARTED" | "LAYOUT_SELECTED" | "EDITING" | "PAGE_FINALISED" | "REPORT_PROTECTED" | "DELIVERED";

export interface StageBRemediationRecord extends OrganisationOwnedRecord {
  /** LEGACY shape remains caseId: string; floorId: string; reportId: string; V1 uses the native source fields below. */
  id: string; projectId: string; caseId: string; floorId: string; reportId?: string;
  reportSourceKind?: "LEGACY_REPORT_VERSION" | "V1_COMBINED_EVALUATION_REPORT";
  reportSourceId?: string; reportSourceHash?: string; reportTemplateVersion?: string; architectureVersion?: "LEGACY" | "V1";
  state: StageBWorkflowState;
  existingLayoutAssetId: string; existingLayoutAssetVersionId: string; existingLayoutSnapshotId: string;
  finalRevisedLayoutCandidateId?: string; finalRevisedLayoutAssetId?: string; finalRevisedLayoutAssetVersionId?: string;
  baseLayoutVersionId?: string; protectedReportVersionId?: string; deliveredAt?: string;
  idempotencyKey: string; requestHash: string; createdAt: string;
}

export interface RevisedLayoutCandidateRecord extends OrganisationOwnedRecord {
  id: string; projectId: string; caseId: string; floorId: string; postSiteFindingsId?: string;
  evidenceRef: string; sourceAssetId?: string; sourceFileName?: string; sourceMimeType?: string; sourceSizeBytes?: number;
  checksumSha256: string; purpose?: "REVISED_FURNITURE_LAYOUT"; label: string; version: number;
  status: "DRAFT" | "APPROVED" | "AVAILABLE" | "WITHDRAWN";
  approvedAt?: string; approvedByActorUserId?: string; approvalReason?: string; idempotencyKey: string; requestHash: string; createdAt: string;
}

export interface RemediationBaseLayoutVersionRecord extends OrganisationOwnedRecord {
  id: string; remediationId: string; projectId: string; caseId: string; floorId: string; candidateId: string;
  assetId: string; assetVersionId: string; assetContentHash: string; snapshotId: string; versionNumber: number;
  state: "SELECTED" | "LOCKED" | "SUPERSEDED"; selectedAt: string; selectedBy: string; lockedAt?: string; lockedBy?: string;
}

export interface RemedyRepositoryRecord extends OrganisationOwnedRecord {
  id: string; name: string; remedialType: StageBRemedyType; elements: string[]; directions: string[];
  attributePurpose: string; preferredAssetId: string; preferredAssetVersionId: string;
  status: "DRAFT" | "APPROVED" | "ARCHIVED"; approvalTimestamp?: string; approvedBy?: string;
  tags?: string[]; createdAt?: string; updatedAt?: string; archivedAt?: string; archivedBy?: string;
  replacementRecordId?: string; duplicateOfRecordId?: string; sourceCaseUsedRemedyId?: string;
  sourceCaseId?: string; sourceFloorId?: string; idempotencyKey?: string; requestHash?: string;
}

export interface CaseUsedRemedyRecord extends OrganisationOwnedRecord {
  id: string; caseId: string; floorId: string; remediationId: string; pageId: string;
  remedialType: StageBRemedyType; name: string; attributePurpose: string;
  preferredAssetId: string; preferredAssetVersionId: string; sourceMediaChecksumSha256: string;
  source: "ONE_TIME_USE_THIS_CASE"; status: "ACTIVE" | "ARCHIVED"; createdAt: string;
  idempotencyKey: string; requestHash: string; mergedRepositoryRecordId?: string;
  mergedAt?: string; mergedBy?: string;
}

export const contextualRepositoryCategories = ["FURNITURE_ADDON", "APPLIANCE", "COLOUR_FRAME", "EXTRA"] as const;
export type ContextualRepositoryCategory = (typeof contextualRepositoryCategories)[number];
export type RepositoryCategory = ContextualRepositoryCategory | StageBRemedyType | "CASE_USED_REMEDY";
export type RepositoryLifecycleStatus = "DRAFT" | "APPROVED" | "ARCHIVED";

export interface ContextualRepositoryRecord extends OrganisationOwnedRecord {
  id: string; category: ContextualRepositoryCategory; name: string; attributePurpose: string; tags: string[];
  preferredAssetId: string; preferredAssetVersionId: string; status: RepositoryLifecycleStatus;
  createdAt: string; updatedAt: string; approvalTimestamp?: string; approvedBy?: string;
  archivedAt?: string; archivedBy?: string; replacementRecordId?: string; duplicateOfRecordId?: string;
  idempotencyKey: string; requestHash: string;
}

export interface RepositoryAuditEventRecord extends OrganisationOwnedRecord {
  id: string; recordId: string; category: RepositoryCategory; action: string; actorId: string; actorRole: UserRole;
  reason: string; beforeHash?: string; afterHash?: string; happenedAt: string; idempotencyKey: string; requestHash: string;
}

export interface RepositoryImportBatchRecord extends OrganisationOwnedRecord {
  id: string; format: "CSV"; filename: string; status: "STAGED" | "PARTIALLY_APPROVED" | "APPROVED" | "FAILED";
  totalRows: number; validRows: number; invalidRows: number; duplicateRows: number; approvedRows: number;
  createdAt: string; createdBy: string; idempotencyKey: string; requestHash: string;
}

export interface RepositoryImportRowRecord extends OrganisationOwnedRecord {
  id: string; batchId: string; rowNumber: number; raw: Record<string, string>;
  normalized?: { category: Exclude<RepositoryCategory, "CASE_USED_REMEDY">; name: string; attributePurpose: string; assetId: string; assetVersionId: string; elements: string[]; directions: string[]; tags: string[] };
  status: "VALID" | "INVALID" | "DUPLICATE" | "APPROVED" | "FAILED"; errors: string[];
  duplicateRecordId?: string; createdRecordId?: string;
}

export interface RemedyEligibilityResolutionRecord extends OrganisationOwnedRecord {
  id: string; remediationId: string; caseId: string; floorId: string; verdictId: string; verdictContentHash: string;
  sourceKind?: "LEGACY_UTILITY" | "V1_ELEMENTAL"; sourceInputId?: string; sourceInputHash?: string; specificDirection?: string;
  methodologyVersionId: string; methodologyContentHash: string; resolverVersion: "stage-b-remedy-resolver/v1";
  remedialType: StageBRemedyType; remedyId: string; remedyRecordVersion: number; remedyAssetVersionId: string;
  eligibilityRuleIds: string[]; explanationCodes: string[]; resolvedAt: string; resolutionHash: string;
  status: "ELIGIBLE" | "INVALIDATED"; invalidatedAt?: string; invalidationReason?: string;
  idempotencyKey: string; requestHash: string;
}

export interface ReportPlacementPageRecord extends OrganisationOwnedRecord {
  id: string; remediationId: string; reportId?: string; caseId: string; floorId: string; stageBLineage?: import("./stage-b-lineage.ts").StageBReportLineage;
  section: "A" | "B" | "C"; pageType: "FURNITURE_ADDON" | "APPLIANCE" | StageBRemedyType | "EXTRA";
  ordinal: number; state: "DRAFT" | "FINALISED"; baseLayoutVersionId?: string;
  finalisedAt?: string; finalisedBy?: string; finalisationHash?: string; finalisationIdempotencyKey?: string; finalisationRequestHash?: string;
}

export interface PhysicalPlacementRecord extends OrganisationOwnedRecord {
  id: string; remediationId: string; caseId: string; floorId: string; reportId?: string; pageId: string; stageBLineage?: import("./stage-b-lineage.ts").StageBReportLineage;
  baseLayoutVersionId: string; placementType: "FURNITURE_ADDON" | "APPLIANCE" | "REMEDY" | "EXTRA";
  eligibilityResolutionId?: string; remedyId?: string; masterNumber?: number;
  anchorX: number; anchorY: number; anchorLocked: boolean; calloutX: number; calloutY: number;
  calloutWidth: number; calloutHeight: number; imageAssetId: string; imageAssetVersionId: string;
  imageAssetSnapshotId: string; nameSnapshot: string; attributePurposeSnapshot: string; locationReference?: string;
  showCircle: boolean; showFrame: boolean; showHighlight: boolean; state: "ACTIVE" | "LOCKED" | "DELETED";
  dependencyReviewState: "CURRENT" | "NEEDS_REVIEW"; idempotencyKey: string; requestHash: string;
  deletedAt?: string; deletedBy?: string; deletionIdempotencyKey?: string; deletionRequestHash?: string;
}

export interface PlacementImplementationRowRecord extends OrganisationOwnedRecord {
  id: string; remediationId: string; reportId?: string; pageId: string; placementId: string; stageBLineage?: import("./stage-b-lineage.ts").StageBReportLineage; masterNumber: number;
  imageAssetSnapshotId: string; itemNameSnapshot: string; attributePurposeSnapshot: string; locationReference?: string;
}

export interface MasterAppendixRowRecord extends OrganisationOwnedRecord {
  id: string; remediationId: string; reportId?: string; caseId: string; floorId: string; stageBLineage?: import("./stage-b-lineage.ts").StageBReportLineage; placementId: string;
  sourcePageId: string; baseLayoutVersionId: string; masterNumber: number; imageAssetSnapshotId: string;
  itemNameSnapshot: string; attributePurposeSnapshot: string; locationReference?: string;
}

export interface StageBIntegrityRunRecord extends OrganisationOwnedRecord {
  id: string; remediationId: string; reportId?: string; scopeHash: string; status: "PASS" | "FAIL"; stageBLineage?: import("./stage-b-lineage.ts").StageBReportLineage;
  issues: Array<{ code: string; entityType: string; entityId?: string; field?: string }>;
  checkedAt: string; checkedBy: string;
}

export interface StageBRenderProvenance {
  eligibilityResolutionId: string; remedialType: StageBRemedyType; verdictId: string; verdictContentHash: string;
  methodologyVersionId: string; methodologyContentHash: string; resolverVersion: string; eligibilityResolutionHash: string;
}

export interface StageBRenderManifest {
  schemaVersion: "stage-b-render-manifest/v1"; organisationId: string; caseId: string; floorId: string; reportId?: string;
  reportSourceKind?: "LEGACY_REPORT_VERSION" | "V1_COMBINED_EVALUATION_REPORT"; reportSourceId?: string; reportSourceHash?: string;
  existingLayout: { assetId: string; versionId: string; snapshotId: string; contentHash: string };
  baseLayout: { versionId: string; snapshotId: string; contentHash: string };
  /** Legacy first-placement summary retained for single-page consumers; per-page provenance is authoritative. */
  provenance?: Omit<StageBRenderProvenance, "eligibilityResolutionId" | "remedialType">;
  pages: Array<{ pageId: string; pageType: StageBRemedyType; ordinal: number; finalisationHash: string; provenance: StageBRenderProvenance[]; placements: PhysicalPlacementRecord[]; implementationRows: Array<PlacementImplementationRowRecord & { implemented: null; implementationDate: null; alternativeNeeded: null }> }>;
  appendixRows: Array<MasterAppendixRowRecord & { implemented: null; implementationDate: null; alternativeNeeded: null }>;
  integrityRunId: string; integrityScopeHash: string; integrityStatus: "PASS";
}

export type SectionAAssetType = "FURNITURE_ADDON" | "APPLIANCE" | "COLOUR_FRAME";
export type SectionAVisualPageType = "EXISTING_LAYOUT" | "FINAL_REVISED_LAYOUT" | "COLOUR_FRAME";
export type ExistingLayoutAnnotationType = "CIRCLE" | "ARROW" | "HIGHLIGHT" | "PEN" | "TEXT";

export interface SectionAWorkspaceRecord extends OrganisationOwnedRecord {
  id: string; remediationId: string; projectId: string; caseId: string; floorId: string; reportId?: string; stageBLineage?: import("./stage-b-lineage.ts").StageBReportLineage;
  state: "EDITING" | "FINALISED"; idempotencyKey: string; requestHash: string; createdAt: string;
}

export interface SectionAVisualPageRecord extends OrganisationOwnedRecord {
  id: string; workspaceId: string; remediationId: string; reportId?: string; stageBLineage?: import("./stage-b-lineage.ts").StageBReportLineage; caseId: string; floorId: string;
  pageType: SectionAVisualPageType; ordinal: 1 | 2 | 7; state: "DRAFT" | "FINALISED";
  baseLayoutVersionId?: string; finalisedAt?: string; finalisedBy?: string; finalisationHash?: string;
  finalisationIdempotencyKey?: string; finalisationRequestHash?: string;
}

export interface SectionAAssetRecord extends OrganisationOwnedRecord {
  id: string; workspaceId: string; remediationId: string; caseId: string; floorId: string;
  assetType: SectionAAssetType; name: string; attributePurpose: string;
  assetId: string; assetVersionId: string; assetSnapshotId: string; status: "APPROVED" | "ARCHIVED"; repositoryRecordId?: string;
  idempotencyKey: string; requestHash: string;
}

export interface ExistingLayoutAnnotationRecord extends OrganisationOwnedRecord {
  id: string; workspaceId: string; remediationId: string; reportId?: string; stageBLineage?: import("./stage-b-lineage.ts").StageBReportLineage; caseId: string; floorId: string; pageId: string;
  existingLayoutSnapshotId: string; annotationType: ExistingLayoutAnnotationType;
  points: Array<{ x: number; y: number }>; textSnapshot?: string;
  colour: string; strokeWidth: number; opacity: number; state: "ACTIVE" | "DELETED";
  idempotencyKey: string; requestHash: string; deletedAt?: string; deletedBy?: string;
  deletionIdempotencyKey?: string; deletionRequestHash?: string;
}

export interface ColourFrameCompositionRecord extends OrganisationOwnedRecord {
  id: string; workspaceId: string; remediationId: string; reportId?: string; stageBLineage?: import("./stage-b-lineage.ts").StageBReportLineage; caseId: string; floorId: string; pageId: string;
  baseLayoutVersionId: string; sectionAAssetId: string; assetId: string; assetVersionId: string; assetSnapshotId: string;
  x: number; y: number; width: number; height: number; rotationDegrees: number;
  opacityPreset: "LOW" | "MEDIUM" | "FULL"; preserveAspectRatio: boolean; printFit: boolean; locked: boolean;
  dependencyReviewState: "CURRENT" | "NEEDS_REVIEW"; state: "ACTIVE" | "LOCKED" | "DELETED";
  idempotencyKey: string; requestHash: string; deletedAt?: string; deletedBy?: string;
  deletionIdempotencyKey?: string; deletionRequestHash?: string;
}

export interface SectionAIntegrityRunRecord extends OrganisationOwnedRecord {
  id: string; workspaceId: string; remediationId: string; reportId?: string; scopeHash: string; status: "PASS" | "FAIL";
  issues: Array<{ code: string; entityType: string; entityId?: string; field?: string }>;
  checkedAt: string; checkedBy: string;
}

export interface RemediationReportIntegrityRunRecord extends OrganisationOwnedRecord {
  id: string; remediationId: string; reportId?: string; scopeHash: string; status: "PASS" | "FAIL"; stageBLineage?: import("./stage-b-lineage.ts").StageBReportLineage;
  issues: Array<{ code: string; entityType: string; entityId?: string; field?: string }>;
  checkedAt: string; checkedBy: string;
}

export interface SectionARenderManifest {
  schemaVersion: "section-a-render-manifest/v1"; organisationId: string; caseId: string; floorId: string; reportId?: string; reportSourceKind?: "LEGACY_REPORT_VERSION" | "V1_COMBINED_EVALUATION_REPORT"; reportSourceId?: string; reportSourceHash?: string;
  existingLayoutPage: { pageId: string; ordinal: 1; finalisationHash: string; assetId: string; versionId: string; snapshotId: string; annotations: ExistingLayoutAnnotationRecord[] };
  finalRevisedLayoutPage: { pageId: string; ordinal: 2; finalisationHash: string; baseLayoutVersionId: string; snapshotId: string; contentHash: string };
  placementPages: Array<{ pageId: string; pageType: "FURNITURE_ADDON" | "APPLIANCE"; ordinal: 3 | 5; finalisationHash: string; placements: PhysicalPlacementRecord[]; implementationRows: Array<PlacementImplementationRowRecord & { implemented: null; implementationDate: null; alternativeNeeded: null }> }>;
  colourFramePage: { pageId: string; ordinal: 7; finalisationHash: string; compositions: ColourFrameCompositionRecord[] };
  appendixRows: Array<MasterAppendixRowRecord & { implemented: null; implementationDate: null; alternativeNeeded: null }>;
  integrityRunId: string; integrityScopeHash: string; integrityStatus: "PASS";
}

export interface SectionCWorkspaceRecord extends OrganisationOwnedRecord {
  id: string; remediationId: string; projectId: string; caseId: string; floorId: string; reportId?: string; stageBLineage?: import("./stage-b-lineage.ts").StageBReportLineage;
  state: "EDITING" | "FINALISED"; createdAt: string;
  reorderIdempotencyKey?: string; reorderRequestHash?: string;
  finalisedAt?: string; finalisedBy?: string; finalisationHash?: string;
  finalisationIdempotencyKey?: string; finalisationRequestHash?: string;
}

export interface SectionCExtraPageRecord extends OrganisationOwnedRecord {
  id: string; workspaceId: string; remediationId: string; reportId?: string; stageBLineage?: import("./stage-b-lineage.ts").StageBReportLineage; caseId: string; floorId: string; pageId: string;
  title: string; orderIndex: number; status: "ACTIVE" | "RETIRED"; createdAt: string;
  creationIdempotencyKey: string; creationRequestHash: string;
  renameIdempotencyKey?: string; renameRequestHash?: string;
  retiredAt?: string; retiredBy?: string; retirementIdempotencyKey?: string; retirementRequestHash?: string;
}

export interface SectionCAssetRecord extends OrganisationOwnedRecord {
  id: string; workspaceId: string; remediationId: string; caseId: string; floorId: string; pageId: string;
  name: string; attributePurpose: string; assetId: string; assetVersionId: string; assetSnapshotId: string;
  status: "APPROVED" | "ARCHIVED"; repositoryRecordId?: string; idempotencyKey: string; requestHash: string;
}

export interface SectionCIntegrityRunRecord extends OrganisationOwnedRecord {
  id: string; workspaceId: string; remediationId: string; reportId?: string; scopeHash: string; status: "PASS" | "FAIL";
  issues: Array<{ code: string; entityType: string; entityId?: string; field?: string }>;
  checkedAt: string; checkedBy: string;
}

export interface SectionCRenderManifest {
  schemaVersion: "section-c-render-manifest/v1"; organisationId: string; caseId: string; floorId: string; reportId?: string; reportSourceKind?: "LEGACY_REPORT_VERSION" | "V1_COMBINED_EVALUATION_REPORT"; reportSourceId?: string; reportSourceHash?: string;
  baseLayout: { versionId: string; snapshotId: string; contentHash: string };
  pages: Array<{ extraPageId: string; pageId: string; title: string; orderIndex: number; ordinal: number; finalisationHash: string;
    placements: PhysicalPlacementRecord[];
    implementationRows: Array<PlacementImplementationRowRecord & { implemented: null; implementationDate: null; alternativeNeeded: null }> }>;
  appendixRows: Array<MasterAppendixRowRecord & { implemented: null; implementationDate: null; alternativeNeeded: null }>;
  integrityRunId: string; integrityScopeHash: string; integrityStatus: "PASS";
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
  catalogScope?: "ENTRANCE";
  catalogRecordCount?: number;
  ownerSourceAuthority?: string;
}

export interface MethodologyRuleRecord extends OrganisationOwnedRecord {
  id: string; methodologyVersionId: string; ruleKey: string; sourceReference: string;
  decisionStatus: MethodologyDecisionStatus; conditionJson: unknown; outcomeJson: unknown;
  contentHash: string; idempotencyKey: string; createdAt: string; createdByActorUserId: string;
  /** Exact immutable owner wording; internal only unless separate presentation copy is approved. */
  ownerSourceText?: string;
  presentationText?: string;
  presentationTextStatus?: "REVIEW_REQUIRED_COPY" | "APPROVED";
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

export const documentDeliveryStatuses = ["DRAFT", "READY", "DELIVERED", "ACKNOWLEDGED"] as const;
export type DocumentDeliveryStatus = (typeof documentDeliveryStatuses)[number];
export type DocumentDeliveryChannel = "CLIENT_PORTAL" | "MANUAL_HANDOFF";
export type DocumentDeliveryFamily = "VASTU_REMEDY_REPORT";
export type DocumentDeliveryEventType = "PREPARED" | "READINESS_FAILED" | "READY" | "DELIVERED" | "REDELIVERED" | "MANUAL_HANDOFF_RECORDED" | "VIEWED" | "DOWNLOADED" | "ACKNOWLEDGED";

export interface DocumentDeliveryActorSnapshot {
  actorUserId: string; actorDisplayName: string; actorRole: UserRole; occurredAt: string;
}

/**
 * Distribution metadata only. The report artifact and protected PDF are
 * immutable authorities; delivery never regenerates or rewrites either one.
 */
export interface DocumentDeliveryRecord extends OrganisationOwnedRecord {
  id: string; documentFamily: DocumentDeliveryFamily;
  projectId: string; caseId: string; floorId: string; reportId: string;
  reportVersionLabel: string; reportTemplateVersion: "uchit-verdict/v5";
  reportArtifactId: string; reportCanonicalHash: string;
  protectedPdfArtifactId: string; protectedPdfChecksumSha256: string;
  protectedPdfMimeType: "application/pdf"; protectedPdfSizeBytes: number;
  documentTemplateSnapshotHash: string; brandProfileId?: string; documentTemplateId?: string;
  recipientClientId: string; recipientDisplayName: string; recipientEmail: string;
  status: DocumentDeliveryStatus; channel?: DocumentDeliveryChannel;
  prepared: DocumentDeliveryActorSnapshot; ready?: DocumentDeliveryActorSnapshot;
  finalApproval: DocumentDeliveryActorSnapshot; delivered?: DocumentDeliveryActorSnapshot;
  acknowledged?: DocumentDeliveryActorSnapshot;
  manualHandoffDescription?: string; supersedesDeliveryId?: string; replacementForDeliveryId?: string;
  createdAt: string; updatedAt: string; idempotencyKey: string; requestHash: string;
}

export interface DocumentDeliveryEventRecord extends OrganisationOwnedRecord {
  id: string; deliveryId: string; documentFamily: DocumentDeliveryFamily;
  reportId: string; caseId: string; floorId: string; protectedPdfArtifactId: string;
  protectedPdfChecksumSha256: string; eventType: DocumentDeliveryEventType;
  channel?: DocumentDeliveryChannel; actorUserId: string; actorDisplayName: string; actorRole: UserRole;
  recipientClientId: string; occurredAt: string; reason: string;
  requestId: string; idempotencyKey: string;
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
  entranceZoneVersionIds?: string[];
  handMarkedEvidenceVersionId?: string;
  manualUtilitySheetDocumentId?: string;
  siteAnalysisId?: string;
  postSiteFindingsId?: string;
  stageBRenderManifest?: StageBRenderManifest;
  sectionARenderManifest?: SectionARenderManifest;
  sectionCRenderManifest?: SectionCRenderManifest;
  remediationReportIntegrity?: { runId: string; scopeHash: string; status: "PASS" };
  documentTemplateSnapshot?: DocumentTemplateSnapshot;
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
