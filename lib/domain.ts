export const roles = ["CLIENT", "SETTER", "CONSULTANT", "ADMIN", "SUPER_ADMIN"] as const;
export type UserRole = (typeof roles)[number];

export const leadStages = ["NEW", "QUALIFYING", "QUALIFIED", "DISQUALIFIED", "CONVERTED"] as const;
export type LeadStage = (typeof leadStages)[number];

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
