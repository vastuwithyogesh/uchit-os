export const roles = ["CLIENT", "SETTER", "CONSULTANT", "ADMIN", "SUPER_ADMIN"] as const;
export type UserRole = (typeof roles)[number];

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
}

export interface ClientRecord {
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

export interface PipelineTransitionRecord {
  id: string; clientId: string; idempotencyKey: string;
  beforeStage: CanonicalPipelineStage; afterStage: CanonicalPipelineStage;
  owner: { id: string; name: string; role: UserRole }; nextAction?: { summary: string; dueAt: string };
  correctionReason?: string; actor: { id: string; name: string; role: UserRole }; happenedAt: string;
}

export interface CommercialPolicy {
  version: number; defaultProposalAmountInr: number; minimumAdvanceInr: number;
  qualificationCallTargetMinutes: number; nextActionDueSoonHours: number; defaultReviewCallMinutes: number;
  reason: string; updatedAt: string; updatedBy: { id: string; name: string; role: UserRole };
  idempotencyKey: string;
}

export interface LeadQualificationRecord {
  id: string;
  clientId: string;
  score: number;
  notes: string;
  qualificationCallDueAt: string;
  qualificationCallCompletedAt?: string;
  deliverableTriggeredAt?: string;
  conversationalForm: Array<{ label: string; answer: string }>;
}

export interface InboundLeadRecord {
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
}

export interface CommercialProposalRecord {
  id: string;
  clientId: string;
  amountInr: number;
  minAdvanceInr: number;
  status: CommercialProposalStatus;
  reviewerId?: string;
  superAdminApprovedAt?: string;
}

export interface ReviewCallBookingRecord {
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

export interface PaymentRecord {
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
}

export interface AdvanceVerificationRecord {
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
}

export interface VastuCaseRecord {
  id: string;
  caseNumber: string;
  clientId: string;
  proposalId: string;
  status: VastuCaseStatus;
  reportStatus: ReportStatus;
  orientationLocked: boolean;
  balanceApproved: boolean;
  fullPaymentApproved: boolean;
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

export interface RectificationRequestRecord {
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
export const caseDocumentTypes = ["DIMENSIONED_PLAN", "LOCATION_MAP", "PHOTO_VIDEO", "ENTRANCE_ACCESS", "CURRENT_USE", "STRUCTURE_SERVICES", "FURNITURE_EQUIPMENT", "CLIENT_PRIORITIES", "SURVEY_BOUNDARY", "ROADS_ACCESS", "DEVELOPMENT_CONTROLS", "INTENT_ROOM_BRIEF", "USER_HIERARCHY_MOVEMENT", "ARCHITECTURAL_DRAWING", "EQUIPMENT_SERVICES", "FUTURE_NEEDS", "PROJECT_TEAM", "MILESTONES"] as const;
export type CaseDocumentType = (typeof caseDocumentTypes)[number];
export const documentRevisionStatuses = ["RECEIVED", "UNDER_REVIEW", "CHANGES_REQUIRED", "VERIFIED", "SUPERSEDED"] as const;
export type DocumentRevisionStatus = (typeof documentRevisionStatuses)[number];

export interface AssessmentAudit {
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  at: string;
}

export interface AssessmentObservation {
  id: string; caseId: string; caseRevisionNumber: number; serviceType: VastuServiceType;
  version: number; idempotencyKey: string; title: string; observation: string;
  alignmentStatus: AlignmentStatus; energyStatus: EnergyStatus; placementStatus: PlacementStatus;
  evidenceRefs: readonly string[]; created: AssessmentAudit; updated: AssessmentAudit;
}

export interface Recommendation {
  id: string; caseId: string; caseRevisionNumber: number; serviceType: VastuServiceType;
  version: number; idempotencyKey: string; title: string; rationale: string; action: string;
  decisionPriority: DecisionPriority; attentionClass: AttentionClass; implementationHorizon: ImplementationHorizon;
  level: RecommendationLevel; observationIds: readonly string[]; evidenceRefs: readonly string[];
  created: AssessmentAudit; updated: AssessmentAudit;
}

export interface ImplementationTask {
  id: string; caseId: string; caseRevisionNumber: number; serviceType: VastuServiceType;
  version: number; idempotencyKey: string; recommendationId: string; title: string; notes?: string;
  status: ImplementationStatus; implementationHorizon: ImplementationHorizon; evidenceRefs: readonly string[];
  ownerRole: ResponsibilityRole; ownerName: string;
  created: AssessmentAudit; updated: AssessmentAudit;
}

export interface CaseDocumentRecord {
  id: string; caseId: string; caseRevisionNumber: number; serviceType: VastuServiceType;
  assetType: CaseDocumentType; floorLabel?: string; versionLabel: string; documentDate?: string;
  isCurrent: boolean; evidenceRef: string; discrepancy?: string; blocker: boolean;
  reviewObservation?: string; requiredChange?: string; preferredAlternative?: string; acceptableAlternative?: string;
  ownerRole: ResponsibilityRole; ownerName: string; revisionStatus: DocumentRevisionStatus;
  idempotencyKey: string; version: number; received: AssessmentAudit; verified?: AssessmentAudit; updated: AssessmentAudit;
}

export const deliveryMilestoneKinds = ["REVIEW_ROUND", "FINAL_COMPLIANCE_CHECK", "CONSTRUCTION_CHECKPOINT", "CLARIFICATION", "FOLLOW_UP", "OPTIONAL_VERIFICATION"] as const;
export type DeliveryMilestoneKind = (typeof deliveryMilestoneKinds)[number];
export const deliveryMilestoneStatuses = ["PLANNED", "READY", "IN_PROGRESS", "BLOCKED", "COMPLETED", "DEFERRED"] as const;
export type DeliveryMilestoneStatus = (typeof deliveryMilestoneStatuses)[number];
export interface DeliveryMilestone {
  id: string; caseId: string; caseRevisionNumber: number; serviceType: VastuServiceType;
  kind: DeliveryMilestoneKind; sequence: number; roundLabel: string; title: string;
  status: DeliveryMilestoneStatus; dueDate?: string; completedAt?: string;
  ownerRole: ResponsibilityRole; ownerName: string;
  drawingRef?: { caseDocumentId: string; version: number };
  observationSummary?: string; actionSummary?: string; reason?: string; blocker: boolean;
  evidenceRefs: readonly string[]; idempotencyKey: string; version: number;
  created: AssessmentAudit; updated: AssessmentAudit;
}

export interface FloorWorkspaceRecord {
  id: string;
  caseId: string;
  floorLabel: string;
  status: FloorStatus;
  locked: boolean;
  regenerationReason?: string;
  evidenceUploads: string[];
}

export interface ReportVersionRecord {
  id: string;
  caseId: string;
  versionLabel: string;
  isPreview: boolean;
  status: ReportStatus;
  watermarkText?: string;
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
}

export interface ReportArtifactManifest {
  schemaVersion: "report-artifact/v1";
  mediaType: "text/html";
  createdAt: string;
  createdBy: { id: string; name: string; role: UserRole };
  templateVersion: string;
  evaluationSnapshotId?: string;
  shaktiSnapshotId?: string;
  contentHash: string;
  immutable: true;
  downloadPath: string;
}

export interface EvaluationSnapshotRecord {
  id: string;
  caseId: string;
  snapshotName: string;
  sourceVersion: string;
  generatedMatrix: Array<{ code: string; verdict: string; confidence: number; ruleId?: string }>;
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
  mappingVersion?: string;
  roundingVersion?: string;
  caseInputs: EvaluationCaseInputs;
  selectedRuleIds?: string[];
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

export interface ShaktiSnapshotRecord {
  id: string;
  caseId: string;
  inputValues: number[];
  elementAverages: Record<string, number>;
  rankedVerdicts: Array<{ element: string; score: number }>;
  tieBreakUsed: boolean;
  provenance?: EvaluationProvenance;
}

export interface TimelineEvent {
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
