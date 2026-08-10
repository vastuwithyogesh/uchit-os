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
} from "@/lib/seed";
import {
  CommercialProposalRecord,
  AdvanceVerificationRecord,
  EvaluationSnapshotRecord,
  FloorWorkspaceRecord,
  LeadQualificationRecord,
  PaymentRecord,
  ReviewCallBookingRecord,
  ReportVersionRecord,
  RectificationRequestRecord,
  ShaktiSnapshotRecord,
  TimelineEvent,
  UtilityRule,
  InboundLeadRecord,
  VastuCaseRecord,
  WhatsAppTemplateLogRecord,
  WhatsAppTemplateRecord
} from "@/lib/domain";

export interface AppState {
  /** Read-only response metadata used for optimistic concurrency; not a domain collection. */
  persistenceRevision?: number | null;
  clients: typeof seedClients;
  leadQualifications: LeadQualificationRecord[];
  commercialProposals: CommercialProposalRecord[];
  reviewCallBookings: ReviewCallBookingRecord[];
  payments: PaymentRecord[];
  advanceVerifications: AdvanceVerificationRecord[];
  vastuCases: VastuCaseRecord[];
  floorWorkspaces: FloorWorkspaceRecord[];
  reportVersions: ReportVersionRecord[];
  rectificationRequests: RectificationRequestRecord[];
  evaluationSnapshots: EvaluationSnapshotRecord[];
  mapping32D: typeof seedMapping32D;
  mapping16D: typeof seedMapping16D;
  utilityRules: UtilityRule[];
  shaktiSnapshots: ShaktiSnapshotRecord[];
  timelineEvents: TimelineEvent[];
  optInLeads: InboundLeadRecord[];
  whatsappTemplates: WhatsAppTemplateRecord[];
  whatsappLogs: WhatsAppTemplateLogRecord[];
}

const createInitialState = (): AppState => ({
  clients: structuredClone(seedClients),
  leadQualifications: structuredClone(seedLeadQualifications),
  commercialProposals: structuredClone(seedCommercialProposals),
  reviewCallBookings: [],
  payments: structuredClone(seedPayments),
  advanceVerifications: [],
  vastuCases: structuredClone(seedVastuCases),
  floorWorkspaces: structuredClone(seedFloorWorkspaces),
  reportVersions: structuredClone(seedReportVersions),
  rectificationRequests: [],
  evaluationSnapshots: structuredClone(seedEvaluationSnapshots),
  mapping32D: structuredClone(seedMapping32D),
  mapping16D: structuredClone(seedMapping16D),
  utilityRules: structuredClone(seedUtilityRules),
  shaktiSnapshots: structuredClone(seedShaktiSnapshots),
  timelineEvents: structuredClone(seedTimelineEvents),
  optInLeads: [],
  whatsappTemplates: structuredClone(seedWhatsappTemplates),
  whatsappLogs: structuredClone(seedWhatsappLogs)
});

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
  globalThis.uchitVastuState = createInitialState();
  return globalThis.uchitVastuState;
}
