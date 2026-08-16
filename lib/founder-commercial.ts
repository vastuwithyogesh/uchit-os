import type {
  AppUser,
  CasePropertyContextRecord,
  FloorWorkspaceRecord,
  FounderCommercialLegalPolicyRecord,
  FounderCommercialPolicyVersionRecord,
  FounderBalanceDeadlineRecord,
  FounderCommercialPolicyEventType,
  FounderEngagementClassification,
  FounderProposalContentSnapshot,
  FounderProposalStep,
  FounderProposalTemplateVersionRecord,
  FounderProposalVersionRecord,
  TimelineEvent,
  VastuCaseRecord,
  VastuProjectRecord,
  VastuServiceType
} from "./domain.ts";
import { serviceTypes } from "./domain.ts";
import type { AppState } from "./store.ts";
import { deterministicContentHash } from "./evaluation-provenance.ts";
import { COMMERCIAL_PROPOSAL_RENDERER_VERSION, founderTemplatePageCount, founderTemplateRendererVersion, renderCommercialProposalPdf, type FounderProposalClientProjection } from "./commercial-document-renderer.ts";
import { registerFinalTaxInvoiceReviewTask, registerStatutoryPaymentTrigger } from "./founder-statutory-documents.ts";
import { APPROVED_FOUNDER_ASSETS } from "./founder-media-manifest.ts";
import { resolveDocumentTemplateSnapshot } from "./document-branding.ts";
import { loadFounderTemplateMedia } from "./founder-template-media.ts";

export class FounderCommercialError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) { super(message); this.statusCode = statusCode; }
}

function fail(statusCode: number, message: string): never { throw new FounderCommercialError(statusCode, message); }
const uuid = () => crypto.randomUUID();
const nowIso = (now = new Date()) => now.toISOString();
const trimmed = (value: string | undefined, label: string) => { const result = value?.trim() ?? ""; if (!result) fail(400, `${label} is required.`); return result; };
const safeIdempotency = (value: string) => { if (!/^[A-Za-z0-9:_-]{8,160}$/.test(value)) fail(428, "A bounded idempotency key is required."); return value; };
const safePaise = (value: number, label: string) => { if (!Number.isSafeInteger(value) || value < 0) fail(400, `${label} must be a non-negative whole number of paise.`); return value; };
const safeBasisPoints = (value: number) => { if (!Number.isSafeInteger(value) || value < 0 || value > 10000) fail(400, "GST basis points must be between 0 and 10000."); return value; };
const hashBytes = async (bytes: Uint8Array) => {
  const stable = Uint8Array.from(bytes);
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", stable.buffer))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};
const hashText = async (text: string) => hashBytes(new TextEncoder().encode(text));
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);
const addMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000);

export const FOUNDER_NO_REFUND_POLICY_TITLE = "Founder Cancellation, Refund and Delay Policy";
export const FOUNDER_NO_REFUND_POLICY_COPY = "Payments made to Uchit Vastu India are non-refundable. If a client cancels, pauses, or does not proceed, no refund, credit, voucher, or fee adjustment will be issued. Delays caused by pending client information, documents, access, confirmations, or site availability may move the estimated schedule. If Uchit needs to reschedule, a replacement date or slot will be offered. Any correction required by applicable law is handled only through a separately approved accountant process.";
export const FOUNDER_NO_REFUND_POLICY_CONFIGURATION = {
  refundPolicy: "NO_REFUNDS",
  creditPolicy: "NO_CREDITS_VOUCHERS_OR_FEE_OFFSETS",
  correctionPolicyApproval: "REVIEW_REQUIRED_ACCOUNTANT"
} as const;
export const FOUNDER_CANCELLATION_REFUND_DELAY_V2_TITLE = "P14 — Cancellation, Refund and Delay Policy";
export const FOUNDER_CANCELLATION_REFUND_DELAY_V2_COPY = [
  "P14.1 Client cancellation or withdrawal. If the Client cancels, pauses indefinitely or chooses not to proceed after work has commenced, amounts attributable to services already performed, work already completed and non-cancellable third-party costs are ordinarily non-refundable, subject always to applicable law. Any amount relating to services not yet performed will be assessed having regard to the approved Proposal, work completed, committed resources and any rights that apply under law.",
  "P14.2 Client-caused delay. Estimated timelines depend on timely receipt of information, drawings, documents, access, confirmations, decisions and site availability from the Client and relevant project participants. Delay in providing these inputs may move the estimated schedule without constituting a failure by Uchit to perform the services.",
  "P14.3 Uchit rescheduling. If Uchit needs to reschedule a consultation, review or other scheduled service, a reasonable replacement date or slot will be offered.",
  "P14.4 Applicable law preserved. Nothing in this policy excludes, restricts or waives any right, remedy, refund or other entitlement that cannot lawfully be excluded, restricted or waived. Any amount determined to be refundable or otherwise payable under applicable law will be processed through Uchit’s normal accounting process; internal administrative approval does not limit a statutory or legally enforceable entitlement."
].join("\n\n");
export const FOUNDER_CANCELLATION_REFUND_DELAY_V2_CONFIGURATION = {
  refundPolicy: "LAW_PRESERVING_REFUND_ASSESSMENT",
  creditPolicy: "NO_AUTOMATIC_CREDITS_OR_VOUCHERS",
  correctionPolicyApproval: "NORMAL_ACCOUNTING_PROCESS"
} as const;
export const FOUNDER_PROFESSIONAL_BOUNDARIES_TITLE = "P5 — Core Professional Boundaries";
export const FOUNDER_PROFESSIONAL_BOUNDARIES_COPY = [
  "P5.1. Nature of the service. Uchit Vastu India provides Vastu consultancy and advisory services within the scope expressly stated in the Proposal. The consultancy is based on the information, plans, photographs, recordings, site observations and other evidence made available for the engagement, together with the approved Uchit methodology applicable to the relevant version of the work.",
  "P5.2. Services not included. Unless expressly included in the Proposal, the consultancy is not architectural design, structural engineering, civil engineering, electrical, plumbing or fire-safety design, quantity surveying, legal, tax, accounting, medical, psychological, financial or investment advice. The Client must obtain advice, drawings, approvals and certifications from appropriately qualified or licensed professionals wherever required.",
  "P5.3. Law, safety and professional standards prevail. No recommendation requires or authorises the Client, contractor or any other person to depart from applicable law, statutory approval, building regulation, safety requirement, professional code or manufacturer instruction. Where a recommendation appears inconsistent with any such requirement, implementation must pause until the relevant qualified professional confirms an appropriate compliant solution.",
  "P5.4. No guaranteed outcome. Uchit does not guarantee any particular financial, commercial, health, relationship, personal, regulatory, construction, sale, occupancy or other outcome. The consultancy is an advisory professional service; results may depend on factors outside Uchit’s control, including the accuracy of inputs, site conditions, third-party work, implementation choices and subsequent changes to the property.",
  "P5.5. Reliance on client information. The Client is responsible for providing complete, accurate and current information and for identifying any change that may affect the engagement. If material information is missing, inaccurate, contradictory or changed, Uchit may pause the work, request clarification, mark the affected output for review, or require a revised assessment or successor version before relying on it.",
  "P5.6. Changes after review or approval. A change to the property, floor plan, orientation, evidence, intended use, construction, utilities or other relevant input after an assessment or approval may invalidate dependent work. Uchit may require new evidence, re-evaluation, a revised scope, additional time and a separately agreed commercial variation. A previously approved or released artifact will not be altered in place.",
  "P5.7. Implementation responsibility. The Client remains responsible for deciding whether and how to implement a recommendation and for engaging the required qualified professionals and contractors. Uchit remains responsible for performing the consultancy services included in the agreed scope with reasonable care and skill, subject to applicable law and the approved Proposal terms."
].join("\n\n");
export const FOUNDER_ACCEPTANCE_DECLARATION_TITLE = "P13 — Client Acceptance Declaration";
export const FOUNDER_ACCEPTANCE_CHECKBOX_COPY = "I confirm that I have reviewed this exact Uchit Vastu Proposal, including its scope, deliverables, exclusions, client responsibilities, estimated timeline, professional fee, GST, total payable, agreed advance, payment plan, professional boundaries, cancellation/refund/delay policy and next steps. I accept the Proposal on behalf of myself or the organisation identified below, and I understand that my statutory rights are not excluded or waived by this acceptance.";
export const FOUNDER_ACCEPTANCE_DECLARATION_COPY = [
  "P13.1. Authority and capacity. I confirm that the name, organisation and designation entered by me are accurate and that I have the legal capacity and authority required to accept this Proposal for the stated Client and prospective project.",
  "P13.2. Information supplied. I confirm that, to the best of my knowledge, the information supplied for the Proposal is complete and accurate. I will promptly tell Uchit about any material error or change.",
  "P13.3. Exact version. My acceptance applies only to the proposal number, version, date and secure artifact presented with this declaration. A later change requires a successor proposal version and a new acceptance; a previously accepted version is not edited in place.",
  "P13.4. Electronic acceptance. By selecting the acceptance checkbox and submitting my full name, I intend to accept the Proposal electronically and to create an auditable record of that decision.",
  "P13.5. Payment and case status. I understand that proposal acceptance is not payment confirmation. A Vastu Case ID and operational workspace are created only after the applicable advance is confirmed or an authorised internal exception is approved. Official report generation, release and delivery remain subject to the payment, evidence, evaluation and approval gates stated in the Proposal and Uchit workflow.",
  "P13.6. No waiver of legal rights. Nothing in this declaration removes any right or remedy that cannot lawfully be excluded, restricted or waived."
].join("\n\n");

type CanonicalFounderLegalPolicyKind = "PROFESSIONAL_BOUNDARIES" | "ACCEPTANCE_DECLARATION" | "CANCELLATION_REFUND_DELAY";

function canonicalFounderLegalPolicy(kind: CanonicalFounderLegalPolicyKind) {
  if (kind === "PROFESSIONAL_BOUNDARIES") return { title: FOUNDER_PROFESSIONAL_BOUNDARIES_TITLE, exactText: FOUNDER_PROFESSIONAL_BOUNDARIES_COPY, configuration: undefined };
  if (kind === "ACCEPTANCE_DECLARATION") return { title: FOUNDER_ACCEPTANCE_DECLARATION_TITLE, exactText: FOUNDER_ACCEPTANCE_DECLARATION_COPY, configuration: { acceptanceCheckboxLabel: FOUNDER_ACCEPTANCE_CHECKBOX_COPY, typedConfirmationMode: "FULL_NAME" as const } };
  return { title: FOUNDER_CANCELLATION_REFUND_DELAY_V2_TITLE, exactText: FOUNDER_CANCELLATION_REFUND_DELAY_V2_COPY, configuration: FOUNDER_CANCELLATION_REFUND_DELAY_V2_CONFIGURATION };
}

export function createFounderCanonicalLegalPolicyVersion(input: { state: AppState; actor: AppUser; founderUserId: string; organisationId: string; kind: CanonicalFounderLegalPolicyKind; reason: string; idempotencyKey: string; now?: Date }) {
  owner(input); safeIdempotency(input.idempotencyKey);
  const canonical = canonicalFounderLegalPolicy(input.kind);
  const contentHash = deterministicContentHash({ exactText: canonical.exactText, configuration: canonical.configuration });
  const requestHash = deterministicContentHash({ kind: input.kind, contentHash, reason: trimmed(input.reason, "Reason") });
  const replay = input.state.founderCommercialLegalPolicies.find((item) => item.organisationId === input.organisationId && item.idempotencyKey === input.idempotencyKey);
  if (replay) { if (replay.requestHash !== requestHash) fail(409, "This idempotency key was used for different canonical legal policy content."); return replay; }
  const existing = input.state.founderCommercialLegalPolicies.find((item) => item.organisationId === input.organisationId && item.kind === input.kind && item.contentHash === contentHash);
  if (existing) return existing;
  const version = Math.max(0, ...input.state.founderCommercialLegalPolicies.filter((item) => item.organisationId === input.organisationId && item.kind === input.kind).map((item) => item.version)) + 1;
  const now = nowIso(input.now);
  const policy: FounderCommercialLegalPolicyRecord = { id: uuid(), organisationId: input.organisationId, kind: input.kind, version, status: "DRAFT", title: canonical.title, exactText: canonical.exactText, contentHash, configuration: structuredClone(canonical.configuration), reason: input.reason.trim(), createdByActorUserId: input.actor.id, createdAt: now, idempotencyKey: input.idempotencyKey, requestHash, recordVersion: 1 };
  input.state.founderCommercialLegalPolicies.push(policy);
  appendAudit(input.state, { organisationId: input.organisationId, eventType: "LEGAL_POLICY_DRAFTED", entityType: "LEGAL_POLICY", entityId: policy.id, actorUserId: input.actor.id, reason: "Canonical Founder legal policy source materialised for owner review.", afterHash: policy.contentHash, idempotencyKey: `audit:${input.idempotencyKey}` });
  return policy;
}

export interface CommercialArtifactStore {
  readImmutable(key: string): Promise<Uint8Array | undefined>;
  putImmutable(key: string, bytes: Uint8Array, contentType: "application/pdf", metadata: Record<string, string>): Promise<void>;
}

export class InMemoryCommercialArtifactStore implements CommercialArtifactStore {
  readonly objects = new Map<string, Uint8Array>();
  async readImmutable(key: string) { const bytes = this.objects.get(key); return bytes?.slice(); }
  async putImmutable(key: string, bytes: Uint8Array) { if (this.objects.has(key)) fail(409, "The immutable commercial artifact already exists."); this.objects.set(key, bytes.slice()); }
}

function owner(input: { actor: AppUser; founderUserId: string; organisationId: string }) {
  if (input.actor.id !== input.founderUserId || input.actor.organisationId !== input.organisationId || input.actor.organisationCapability !== "organisation_owner" || input.actor.role !== "SUPER_ADMIN") fail(403, "Only the configured Founder SUPER_ADMIN owner can perform this action.");
}

function assertExpected(actual: number | undefined, expected: number | undefined, label: string) {
  if (expected === undefined) fail(428, `The latest ${label} version is required.`);
  if ((actual ?? 0) !== expected) fail(409, `The ${label} changed. Reload before retrying.`);
}

function appendAudit(state: AppState, input: { organisationId: string; eventType: string; entityType: string; entityId: string; actorUserId: string; reason: string; proposalVersionId?: string; prospectiveProjectId?: string; beforeHash?: string; afterHash?: string; idempotencyKey: string; requestHash?: string }) {
  const existing = state.founderCommercialAuditEvents.find((event) => event.organisationId === input.organisationId && event.idempotencyKey === input.idempotencyKey);
  if (existing) return existing;
  const event = { id: uuid(), ...input, happenedAt: nowIso(), recordVersion: 1 };
  state.founderCommercialAuditEvents.push(event);
  return event;
}

export function calculateGstPaise(professionalFeePaise: number, gstBasisPoints: number): number {
  safePaise(professionalFeePaise, "Professional fee"); safeBasisPoints(gstBasisPoints);
  const numerator = professionalFeePaise * gstBasisPoints;
  if (!Number.isSafeInteger(numerator)) fail(400, "The commercial amount is outside the supported exact-money range.");
  return Math.floor((numerator + 5_000) / 10_000);
}

export function ensureFounderCommercialPolicy(input: { state: AppState; actor: AppUser; founderUserId: string; organisationId: string; now?: Date }) {
  owner(input);
  const active = input.state.founderCommercialPolicies.find((policy) => policy.organisationId === input.organisationId && policy.status === "ACTIVE");
  if (active) return active;
  const policy: FounderCommercialPolicyVersionRecord = {
    id: uuid(), organisationId: input.organisationId, version: 1, status: "ACTIVE",
    referenceFeePaise: 5_100_000, referenceAdvancePaise: 1_100_000, defaultGstBasisPoints: 1_800,
    balanceDeadlineDays: 7, advanceInvoiceSlaMinutes: 60, refundPolicy: "NO_REFUNDS",
    reason: "Founder commercial policy D1–D9, P17 and P18 initial version.", actorUserId: input.actor.id,
    createdAt: nowIso(input.now), idempotencyKey: "founder-commercial-policy-v1", requestHash: deterministicContentHash({ fee: 5_100_000, advance: 1_100_000, gst: 1_800, deadlineDays: 7, invoiceMinutes: 60, refundPolicy: "NO_REFUNDS" }), recordVersion: 1
  };
  input.state.founderCommercialPolicies.push(policy);
  appendAudit(input.state, { organisationId: input.organisationId, eventType: "COMMERCIAL_POLICY_ACTIVATED", entityType: "COMMERCIAL_POLICY", entityId: policy.id, actorUserId: input.actor.id, reason: policy.reason, afterHash: policy.requestHash, idempotencyKey: "audit:founder-commercial-policy-v1" });
  return policy;
}

export function publishFounderCommercialPolicy(input: { state: AppState; actor: AppUser; founderUserId: string; organisationId: string; referenceFeePaise: number; referenceAdvancePaise: number; defaultGstBasisPoints: number; reason: string; idempotencyKey: string; expectedActiveVersion?: number; now?: Date }) {
  owner(input); safeIdempotency(input.idempotencyKey); safePaise(input.referenceFeePaise, "Reference fee"); safePaise(input.referenceAdvancePaise, "Reference advance"); safeBasisPoints(input.defaultGstBasisPoints);
  const requestHash = deterministicContentHash({ referenceFeePaise: input.referenceFeePaise, referenceAdvancePaise: input.referenceAdvancePaise, defaultGstBasisPoints: input.defaultGstBasisPoints, reason: trimmed(input.reason, "Private reason"), balanceDeadlineDays: 7, advanceInvoiceSlaMinutes: 60, refundPolicy: "NO_REFUNDS" });
  const replay = input.state.founderCommercialPolicies.find((item) => item.organisationId === input.organisationId && item.idempotencyKey === input.idempotencyKey);
  if (replay) { if (replay.requestHash !== requestHash) fail(409, "This idempotency key was used for different policy content."); return replay; }
  const active = ensureFounderCommercialPolicy(input);
  assertExpected(active.version, input.expectedActiveVersion, "active commercial policy");
  active.status = "SUPERSEDED"; active.recordVersion = (active.recordVersion ?? 1) + 1;
  const next: FounderCommercialPolicyVersionRecord = { id: uuid(), organisationId: input.organisationId, version: active.version + 1, status: "ACTIVE", referenceFeePaise: input.referenceFeePaise, referenceAdvancePaise: input.referenceAdvancePaise, defaultGstBasisPoints: input.defaultGstBasisPoints, balanceDeadlineDays: 7, advanceInvoiceSlaMinutes: 60, refundPolicy: "NO_REFUNDS", reason: input.reason.trim(), actorUserId: input.actor.id, createdAt: nowIso(input.now), idempotencyKey: input.idempotencyKey, requestHash, recordVersion: 1 };
  input.state.founderCommercialPolicies.push(next);
  appendAudit(input.state, { organisationId: input.organisationId, eventType: "COMMERCIAL_POLICY_ACTIVATED", entityType: "COMMERCIAL_POLICY", entityId: next.id, actorUserId: input.actor.id, reason: next.reason, beforeHash: active.requestHash, afterHash: requestHash, idempotencyKey: `audit:${input.idempotencyKey}` });
  return next;
}

export function createFounderLegalPolicy(input: { state: AppState; actor: AppUser; founderUserId: string; organisationId: string; kind: FounderCommercialLegalPolicyRecord["kind"]; title: string; exactText: string; configuration?: FounderCommercialLegalPolicyRecord["configuration"]; reason: string; idempotencyKey: string; now?: Date }) {
  owner(input); safeIdempotency(input.idempotencyKey);
  const exactText = trimmed(input.exactText, "Owner/legal-approved exact text");
  if (input.kind === "ACCEPTANCE_DECLARATION" && (!input.configuration?.acceptanceCheckboxLabel?.trim() || (!input.configuration?.typedConfirmationPhrase?.trim() && input.configuration?.typedConfirmationMode !== "FULL_NAME"))) fail(400, "Acceptance checkbox and typed confirmation mode require owner/legal input.");
  if (input.kind === "CANCELLATION_REFUND_DELAY" && input.configuration?.refundPolicy !== "NO_REFUNDS") fail(400, "The owner-approved NO_REFUNDS policy must be explicitly bound to P14 wording.");
  if (input.kind === "INVOICE_STATUTORY_CONFIG" && (!input.configuration?.invoicePrefix?.trim() || !Number.isSafeInteger(input.configuration?.startingSequence) || (input.configuration?.startingSequence ?? 0) < 1 || !input.configuration?.jurisdictionLabel?.trim() || !input.configuration?.requiredFields?.length)) fail(400, "Statutory invoice numbering, jurisdiction and required fields require approved configuration.");
  const requestHash = deterministicContentHash({ kind: input.kind, title: trimmed(input.title, "Policy title"), exactText, configuration: input.configuration, reason: trimmed(input.reason, "Reason") });
  const replay = input.state.founderCommercialLegalPolicies.find((item) => item.organisationId === input.organisationId && item.idempotencyKey === input.idempotencyKey);
  if (replay) { if (replay.requestHash !== requestHash) fail(409, "This idempotency key was used for different legal policy content."); return replay; }
  const version = Math.max(0, ...input.state.founderCommercialLegalPolicies.filter((item) => item.organisationId === input.organisationId && item.kind === input.kind).map((item) => item.version)) + 1;
  const policy: FounderCommercialLegalPolicyRecord = { id: uuid(), organisationId: input.organisationId, kind: input.kind, version, status: "DRAFT", title: input.title.trim(), exactText, contentHash: deterministicContentHash({ exactText, configuration: input.configuration }), configuration: structuredClone(input.configuration), reason: input.reason.trim(), createdByActorUserId: input.actor.id, createdAt: nowIso(input.now), idempotencyKey: input.idempotencyKey, requestHash, recordVersion: 1 };
  input.state.founderCommercialLegalPolicies.push(policy);
  appendAudit(input.state, { organisationId: input.organisationId, eventType: "LEGAL_POLICY_DRAFTED", entityType: "LEGAL_POLICY", entityId: policy.id, actorUserId: input.actor.id, reason: policy.reason, afterHash: policy.contentHash, idempotencyKey: `audit:${input.idempotencyKey}` });
  return policy;
}

export function activateFounderLegalPolicy(input: { state: AppState; actor: AppUser; founderUserId: string; organisationId: string; policyId: string; reason: string; idempotencyKey: string; expectedRecordVersion?: number; now?: Date }) {
  owner(input); safeIdempotency(input.idempotencyKey);
  const requestHash = deterministicContentHash({ action: "ACTIVATE", policyId: input.policyId, reason: trimmed(input.reason, "Activation reason") });
  const policy = input.state.founderCommercialLegalPolicies.find((item) => item.id === input.policyId && item.organisationId === input.organisationId);
  if (!policy) fail(404, "Commercial legal policy not found.");
  const replay = input.state.founderCommercialAuditEvents.find((item) => item.organisationId === input.organisationId && item.idempotencyKey === `audit:${input.idempotencyKey}`);
  if (replay) { if (replay.requestHash !== requestHash) fail(409, "This idempotency key was used for different legal policy activation content."); return policy; }
  assertExpected(policy.recordVersion, input.expectedRecordVersion, "legal policy");
  if (policy.status !== "DRAFT" && policy.status !== "FOUNDER_APPROVED") fail(409, "Only a draft or Founder-approved policy can be activated.");
  const historicalP14Hash = deterministicContentHash({ exactText: FOUNDER_NO_REFUND_POLICY_COPY, configuration: FOUNDER_NO_REFUND_POLICY_CONFIGURATION });
  if (policy.kind === "CANCELLATION_REFUND_DELAY" && policy.contentHash === historicalP14Hash) fail(409, "Historical P14 v1 cannot be activated; use the governed successor version.");
  for (const prior of input.state.founderCommercialLegalPolicies.filter((item) => item.organisationId === input.organisationId && item.kind === policy.kind && item.status === "ACTIVE")) { prior.status = "SUPERSEDED"; prior.supersedesPolicyId = policy.id; prior.recordVersion = (prior.recordVersion ?? 1) + 1; }
  policy.status = "ACTIVE"; policy.approvedByActorUserId = input.actor.id; policy.approvedAt ??= nowIso(input.now); policy.activatedAt = nowIso(input.now); policy.recordVersion = (policy.recordVersion ?? 1) + 1;
  appendAudit(input.state, { organisationId: input.organisationId, eventType: "LEGAL_POLICY_ACTIVATED", entityType: "LEGAL_POLICY", entityId: policy.id, actorUserId: input.actor.id, reason: trimmed(input.reason, "Activation reason"), afterHash: policy.contentHash, idempotencyKey: `audit:${input.idempotencyKey}`, requestHash });
  return policy;
}

export function approveFounderLegalPolicy(input: { state: AppState; actor: AppUser; founderUserId: string; organisationId: string; policyId: string; reason: string; idempotencyKey: string; expectedRecordVersion?: number; now?: Date }) {
  owner(input); safeIdempotency(input.idempotencyKey);
  const requestHash = deterministicContentHash({ action: "APPROVE", policyId: input.policyId, reason: trimmed(input.reason, "Approval reason") });
  const policy = input.state.founderCommercialLegalPolicies.find((item) => item.id === input.policyId && item.organisationId === input.organisationId);
  if (!policy) fail(404, "Commercial legal policy not found.");
  const replay = input.state.founderCommercialAuditEvents.find((item) => item.organisationId === input.organisationId && item.idempotencyKey === `audit:${input.idempotencyKey}`);
  if (replay) { if (replay.requestHash !== requestHash) fail(409, "This idempotency key was used for different legal policy approval content."); return policy; }
  assertExpected(policy.recordVersion, input.expectedRecordVersion, "legal policy");
  if (policy.status !== "DRAFT") fail(409, "Only a draft legal policy can be owner-approved.");
  policy.status = "FOUNDER_APPROVED"; policy.approvedByActorUserId = input.actor.id; policy.approvedAt = nowIso(input.now); policy.recordVersion = (policy.recordVersion ?? 1) + 1;
  appendAudit(input.state, { organisationId: input.organisationId, eventType: "LEGAL_POLICY_APPROVED", entityType: "LEGAL_POLICY", entityId: policy.id, actorUserId: input.actor.id, reason: trimmed(input.reason, "Approval reason"), afterHash: policy.contentHash, idempotencyKey: `audit:${input.idempotencyKey}`, requestHash });
  return policy;
}

export function activateFounderNoRefundPolicy(input: { state: AppState; actor: AppUser; founderUserId: string; organisationId: string; reason: string; idempotencyKey: string; expectedActiveRecordVersion?: number; now?: Date }) {
  owner(input); safeIdempotency(input.idempotencyKey);
  const reason = trimmed(input.reason, "Activation reason");
  const requestHash = deterministicContentHash({ title: FOUNDER_NO_REFUND_POLICY_TITLE, exactText: FOUNDER_NO_REFUND_POLICY_COPY, configuration: FOUNDER_NO_REFUND_POLICY_CONFIGURATION, reason });
  const replay = input.state.founderCommercialLegalPolicies.find((item) => item.organisationId === input.organisationId && item.idempotencyKey === input.idempotencyKey);
  if (replay) { if (replay.requestHash !== requestHash) fail(409, "This idempotency key was used for different no-refund policy content."); return replay; }
  const active = activeLegal(input.state, input.organisationId, "CANCELLATION_REFUND_DELAY");
  assertExpected(active?.recordVersion ?? 0, input.expectedActiveRecordVersion, "active no-refund policy");
  const now = nowIso(input.now);
  const version = Math.max(0, ...input.state.founderCommercialLegalPolicies.filter((item) => item.organisationId === input.organisationId && item.kind === "CANCELLATION_REFUND_DELAY").map((item) => item.version)) + 1;
  const policy: FounderCommercialLegalPolicyRecord = { id: uuid(), organisationId: input.organisationId, kind: "CANCELLATION_REFUND_DELAY", version, status: "ACTIVE", title: FOUNDER_NO_REFUND_POLICY_TITLE, exactText: FOUNDER_NO_REFUND_POLICY_COPY, contentHash: deterministicContentHash({ exactText: FOUNDER_NO_REFUND_POLICY_COPY, configuration: FOUNDER_NO_REFUND_POLICY_CONFIGURATION }), configuration: structuredClone(FOUNDER_NO_REFUND_POLICY_CONFIGURATION), reason, createdByActorUserId: input.actor.id, createdAt: now, approvedByActorUserId: input.actor.id, approvedAt: now, activatedAt: now, idempotencyKey: input.idempotencyKey, requestHash, recordVersion: 1 };
  if (active) { active.status = "SUPERSEDED"; active.supersedesPolicyId = policy.id; active.recordVersion = (active.recordVersion ?? 1) + 1; }
  input.state.founderCommercialLegalPolicies.push(policy);
  appendAudit(input.state, { organisationId: input.organisationId, eventType: "FOUNDER_NO_REFUND_POLICY_ACTIVATED", entityType: "LEGAL_POLICY", entityId: policy.id, actorUserId: input.actor.id, reason: "Founder activated the approved no-refund policy version.", beforeHash: active?.contentHash, afterHash: policy.contentHash, idempotencyKey: `audit:${input.idempotencyKey}` });
  return policy;
}

export function recordFounderCommercialPolicyEvent(input: { state: AppState; actor: AppUser; founderUserId: string; organisationId: string; clientId: string; prospectiveProjectId: string; proposalVersionId?: string; eventType: FounderCommercialPolicyEventType; reason: string; revisedEstimate?: string; replacementDateOrSlot?: string; idempotencyKey: string; expectedProjectRecordVersion?: number; now?: Date }) {
  owner(input); safeIdempotency(input.idempotencyKey);
  const project = input.state.prospectiveProjects.find((item) => item.id === input.prospectiveProjectId && item.organisationId === input.organisationId && item.clientId === input.clientId);
  if (!project) fail(404, "Prospective project not found.");
  assertExpected(project.recordVersion, input.expectedProjectRecordVersion, "prospective project");
  if (input.proposalVersionId && !input.state.founderProposalVersions.some((item) => item.id === input.proposalVersionId && item.organisationId === input.organisationId && item.clientId === input.clientId && item.prospectiveProjectId === project.id)) fail(404, "Proposal version not found.");
  const reason = trimmed(input.reason, "Event reason");
  const revisedEstimate = input.revisedEstimate?.trim(); const replacementDateOrSlot = input.replacementDateOrSlot?.trim();
  if (input.eventType === "CLIENT_DEPENDENCY_DELAY_RECORDED" && !revisedEstimate) fail(400, "A revised estimated schedule is required for a client-dependency delay.");
  if (input.eventType === "UCHIT_RESCHEDULE_RECORDED" && !replacementDateOrSlot) fail(400, "A replacement date or slot is required for an Uchit reschedule.");
  const requestHash = deterministicContentHash({ clientId: input.clientId, prospectiveProjectId: input.prospectiveProjectId, proposalVersionId: input.proposalVersionId, eventType: input.eventType, reason, revisedEstimate, replacementDateOrSlot });
  const replay = input.state.founderCommercialPolicyEvents.find((item) => item.organisationId === input.organisationId && item.idempotencyKey === input.idempotencyKey);
  if (replay) { if (replay.requestHash !== requestHash) fail(409, "This idempotency key was used for a different commercial policy event."); return replay; }
  const event = { id: uuid(), organisationId: input.organisationId, clientId: input.clientId, prospectiveProjectId: input.prospectiveProjectId, proposalVersionId: input.proposalVersionId, eventType: input.eventType, reason, revisedEstimate, replacementDateOrSlot, noRefundOrCreditEntitlement: true as const, paymentHistoryPreserved: true as const, createdByActorUserId: input.actor.id, createdAt: nowIso(input.now), idempotencyKey: input.idempotencyKey, requestHash, recordVersion: 1 as const };
  input.state.founderCommercialPolicyEvents.push(event);
  appendAudit(input.state, { organisationId: input.organisationId, eventType: input.eventType, entityType: "PROSPECTIVE_PROJECT", entityId: project.id, actorUserId: input.actor.id, reason: "Commercial cancellation or schedule event recorded; no payment or workflow state changed.", proposalVersionId: input.proposalVersionId, prospectiveProjectId: project.id, afterHash: requestHash, idempotencyKey: `audit:${input.idempotencyKey}` });
  return event;
}

export function activateFounderApprovedLegalSections(input: { state: AppState; actor: AppUser; founderUserId: string; organisationId: string; reason: string; idempotencyKey: string; now?: Date }) {
  owner(input); safeIdempotency(input.idempotencyKey); const reason = trimmed(input.reason, "Approval reason");
  const ensure = (kind: "PROFESSIONAL_BOUNDARIES" | "ACCEPTANCE_DECLARATION", title: string, exactText: string, configuration?: FounderCommercialLegalPolicyRecord["configuration"]) => {
    const current = activeLegal(input.state, input.organisationId, kind); const expectedHash = deterministicContentHash({ exactText, configuration });
    if (current) { if (current.contentHash !== expectedHash) fail(409, `An active ${kind} policy already exists with different content. Create an explicit successor version.`); return current; }
    const draft = createFounderLegalPolicy({ ...input, kind, title, exactText, configuration, reason, idempotencyKey: `${input.idempotencyKey}:${kind}:draft` });
    return activateFounderLegalPolicy({ ...input, policyId: draft.id, reason, idempotencyKey: `${input.idempotencyKey}:${kind}:active`, expectedRecordVersion: draft.recordVersion });
  };
  const professionalBoundaries = ensure("PROFESSIONAL_BOUNDARIES", FOUNDER_PROFESSIONAL_BOUNDARIES_TITLE, FOUNDER_PROFESSIONAL_BOUNDARIES_COPY);
  const acceptanceDeclaration = ensure("ACCEPTANCE_DECLARATION", FOUNDER_ACCEPTANCE_DECLARATION_TITLE, FOUNDER_ACCEPTANCE_DECLARATION_COPY, { acceptanceCheckboxLabel: FOUNDER_ACCEPTANCE_CHECKBOX_COPY, typedConfirmationMode: "FULL_NAME" });
  const currentP14 = activeLegal(input.state, input.organisationId, "CANCELLATION_REFUND_DELAY");
  const cancellationRefundDelay = currentP14?.contentHash === deterministicContentHash({ exactText: FOUNDER_NO_REFUND_POLICY_COPY, configuration: FOUNDER_NO_REFUND_POLICY_CONFIGURATION }) ? currentP14 : activateFounderNoRefundPolicy({ ...input, idempotencyKey: `${input.idempotencyKey}:P14:active`, expectedActiveRecordVersion: currentP14?.recordVersion ?? 0 });
  return { professionalBoundaries, acceptanceDeclaration, cancellationRefundDelay };
}

export function createFounderProposalTemplate(input: { state: AppState; actor: AppUser; founderUserId: string; organisationId: string; serviceType: VastuServiceType; name: string; kind: "DEFAULT" | "REUSABLE_VARIANT"; scopeItems: FounderProposalTemplateVersionRecord["scopeItems"]; deliverables: FounderProposalTemplateVersionRecord["deliverables"]; reason: string; idempotencyKey: string; now?: Date }) {
  owner(input); safeIdempotency(input.idempotencyKey);
  if (!input.scopeItems.length || !input.deliverables.length) fail(400, "Scope and deliverables must be explicitly configured; brochure text is never inferred.");
  const requestHash = deterministicContentHash({ serviceType: input.serviceType, name: trimmed(input.name, "Template name"), kind: input.kind, scopeItems: input.scopeItems, deliverables: input.deliverables, reason: trimmed(input.reason, "Reason") });
  const replay = input.state.founderProposalTemplates.find((item) => item.organisationId === input.organisationId && item.idempotencyKey === input.idempotencyKey);
  if (replay) { if (replay.requestHash !== requestHash) fail(409, "This idempotency key was used for different template content."); return replay; }
  const version = Math.max(0, ...input.state.founderProposalTemplates.filter((item) => item.organisationId === input.organisationId && item.serviceType === input.serviceType).map((item) => item.version)) + 1;
  const template: FounderProposalTemplateVersionRecord = { id: uuid(), organisationId: input.organisationId, serviceType: input.serviceType, version, name: input.name.trim(), kind: input.kind, status: "DRAFT", scopeItems: structuredClone(input.scopeItems), deliverables: structuredClone(input.deliverables), contentHash: deterministicContentHash({ scopeItems: input.scopeItems, deliverables: input.deliverables }), reason: input.reason.trim(), actorUserId: input.actor.id, createdAt: nowIso(input.now), idempotencyKey: input.idempotencyKey, requestHash, recordVersion: 1 };
  input.state.founderProposalTemplates.push(template);
  return template;
}

export function activateFounderProposalTemplate(input: { state: AppState; actor: AppUser; founderUserId: string; organisationId: string; templateId: string; reason: string; idempotencyKey: string; expectedRecordVersion?: number; now?: Date }) {
  owner(input); safeIdempotency(input.idempotencyKey);
  const template = input.state.founderProposalTemplates.find((item) => item.id === input.templateId && item.organisationId === input.organisationId);
  if (!template) fail(404, "Proposal template not found.");
  assertExpected(template.recordVersion, input.expectedRecordVersion, "proposal template");
  if (template.status !== "DRAFT") fail(409, "Only a draft template can be activated.");
  if (template.kind === "DEFAULT") for (const prior of input.state.founderProposalTemplates.filter((item) => item.organisationId === input.organisationId && item.serviceType === template.serviceType && item.kind === "DEFAULT" && item.status === "ACTIVE")) { prior.status = "SUPERSEDED"; prior.supersedesTemplateId = template.id; prior.recordVersion = (prior.recordVersion ?? 1) + 1; }
  template.status = "ACTIVE"; template.activatedAt = nowIso(input.now); template.recordVersion = (template.recordVersion ?? 1) + 1;
  appendAudit(input.state, { organisationId: input.organisationId, eventType: "PROPOSAL_TEMPLATE_ACTIVATED", entityType: "PROPOSAL_TEMPLATE", entityId: template.id, actorUserId: input.actor.id, reason: trimmed(input.reason, "Activation reason"), afterHash: template.contentHash, idempotencyKey: `audit:${input.idempotencyKey}` });
  return template;
}

function commercialTerms(input: { classification: FounderEngagementClassification; professionalFeePaise: number; appliedGstBasisPoints: number; agreedAdvancePaise: number; policy: FounderCommercialPolicyVersionRecord; feeDeviationReason?: string; classificationReason?: string; gstDeviationReason?: string; advanceExceptionReason?: string }) {
  safePaise(input.professionalFeePaise, "Professional fee"); safePaise(input.agreedAdvancePaise, "Agreed advance"); safeBasisPoints(input.appliedGstBasisPoints);
  const nonStandard = input.classification !== "STANDARD_PAID";
  if (nonStandard && !input.classificationReason?.trim()) fail(400, "A private reason is required for a non-standard engagement classification.");
  if (input.classification === "INTERNAL_COMPLIMENTARY" && (input.professionalFeePaise !== 0 || input.appliedGstBasisPoints !== 0 || input.agreedAdvancePaise !== 0)) fail(400, "Internal complimentary engagements require fee, GST and advance to be zero.");
  if (input.classification !== "INTERNAL_COMPLIMENTARY" && input.professionalFeePaise !== input.policy.referenceFeePaise && !input.feeDeviationReason?.trim()) fail(400, "A private fee deviation reason is required.");
  if (input.classification !== "INTERNAL_COMPLIMENTARY" && input.appliedGstBasisPoints !== input.policy.defaultGstBasisPoints && !input.gstDeviationReason?.trim()) fail(400, "A private GST deviation reason is required.");
  const advanceException = input.classification !== "INTERNAL_COMPLIMENTARY" && input.agreedAdvancePaise < input.policy.referenceAdvancePaise;
  if (advanceException && (!nonStandard || !input.advanceExceptionReason?.trim())) fail(400, "A lower or zero advance requires a non-standard classification and Yogesh-approved private exception reason.");
  const gstAmountPaise = calculateGstPaise(input.professionalFeePaise, input.appliedGstBasisPoints);
  const totalPayablePaise = input.professionalFeePaise + gstAmountPaise;
  if (!Number.isSafeInteger(totalPayablePaise) || input.agreedAdvancePaise > totalPayablePaise) fail(400, "Agreed advance cannot exceed total payable.");
  return { engagementClassification: input.classification, professionalFeePaise: input.professionalFeePaise, referenceFeePaise: input.policy.referenceFeePaise, gstReferenceBasisPoints: input.policy.defaultGstBasisPoints, gstAppliedBasisPoints: input.appliedGstBasisPoints, gstAmountPaise, totalPayablePaise, agreedAdvancePaise: input.agreedAdvancePaise, remainingBalancePaise: totalPayablePaise, feeDeviationReason: input.feeDeviationReason?.trim(), classificationReason: input.classificationReason?.trim(), gstDeviationReason: input.gstDeviationReason?.trim(), advanceExceptionReason: input.advanceExceptionReason?.trim(), advanceExceptionApproved: !advanceException || Boolean(input.advanceExceptionReason?.trim()), paymentMilestones: [{ id: "advance", label: "Agreed advance", amountPaise: input.agreedAdvancePaise, trigger: "After proposal acceptance and before case creation, unless an authorised exception applies." }, { id: "balance", label: "Remaining balance", amountPaise: totalPayablePaise - input.agreedAdvancePaise, trigger: "Due seven calendar days after confirmed advance; workflow prerequisites remain enforced." }] };
}

export function createFounderProposalDraft(input: { state: AppState; actor: AppUser; founderUserId: string; organisationId: string; clientId: string; prospectiveProjectId: string; classification: FounderEngagementClassification; professionalFeePaise: number; appliedGstBasisPoints: number; agreedAdvancePaise: number; feeDeviationReason?: string; classificationReason?: string; gstDeviationReason?: string; advanceExceptionReason?: string; idempotencyKey: string; expectedProjectVersion?: number; now?: Date }) {
  owner(input); safeIdempotency(input.idempotencyKey);
  const requestHash = deterministicContentHash({ clientId: input.clientId, prospectiveProjectId: input.prospectiveProjectId, classification: input.classification, professionalFeePaise: input.professionalFeePaise, appliedGstBasisPoints: input.appliedGstBasisPoints, agreedAdvancePaise: input.agreedAdvancePaise, feeDeviationReason: input.feeDeviationReason, classificationReason: input.classificationReason, gstDeviationReason: input.gstDeviationReason, advanceExceptionReason: input.advanceExceptionReason });
  const replay = input.state.founderProposalVersions.find((item) => item.organisationId === input.organisationId && item.idempotencyKey === input.idempotencyKey);
  if (replay) { if (replay.requestHash !== requestHash) fail(409, "This idempotency key was used for different proposal content."); return replay; }
  const client = input.state.clients.find((item) => item.id === input.clientId && (!item.organisationId || item.organisationId === input.organisationId));
  const project = input.state.prospectiveProjects.find((item) => item.id === input.prospectiveProjectId && item.organisationId === input.organisationId && item.clientId === input.clientId);
  if (!client || !project) fail(404, "Client and prospective project must share this organisation scope.");
  assertExpected(project.recordVersion, input.expectedProjectVersion, "prospective project");
  const response = input.state.qualificationResponseVersions.find((item) => item.id === project.responseVersionId && item.organisationId === input.organisationId && item.clientId === input.clientId && item.status === "SUBMITTED");
  if (!response) fail(409, "An exact submitted qualification response is required before proposal drafting.");
  const serviceType = project.serviceType;
  if (!serviceType) fail(409, "Select Existing Space or New Construction on the prospective project before proposal drafting.");
  const template = input.state.founderProposalTemplates.find((item) => item.organisationId === input.organisationId && item.serviceType === serviceType && item.kind === "DEFAULT" && item.status === "ACTIVE");
  const brochureKey = serviceType === "EXISTING_SPACE" ? "BROCHURE_EXISTING_SPACE_V2" : "BROCHURE_NEW_CONSTRUCTION_V2";
  const brochureManifest = APPROVED_FOUNDER_ASSETS.find((item) => item.key === brochureKey)!;
  const brochureAsset = input.state.mediaAssets.find((item) => item.id === `media:${brochureKey.toLowerCase()}` && item.organisationId === input.organisationId);
  const brochureVersion = input.state.mediaAssetVersions.find((item) => item.id === brochureAsset?.activeVersionId && item.organisationId === input.organisationId && item.status === "ACTIVE" && item.clientSendable && item.checksumSha256 === brochureManifest.checksumSha256);
  if (!template && !brochureVersion) fail(409, "Activate the exact approved brochure before proposal drafting; no scope is inferred from brochure text.");
  const policy = ensureFounderCommercialPolicy(input);
  const terms = commercialTerms({ classification: input.classification, professionalFeePaise: input.professionalFeePaise, appliedGstBasisPoints: input.appliedGstBasisPoints, agreedAdvancePaise: input.agreedAdvancePaise, policy, feeDeviationReason: input.feeDeviationReason, classificationReason: input.classificationReason, gstDeviationReason: input.gstDeviationReason, advanceExceptionReason: input.advanceExceptionReason });
  const intake = input.state.clientIntakeProfiles.filter((item) => item.clientId === client.id && (!item.organisationId || item.organisationId === input.organisationId)).sort((a, b) => b.version - a.version)[0];
  const proposalDate = nowIso(input.now);
  const content: FounderProposalContentSnapshot = {
    clientProject: { clientName: client.displayName, clientId: client.id, prospectiveProjectId: project.id, projectKind: project.kind, serviceType, propertyType: intake?.propertyContext?.propertyType, propertyLocation: intake?.propertyContext?.cityCountry ?? client.city, knownFloorCount: undefined, primaryRequirement: intake?.needs?.mainChallenge, proposalDate },
    requirements: { qualificationResponseVersionId: response.id, qualificationResponseHash: response.answersHash, exactAnswerSnapshotHash: deterministicContentHash(response.answers) },
    scopeItems: template?.scopeItems.map((item) => ({ ...structuredClone(item), prospectiveProjectId: project.id })) ?? [],
    deliverables: template?.deliverables.map((item) => ({ ...structuredClone(item), prospectiveProjectId: project.id })) ?? [],
    interactions: { includedReviewRounds: 0, includedPresentationCalls: 0, clarificationPeriodDays: 0, expectedResponseTime: "", additionalInteractionTreatment: "" },
    timeline: { expectedCommencement: "", estimatedDateRange: "", milestones: [], prerequisites: [], clientDependencies: [], pauseOrExtensionConditions: [], isEstimate: true },
    commercial: terms,
    projectExclusions: [],
    policyBindings: { commercialPolicyId: policy.id, templateVersionId: template?.id, brochureAssetVersionId: brochureVersion?.id, brochureAssetKey: brochureVersion ? brochureKey : undefined, brochureChecksumSha256: brochureVersion?.checksumSha256 },
    nextSteps: { advanceRequired: input.classification !== "INTERNAL_COMPLIMENTARY", balanceAfterAdvanceDeadline: true, paymentProofRequiresConfirmation: true, reportGatesRemainServerEnforced: true }
  };
  const proposal: FounderProposalVersionRecord = { id: uuid(), proposalId: uuid(), version: 1, organisationId: input.organisationId, clientId: client.id, prospectiveProjectId: project.id, serviceType, status: "DRAFT", currentStep: 1, content, contentHash: deterministicContentHash(content), createdAt: proposalDate, createdByActorUserId: input.actor.id, recordVersion: 1, idempotencyKey: input.idempotencyKey, requestHash };
  input.state.founderProposalVersions.push(proposal);
  input.state.founderBalanceDeadlines.push({ id: uuid(), organisationId: input.organisationId, proposalVersionId: proposal.id, clientId: client.id, prospectiveProjectId: project.id, status: terms.totalPayablePaise === 0 ? "WAIVED" : "NOT_DUE", remainingAmountPaise: terms.totalPayablePaise, commercialPolicyId: policy.id, commercialPolicyVersion: policy.version, engagementClassification: input.classification, recordVersion: 1 });
  appendAudit(input.state, { organisationId: input.organisationId, eventType: "PROPOSAL_DRAFT_CREATED", entityType: "PROPOSAL_VERSION", entityId: proposal.id, actorUserId: input.actor.id, reason: "Founder created a versioned proposal draft.", proposalVersionId: proposal.id, prospectiveProjectId: project.id, afterHash: proposal.contentHash, idempotencyKey: `audit:${input.idempotencyKey}` });
  return proposal;
}

/**
 * Inbound Founder onboarding is deliberately a separate contract from the
 * client-acceptance proposal lifecycle. Review is the commercial decision
 * point; this action records the agreed terms, optional internal advance, and
 * creates the native case hierarchy exactly once.
 */
export function createFounderInboundOnboarding(input: {
  state: AppState; actor: AppUser; founderUserId: string; organisationId: string;
  clientId: string; prospectiveProjectId: string; classification: FounderEngagementClassification;
  professionalFeePaise: number; appliedGstBasisPoints: number; agreedAdvancePaise: number;
  advanceReceivedPaise: number; paymentId?: string; paymentMode?: string;
  feeDeviationReason?: string; classificationReason?: string; gstDeviationReason?: string; advanceExceptionReason?: string;
  idempotencyKey: string; expectedProjectVersion?: number; expectedRevision?: number; now?: Date;
}) {
  owner(input); safeIdempotency(input.idempotencyKey); safePaise(input.advanceReceivedPaise, "Advance received");
  const requestHash = deterministicContentHash({ clientId: input.clientId, prospectiveProjectId: input.prospectiveProjectId, classification: input.classification, professionalFeePaise: input.professionalFeePaise, appliedGstBasisPoints: input.appliedGstBasisPoints, agreedAdvancePaise: input.agreedAdvancePaise, advanceReceivedPaise: input.advanceReceivedPaise, paymentId: input.paymentId, paymentMode: input.paymentMode, feeDeviationReason: input.feeDeviationReason, classificationReason: input.classificationReason, gstDeviationReason: input.gstDeviationReason, advanceExceptionReason: input.advanceExceptionReason });
  const auditKey = `audit:founder-inbound-onboarding:${input.idempotencyKey}`;
  const replay = input.state.founderCommercialAuditEvents.find((event) => event.organisationId === input.organisationId && event.idempotencyKey === auditKey);
  if (replay) {
    if (replay.requestHash !== requestHash) fail(409, "This idempotency key was used for different onboarding content.");
    const proposal = input.state.founderProposalVersions.find((item) => item.id === replay.proposalVersionId && item.organisationId === input.organisationId);
    const caseRecord = input.state.vastuCases.find((item) => item.id === replay.entityId && item.organisationId === input.organisationId);
    if (!proposal || !caseRecord) fail(409, "The prior onboarding result is unavailable; reload before retrying.");
    const advance = input.state.founderCommercialPaymentConfirmations.find((item) => item.proposalVersionId === proposal.id && item.idempotencyKey === input.idempotencyKey);
    const project = input.state.projects.find((item) => item.id === caseRecord.projectId && item.organisationId === input.organisationId);
    const floor = input.state.floorWorkspaces.find((item) => item.projectId === caseRecord.projectId && item.organisationId === input.organisationId);
    return { proposal, advance, caseRecord, project, floor, replayed: true };
  }
  const client = input.state.clients.find((item) => item.id === input.clientId && item.organisationId === input.organisationId);
  const project = input.state.prospectiveProjects.find((item) => item.id === input.prospectiveProjectId && item.organisationId === input.organisationId && item.clientId === input.clientId);
  if (!client || !project) fail(404, "Client and prospective project must share this organisation scope.");
  if (!client.pipelineStage || !["WON", "ONBOARDING"].includes(client.pipelineStage)) fail(409, "The lead must be Converted/WON before commercial onboarding.");
  if (!project.displayName?.trim() || !project.propertyLocation?.trim() || !project.propertyType || !project.serviceType) fail(409, "Complete the structured project scope before onboarding.");
  if (project.caseId || input.state.vastuCases.some((item) => item.organisationId === input.organisationId && item.clientId === client.id && item.proposalId && item.projectId)) fail(409, "This project already has a Case; refresh before retrying.");
  assertExpected(project.recordVersion, input.expectedProjectVersion, "prospective project");
  const serviceType = project.serviceType;
  const template = input.state.founderProposalTemplates.find((item) => item.organisationId === input.organisationId && item.serviceType === serviceType && item.kind === "DEFAULT" && item.status === "ACTIVE");
  const brochureKey = serviceType === "EXISTING_SPACE" ? "BROCHURE_EXISTING_SPACE_V2" : "BROCHURE_NEW_CONSTRUCTION_V2";
  const brochureManifest = APPROVED_FOUNDER_ASSETS.find((item) => item.key === brochureKey)!;
  const brochureAsset = input.state.mediaAssets.find((item) => item.id === `media:${brochureKey.toLowerCase()}` && item.organisationId === input.organisationId);
  const brochureVersion = input.state.mediaAssetVersions.find((item) => item.id === brochureAsset?.activeVersionId && item.organisationId === input.organisationId && item.status === "ACTIVE" && item.clientSendable && item.checksumSha256 === brochureManifest.checksumSha256);
  if (!template && !brochureVersion) fail(409, "Activate the exact approved brochure before onboarding; no scope is inferred from brochure text.");
  const policy = ensureFounderCommercialPolicy(input);
  const terms = commercialTerms({ classification: input.classification, professionalFeePaise: input.professionalFeePaise, appliedGstBasisPoints: input.appliedGstBasisPoints, agreedAdvancePaise: input.agreedAdvancePaise, policy, feeDeviationReason: input.feeDeviationReason, classificationReason: input.classificationReason, gstDeviationReason: input.gstDeviationReason, advanceExceptionReason: input.advanceExceptionReason });
  if (input.classification === "INTERNAL_COMPLIMENTARY") {
    if (input.advanceReceivedPaise !== 0 || input.paymentId || input.paymentMode) fail(400, "Internal complimentary onboarding cannot create a payment or advance record.");
  } else {
    if (input.advanceReceivedPaise <= 0 || input.advanceReceivedPaise < terms.agreedAdvancePaise) fail(409, "Record receipt of the agreed advance before starting a paid Case.");
    if (input.advanceReceivedPaise > terms.totalPayablePaise) fail(409, "Advance received cannot exceed the total payable.");
    if (!input.paymentId?.trim()) fail(400, "A private internal payment reference is required when recording an advance.");
  }
  if (input.paymentId && input.state.founderCommercialPaymentConfirmations.some((item) => item.organisationId === input.organisationId && item.paymentId === input.paymentId)) fail(409, "This payment reference is already bound to a commercial confirmation.");
  const intake = input.state.clientIntakeProfiles.filter((item) => item.clientId === client.id && (!item.organisationId || item.organisationId === input.organisationId)).sort((a, b) => b.version - a.version)[0];
  const proposalDate = nowIso(input.now);
  const content: FounderProposalContentSnapshot = {
    clientProject: { clientName: client.displayName, clientId: client.id, prospectiveProjectId: project.id, projectKind: project.kind, serviceType, propertyType: project.propertyType, propertyLocation: project.propertyLocation, knownFloorCount: project.floorCount, primaryRequirement: intake?.needs?.mainChallenge, proposalDate },
    requirements: { refinedSummary: "Structured project scope captured during Founder review; qualification questionnaire remains optional supporting evidence." },
    scopeItems: template?.scopeItems.map((item) => ({ ...structuredClone(item), prospectiveProjectId: project.id })) ?? [],
    deliverables: template?.deliverables.map((item) => ({ ...structuredClone(item), prospectiveProjectId: project.id })) ?? [],
    interactions: { includedReviewRounds: 0, includedPresentationCalls: 0, clarificationPeriodDays: 0, expectedResponseTime: "", additionalInteractionTreatment: "" },
    timeline: { expectedCommencement: "", estimatedDateRange: "", milestones: [], prerequisites: [], clientDependencies: [], pauseOrExtensionConditions: [], isEstimate: true },
    commercial: { ...terms, paymentMilestones: terms.paymentMilestones.map((milestone) => milestone.id === "advance" ? { ...milestone, trigger: "Recorded during the Founder review/onboarding call before Case creation." } : milestone) },
    projectExclusions: [], policyBindings: { commercialPolicyId: policy.id, templateVersionId: template?.id, brochureAssetVersionId: brochureVersion?.id, brochureAssetKey: brochureVersion ? brochureKey : undefined, brochureChecksumSha256: brochureVersion?.checksumSha256 },
    nextSteps: { advanceRequired: input.classification !== "INTERNAL_COMPLIMENTARY", balanceAfterAdvanceDeadline: true, paymentProofRequiresConfirmation: false, reportGatesRemainServerEnforced: true }
  };
  const proposal: FounderProposalVersionRecord = { id: uuid(), proposalId: uuid(), version: 1, organisationId: input.organisationId, clientId: client.id, prospectiveProjectId: project.id, serviceType, status: "FOUNDER_AGREED", currentStep: 1, content, contentHash: deterministicContentHash(content), createdAt: proposalDate, createdByActorUserId: input.actor.id, recordVersion: 1, idempotencyKey: input.idempotencyKey, requestHash };
  const deadline: FounderBalanceDeadlineRecord = { id: uuid(), organisationId: input.organisationId, proposalVersionId: proposal.id, clientId: client.id, prospectiveProjectId: project.id, status: terms.totalPayablePaise === 0 ? "WAIVED" : "NOT_DUE", remainingAmountPaise: terms.totalPayablePaise, commercialPolicyId: policy.id, commercialPolicyVersion: policy.version, engagementClassification: input.classification, recordVersion: 1 };
  input.state.founderProposalVersions.push(proposal); input.state.founderBalanceDeadlines.push(deadline);
  let advance: AppState["founderCommercialPaymentConfirmations"][number] | undefined;
  if (input.classification !== "INTERNAL_COMPLIMENTARY") {
    advance = { id: uuid(), organisationId: input.organisationId, proposalVersionId: proposal.id, clientId: client.id, prospectiveProjectId: project.id, paymentId: input.paymentId!.trim(), type: "ADVANCE", amountPaise: input.advanceReceivedPaise, confirmedAt: proposalDate, confirmedByActorUserId: input.actor.id, proposalContentHash: proposal.contentHash, paymentMode: input.paymentMode?.trim() || undefined, idempotencyKey: input.idempotencyKey, requestHash: deterministicContentHash({ proposalId: proposal.id, paymentId: input.paymentId, amountPaise: input.advanceReceivedPaise, paymentMode: input.paymentMode }), recordVersion: 1 };
    input.state.founderCommercialPaymentConfirmations.push(advance); deadline.advancePaymentConfirmationId = advance.id; deadline.advanceConfirmedAt = proposalDate; deadline.status = advance.amountPaise === terms.totalPayablePaise ? "PAID" : "DUE"; deadline.remainingAmountPaise = Math.max(0, terms.totalPayablePaise - advance.amountPaise); deadline.dueAt = addDays(new Date(proposalDate), policy.balanceDeadlineDays).toISOString(); deadline.recordVersion += 1;
  }
  const now = proposalDate; const caseId = uuid(); const nativeProjectId = uuid(); const floorId = uuid(); const caseNumber = `UV-${new Date(now).getUTCFullYear()}-${String(input.state.vastuCases.length + 1).padStart(3, "0")}`;
  const caseRecord: VastuCaseRecord = { id: caseId, organisationId: input.organisationId, caseNumber, clientId: client.id, proposalId: proposal.id, projectId: nativeProjectId, status: "CASE_CREATED", reportStatus: "DRAFT", orientationLocked: false, balanceApproved: false, fullPaymentApproved: false, serviceType, canonicalStage: "UNDERSTAND", revisionNumber: 1, recordVersion: 1, evaluationArchitectureVersion: "V1" };
  const nativeProject: VastuProjectRecord = { id: nativeProjectId, organisationId: input.organisationId, clientId: client.id, activeCaseId: caseId, propertyName: project.displayName, status: "IN_PROGRESS", createdAt: now };
  const floor: FloorWorkspaceRecord = { id: floorId, organisationId: input.organisationId, caseId, projectId: nativeProjectId, floorLabel: "Ground floor", status: "DRAFT", locked: false, evidenceUploads: [], idempotencyKey: `inbound-floor:${input.idempotencyKey}`, evaluationArchitectureVersion: "V1" };
  input.state.vastuCases.unshift(caseRecord); input.state.projects.unshift(nativeProject); input.state.floorWorkspaces.unshift(floor);
  input.state.casePropertyContexts.unshift({ id: uuid(), organisationId: input.organisationId, clientId: client.id, caseId, projectId: nativeProjectId, propertyContext: { serviceInterest: serviceType, propertyType: project.propertyType, propertyStatus: "Known", cityCountry: project.propertyLocation, constraints: project.importantNotes, floorCount: project.floorCount ?? 1 }, version: 1, idempotencyKey: `inbound-property-context:${input.idempotencyKey}`, createdAt: now, updatedAt: now, status: "CURRENT", createdByActorUserId: input.actor.id, updatedByActorUserId: input.actor.id, recordVersion: 1 });
  project.caseId = caseId; project.status = "CONVERTED"; project.recordVersion = (project.recordVersion ?? 0) + 1; client.pipelineStage = "ONBOARDING"; client.recordVersion = (client.recordVersion ?? 0) + 1; proposal.recordVersion += 1;
  input.state.timelineEvents.unshift({ id: uuid(), organisationId: input.organisationId, clientId: client.id, category: "Commercial", headline: "Founder inbound onboarding completed", details: `Case ${caseNumber} opened from mutually agreed Founder commercial terms.`, happenedAt: now, actorRole: input.actor.role, actorId: input.actor.id, actorName: input.actor.fullName });
  appendAudit(input.state, { organisationId: input.organisationId, eventType: "FOUNDER_INBOUND_ONBOARDING_COMPLETED", entityType: "VASTU_CASE", entityId: caseId, actorUserId: input.actor.id, reason: input.classification === "INTERNAL_COMPLIMENTARY" ? "Founder agreed an internal complimentary engagement during review." : "Founder agreed commercial terms and recorded the advance during review.", proposalVersionId: proposal.id, prospectiveProjectId: project.id, afterHash: requestHash, idempotencyKey: auditKey, requestHash });
  return { proposal, advance, caseRecord, project: nativeProject, floor, replayed: false };
}

export function autosaveFounderProposalStep(input: { state: AppState; actor: AppUser; founderUserId: string; organisationId: string; proposalVersionId: string; step: FounderProposalStep; expectedRecordVersion?: number; idempotencyKey: string; patch: Record<string, unknown>; now?: Date }) {
  owner(input); safeIdempotency(input.idempotencyKey);
  const proposal = input.state.founderProposalVersions.find((item) => item.id === input.proposalVersionId && item.organisationId === input.organisationId);
  if (!proposal) fail(404, "Proposal version not found.");
  const requestHash = deterministicContentHash({ proposalVersionId: proposal.id, step: input.step, patch: input.patch });
  const replay = input.state.founderCommercialAuditEvents.find((item) => item.organisationId === input.organisationId && item.idempotencyKey === `audit:${input.idempotencyKey}`);
  if (replay) { if (replay.afterHash !== requestHash) fail(409, "This idempotency key was used for different proposal changes."); return proposal; }
  assertExpected(proposal.recordVersion, input.expectedRecordVersion, "proposal");
  if (proposal.status !== "DRAFT") fail(409, "Approved or sent proposal content is immutable. Create a successor draft.");
  const allowed: Record<number, string[]> = { 1: [], 2: ["refinedSummary"], 3: ["scopeItems", "projectExclusions"], 4: ["deliverables", "interactions"], 5: ["timeline", "commercial"], 6: ["validityEndsAt"] };
  if (Object.keys(input.patch).some((key) => !allowed[input.step].includes(key))) fail(400, "The proposal step contains an unsupported field.");
  const beforeHash = proposal.contentHash;
  if (input.step === 2 && "refinedSummary" in input.patch) { proposal.content.requirements.refinedSummary = trimmed(String(input.patch.refinedSummary ?? ""), "Refined proposal summary"); proposal.content.requirements.refinedByActorUserId = input.actor.id; proposal.content.requirements.refinedAt = nowIso(input.now); }
  if (input.step === 3 && Array.isArray(input.patch.scopeItems)) proposal.content.scopeItems = structuredClone(input.patch.scopeItems) as FounderProposalContentSnapshot["scopeItems"];
  if (input.step === 3 && Array.isArray(input.patch.projectExclusions)) proposal.content.projectExclusions = structuredClone(input.patch.projectExclusions) as string[];
  if (input.step === 4 && Array.isArray(input.patch.deliverables)) proposal.content.deliverables = structuredClone(input.patch.deliverables) as FounderProposalContentSnapshot["deliverables"];
  if (input.step === 4 && input.patch.interactions && typeof input.patch.interactions === "object") proposal.content.interactions = structuredClone(input.patch.interactions) as FounderProposalContentSnapshot["interactions"];
  if (input.step === 5 && input.patch.timeline && typeof input.patch.timeline === "object") proposal.content.timeline = { ...(structuredClone(input.patch.timeline) as FounderProposalContentSnapshot["timeline"]), isEstimate: true };
  if (input.step === 5 && input.patch.commercial && typeof input.patch.commercial === "object") {
    if (input.state.founderCommercialPaymentConfirmations.some((item) => item.proposalVersionId === proposal.id)) fail(409, "Commercial terms cannot change after a confirmed payment. Create a successor commercial version.");
    const raw = input.patch.commercial as Record<string, unknown>; const policy = input.state.founderCommercialPolicies.find((item) => item.id === proposal.content.policyBindings.commercialPolicyId && item.organisationId === input.organisationId);
    if (!policy) fail(409, "The bound commercial policy version is unavailable.");
    proposal.content.commercial = commercialTerms({ classification: raw.engagementClassification as FounderEngagementClassification, professionalFeePaise: Number(raw.professionalFeePaise), appliedGstBasisPoints: Number(raw.gstAppliedBasisPoints), agreedAdvancePaise: Number(raw.agreedAdvancePaise), policy, feeDeviationReason: String(raw.feeDeviationReason ?? ""), classificationReason: String(raw.classificationReason ?? ""), gstDeviationReason: String(raw.gstDeviationReason ?? ""), advanceExceptionReason: String(raw.advanceExceptionReason ?? "") });
    const deadline = input.state.founderBalanceDeadlines.find((item) => item.proposalVersionId === proposal.id); if (deadline) { deadline.remainingAmountPaise = proposal.content.commercial.totalPayablePaise; deadline.engagementClassification = proposal.content.commercial.engagementClassification; deadline.status = proposal.content.commercial.totalPayablePaise === 0 ? "WAIVED" : "NOT_DUE"; deadline.recordVersion = (deadline.recordVersion ?? 1) + 1; }
  }
  if (input.step === 6 && "validityEndsAt" in input.patch) { const value = new Date(String(input.patch.validityEndsAt)); if (!Number.isFinite(value.getTime())) fail(400, "Choose a valid proposal validity date."); proposal.validityEndsAt = value.toISOString(); }
  proposal.currentStep = input.step; proposal.contentHash = deterministicContentHash(proposal.content); proposal.recordVersion = (proposal.recordVersion ?? 1) + 1;
  appendAudit(input.state, { organisationId: input.organisationId, eventType: "PROPOSAL_DRAFT_AUTOSAVED", entityType: "PROPOSAL_VERSION", entityId: proposal.id, actorUserId: input.actor.id, reason: `Founder autosaved proposal step ${input.step}.`, proposalVersionId: proposal.id, prospectiveProjectId: proposal.prospectiveProjectId, beforeHash, afterHash: requestHash, idempotencyKey: `audit:${input.idempotencyKey}` });
  return proposal;
}

function activeLegal(state: AppState, organisationId: string, kind: FounderCommercialLegalPolicyRecord["kind"]) { return state.founderCommercialLegalPolicies.find((item) => item.organisationId === organisationId && item.kind === kind && item.status === "ACTIVE"); }

export function getFounderProposalBlockers(state: AppState, proposal: FounderProposalVersionRecord, now = new Date()) {
  const blockers: Array<{ code: string; message: string; recovery: string }> = [];
  if (!proposal.content.requirements.refinedSummary?.trim()) blockers.push({ code: "P2_REFINED_SUMMARY", message: "Project requirements need a Founder-refined proposal summary while preserving exact qualification answers.", recovery: "Complete Requirements & Scope." });
  if (!proposal.content.scopeItems.length && !proposal.content.policyBindings.brochureAssetVersionId) blockers.push({ code: "P3_SCOPE", message: "An active approved brochure or explicitly classified scope is required.", recovery: "Activate the service brochure or complete Requirements & Scope." });
  if (!proposal.content.deliverables.length && !proposal.content.policyBindings.brochureAssetVersionId) blockers.push({ code: "P4_DELIVERABLES", message: "An active approved brochure or explicit deliverables are required.", recovery: "Activate the service brochure or complete Deliverables & Interactions." });
  const interactions = proposal.content.interactions;
  if (interactions.includedReviewRounds < 0 || interactions.includedPresentationCalls < 0 || interactions.clarificationPeriodDays < 0 || !interactions.expectedResponseTime.trim() || !interactions.additionalInteractionTreatment.trim()) blockers.push({ code: "P6_INTERACTIONS", message: "Review rounds, calls, clarification and additional-interaction treatment are incomplete.", recovery: "Complete Deliverables & Interactions." });
  const timeline = proposal.content.timeline;
  if (!timeline.expectedCommencement.trim() || !timeline.estimatedDateRange.trim() || !timeline.milestones.length || !timeline.prerequisites.length || !timeline.clientDependencies.length || !timeline.pauseOrExtensionConditions.length) blockers.push({ code: "P7_TIMELINE", message: "Estimated timeline, milestones, prerequisites, dependencies and pause conditions are incomplete.", recovery: "Complete Timeline & Commercials." });
  if (!activeLegal(state, proposal.organisationId!, "PROFESSIONAL_BOUNDARIES")) blockers.push({ code: "P5_OWNER_LEGAL", message: "BLOCKED — OWNER/LEGAL INPUT REQUIRED: active professional-boundary wording is missing.", recovery: "Approve and activate P5 core professional boundaries." });
  if (!activeLegal(state, proposal.organisationId!, "ACCEPTANCE_DECLARATION")) blockers.push({ code: "P13_OWNER_LEGAL", message: "BLOCKED — OWNER/LEGAL INPUT REQUIRED: active acceptance declaration is missing.", recovery: "Approve and activate P13 acceptance wording." });
  if (!activeLegal(state, proposal.organisationId!, "CANCELLATION_REFUND_DELAY")) blockers.push({ code: "P14_OWNER_LEGAL", message: "BLOCKED — OWNER/LEGAL INPUT REQUIRED: active cancellation/refund/delay policy is missing.", recovery: "Approve and activate P14 policy wording." });
  if (!proposal.validityEndsAt || new Date(proposal.validityEndsAt) <= now) blockers.push({ code: "P10_VALIDITY", message: "A future Yogesh-set proposal validity date is required.", recovery: "Complete Policies & Next Steps." });
  return blockers;
}

function bindActivePolicies(state: AppState, proposal: FounderProposalVersionRecord) {
  const p5 = activeLegal(state, proposal.organisationId!, "PROFESSIONAL_BOUNDARIES");
  const p13 = activeLegal(state, proposal.organisationId!, "ACCEPTANCE_DECLARATION");
  const p14 = activeLegal(state, proposal.organisationId!, "CANCELLATION_REFUND_DELAY");
  if (!p5 || !p13 || !p14) fail(409, "BLOCKED — OWNER/LEGAL INPUT REQUIRED. P5, P13 and P14 must be approved and active.");
  proposal.content.policyBindings.professionalBoundariesPolicyId = p5.id; proposal.content.policyBindings.acceptanceDeclarationPolicyId = p13.id; proposal.content.policyBindings.cancellationPolicyId = p14.id; proposal.content.policyBindings.cancellationPolicyVersion = p14.version; proposal.content.policyBindings.cancellationPolicyContentHash = p14.contentHash;
}

export function reviewFounderProposal(input: { state: AppState; actor: AppUser; founderUserId: string; organisationId: string; proposalVersionId: string; reason: string; idempotencyKey: string; expectedRecordVersion?: number; now?: Date }) {
  owner(input); safeIdempotency(input.idempotencyKey);
  const proposal = input.state.founderProposalVersions.find((item) => item.id === input.proposalVersionId && item.organisationId === input.organisationId);
  if (!proposal) fail(404, "Proposal version not found.");
  const existing = input.state.founderProposalApprovals.find((item) => item.organisationId === input.organisationId && item.proposalVersionId === proposal.id && item.checkpoint === "SUPER_ADMIN_REVIEWED");
  if (existing) return proposal;
  assertExpected(proposal.recordVersion, input.expectedRecordVersion, "proposal");
  if (proposal.status !== "DRAFT") fail(409, "Only a draft proposal can be reviewed.");
  const blockers = getFounderProposalBlockers(input.state, proposal, input.now);
  if (blockers.length) fail(409, blockers[0].message);
  bindActivePolicies(input.state, proposal); proposal.contentHash = deterministicContentHash(proposal.content); proposal.status = "SUPER_ADMIN_REVIEWED"; proposal.reviewedAt = nowIso(input.now); proposal.recordVersion = (proposal.recordVersion ?? 1) + 1;
  input.state.founderProposalApprovals.push({ id: uuid(), organisationId: input.organisationId, proposalVersionId: proposal.id, checkpoint: "SUPER_ADMIN_REVIEWED", actorUserId: input.actor.id, actorName: input.actor.fullName, actorRole: "SUPER_ADMIN", reason: trimmed(input.reason, "Review reason"), contentHash: proposal.contentHash, createdAt: proposal.reviewedAt, idempotencyKey: input.idempotencyKey, recordVersion: 1 });
  return proposal;
}

export function approveFounderProposal(input: { state: AppState; actor: AppUser; founderUserId: string; organisationId: string; proposalVersionId: string; reason: string; idempotencyKey: string; expectedRecordVersion?: number; now?: Date }) {
  owner(input); safeIdempotency(input.idempotencyKey);
  const proposal = input.state.founderProposalVersions.find((item) => item.id === input.proposalVersionId && item.organisationId === input.organisationId);
  if (!proposal) fail(404, "Proposal version not found.");
  const existing = input.state.founderProposalApprovals.find((item) => item.organisationId === input.organisationId && item.proposalVersionId === proposal.id && item.checkpoint === "SUPER_ADMIN_APPROVED");
  if (existing) return proposal;
  assertExpected(proposal.recordVersion, input.expectedRecordVersion, "proposal");
  if (proposal.status !== "SUPER_ADMIN_REVIEWED") fail(409, "Separate Super Admin review is required before approval.");
  if (getFounderProposalBlockers(input.state, proposal, input.now).length) fail(409, "Proposal approval is blocked by incomplete or inactive required content.");
  proposal.status = "SUPER_ADMIN_APPROVED"; proposal.approvedAt = nowIso(input.now); proposal.contentHash = deterministicContentHash(proposal.content); proposal.recordVersion = (proposal.recordVersion ?? 1) + 1;
  input.state.founderProposalApprovals.push({ id: uuid(), organisationId: input.organisationId, proposalVersionId: proposal.id, checkpoint: "SUPER_ADMIN_APPROVED", actorUserId: input.actor.id, actorName: input.actor.fullName, actorRole: "SUPER_ADMIN", reason: trimmed(input.reason, "Approval reason"), contentHash: proposal.contentHash, createdAt: proposal.approvedAt, idempotencyKey: input.idempotencyKey, recordVersion: 1 });
  return proposal;
}

export function projectFounderProposalForClient(state: AppState, proposal: FounderProposalVersionRecord): FounderProposalClientProjection {
  const p5 = state.founderCommercialLegalPolicies.find((item) => item.id === proposal.content.policyBindings.professionalBoundariesPolicyId && item.organisationId === proposal.organisationId);
  const p14 = state.founderCommercialLegalPolicies.find((item) => item.id === proposal.content.policyBindings.cancellationPolicyId && item.organisationId === proposal.organisationId);
  if (!p5 || !p14) fail(409, "The proposal legal-policy snapshot is unavailable.");
  if ((proposal.content.policyBindings.cancellationPolicyVersion !== undefined && proposal.content.policyBindings.cancellationPolicyVersion !== p14.version) || (proposal.content.policyBindings.cancellationPolicyContentHash && proposal.content.policyBindings.cancellationPolicyContentHash !== p14.contentHash)) fail(409, "The proposal no-refund policy snapshot does not match its immutable version binding.");
  const commercial = proposal.content.commercial;
  const brochureReference = proposal.content.policyBindings.brochureAssetVersionId && proposal.content.policyBindings.brochureAssetKey && proposal.content.policyBindings.brochureChecksumSha256 ? { title: proposal.serviceType === "EXISTING_SPACE" ? "Existing Space Vastu Audit & Optimisation" : "New Construction Vastu Planning & Design Coordination", assetKey: proposal.content.policyBindings.brochureAssetKey, checksumSha256: proposal.content.policyBindings.brochureChecksumSha256 } : undefined;
  return { proposalVersion: proposal.version, proposalHash: proposal.contentHash, client: { name: proposal.content.clientProject.clientName, permanentClientId: proposal.clientId }, project: { kind: proposal.content.clientProject.projectKind, serviceType: proposal.serviceType, propertyType: proposal.content.clientProject.propertyType, propertyLocation: proposal.content.clientProject.propertyLocation, knownFloorCount: proposal.content.clientProject.knownFloorCount, primaryRequirement: proposal.content.clientProject.primaryRequirement }, requirements: { exactQualificationVersion: proposal.content.requirements.qualificationResponseVersionId ?? "NOT_SUBMITTED_SCOPE_ONLY", refinedSummary: proposal.content.requirements.refinedSummary }, scopeItems: proposal.content.scopeItems.map(({ order, title, status, floorIds, note }) => ({ order, title, status, floorIds, note })), deliverables: proposal.content.deliverables.map(({ order, name, status, floorIds, deliveryFormat, expectedStage, description, clientDependency }) => ({ order, name, status, floorIds, deliveryFormat, expectedStage, description, clientDependency })), brochureReference, interactions: structuredClone(proposal.content.interactions), timeline: structuredClone(proposal.content.timeline), commercial: { professionalFeePaise: commercial.professionalFeePaise, gstAppliedBasisPoints: commercial.gstAppliedBasisPoints, gstAmountPaise: commercial.gstAmountPaise, totalPayablePaise: commercial.totalPayablePaise, agreedAdvancePaise: commercial.agreedAdvancePaise, remainingBalancePaise: commercial.remainingBalancePaise, paymentMilestones: structuredClone(commercial.paymentMilestones) }, professionalBoundaries: p5.exactText, projectExclusions: [...proposal.content.projectExclusions], cancellationRefundDelayPolicy: p14.exactText, validityEndsAt: proposal.validityEndsAt!, postAcceptanceSequence: ["Uchit acknowledges acceptance.", "Payment instructions are issued where applicable.", "The agreed advance or approved exception is confirmed.", "A Case ID and workspace are created only after commercial clearance.", "Project intake and evidence collection begin."] };
}

export async function generateFounderProposalArtifact(input: { state: AppState; actor: AppUser; founderUserId: string; organisationId: string; proposalVersionId: string; store: CommercialArtifactStore; idempotencyKey: string; expectedRecordVersion?: number; now?: Date }) {
  owner(input); safeIdempotency(input.idempotencyKey);
  const proposal = input.state.founderProposalVersions.find((item) => item.id === input.proposalVersionId && item.organisationId === input.organisationId);
  if (!proposal) fail(404, "Proposal version not found.");
  const existing = input.state.founderProposalArtifacts.find((item) => item.proposalVersionId === proposal.id && item.organisationId === input.organisationId);
  if (existing) return existing;
  assertExpected(proposal.recordVersion, input.expectedRecordVersion, "proposal");
  if (proposal.status !== "SUPER_ADMIN_APPROVED") fail(409, "Super Admin approval is required before immutable artifact generation.");
  const projection = projectFounderProposalForClient(input.state, proposal);
  const resolvedDocumentTemplate = resolveDocumentTemplateSnapshot(input.state, { organisationId: input.organisationId, family: "FOUNDER_COMMERCIAL_PROPOSAL", documentFields: {
    "Client Name": projection.client.name, "Project Name": projection.project.propertyLocation ?? projection.project.primaryRequirement ?? proposal.prospectiveProjectId,
    "Report Date": nowIso(input.now).slice(0, 10), "Version ID": String(projection.proposalVersion), "Consultant": input.actor.fullName } });
  const documentTemplateSnapshot = resolvedDocumentTemplate.source === "CENTRAL" ? resolvedDocumentTemplate : undefined;
  const templateMedia = await loadFounderTemplateMedia({ state: input.state, organisationId: input.organisationId,
    expectedFamily: "FOUNDER_COMMERCIAL_PROPOSAL", snapshot: documentTemplateSnapshot, reader: input.store });
  const projectionHash = deterministicContentHash(documentTemplateSnapshot ? { projection, documentTemplateSnapshot } : projection);
  const bytes = await renderCommercialProposalPdf(projection, documentTemplateSnapshot, templateMedia); const artifactHash = await hashBytes(bytes);
  const privateObjectKey = `commercial/proposals/${input.organisationId}/${proposal.id}/${artifactHash}.pdf`;
  const rendererVersion = founderTemplateRendererVersion(COMMERCIAL_PROPOSAL_RENDERER_VERSION, templateMedia);
  await input.store.putImmutable(privateObjectKey, bytes, "application/pdf", { immutable: "true", proposalVersionId: proposal.id, checksumSha256: artifactHash, rendererVersion });
  const artifact = { id: uuid(), organisationId: input.organisationId, proposalVersionId: proposal.id, proposalContentHash: proposal.contentHash, clientProjectionHash: projectionHash, artifactHashSha256: artifactHash, privateObjectKey, mimeType: "application/pdf" as const, sizeBytes: bytes.byteLength, pageCount: founderTemplatePageCount(templateMedia), rendererVersion, generatedAt: nowIso(input.now), idempotencyKey: input.idempotencyKey, recordVersion: 1, ...(documentTemplateSnapshot ? { documentTemplateSnapshot } : {}) };
  input.state.founderProposalArtifacts.push(artifact); return artifact;
}

export async function sendFounderProposal(input: { state: AppState; actor: AppUser; founderUserId: string; organisationId: string; proposalVersionId: string; idempotencyKey: string; expectedRecordVersion?: number; now?: Date }) {
  owner(input); safeIdempotency(input.idempotencyKey);
  const proposal = input.state.founderProposalVersions.find((item) => item.id === input.proposalVersionId && item.organisationId === input.organisationId);
  const artifact = input.state.founderProposalArtifacts.find((item) => item.proposalVersionId === input.proposalVersionId && item.organisationId === input.organisationId);
  if (!proposal || !artifact) fail(409, "An exact approved immutable proposal artifact is required before preparing a client link.");
  assertExpected(proposal.recordVersion, input.expectedRecordVersion, "proposal");
  if (proposal.status !== "SUPER_ADMIN_APPROVED" || !proposal.validityEndsAt || new Date(proposal.validityEndsAt) <= (input.now ?? new Date())) fail(409, "Only a currently valid approved proposal can be sent.");
  const token = `${uuid().replaceAll("-", "")}${uuid().replaceAll("-", "")}`;
  const grant = { id: uuid(), organisationId: input.organisationId, proposalVersionId: proposal.id, clientId: proposal.clientId, prospectiveProjectId: proposal.prospectiveProjectId, tokenHash: await hashText(token), expiresAt: proposal.validityEndsAt, createdAt: nowIso(input.now), createdByActorUserId: input.actor.id, recordVersion: 1 };
  input.state.founderProposalGrants.push(grant); proposal.status = "SENT"; proposal.sentAt = nowIso(input.now); proposal.recordVersion = (proposal.recordVersion ?? 1) + 1;
  return { proposal, grant, token };
}

export async function resolveFounderProposalGrant(state: AppState, token: string, now = new Date()) {
  const tokenHash = await hashText(token); const grant = state.founderProposalGrants.find((item) => item.tokenHash === tokenHash);
  if (!grant || grant.revokedAt || new Date(grant.expiresAt) <= now) fail(404, "This proposal link is unavailable or expired.");
  const proposal = state.founderProposalVersions.find((item) => item.id === grant.proposalVersionId && item.organisationId === grant.organisationId && item.clientId === grant.clientId && item.prospectiveProjectId === grant.prospectiveProjectId);
  if (!proposal || proposal.status !== "SENT") fail(409, "This proposal version is no longer available for response.");
  if (!grant.openedAt) { grant.openedAt = now.toISOString(); grant.recordVersion = (grant.recordVersion ?? 1) + 1; }
  const acceptance = state.founderCommercialLegalPolicies.find((item) => item.id === proposal.content.policyBindings.acceptanceDeclarationPolicyId && item.organisationId === proposal.organisationId);
  if (!acceptance) fail(409, "The accepted legal declaration snapshot is unavailable.");
  const artifact = state.founderProposalArtifacts.find((item) => item.proposalVersionId === proposal.id && item.organisationId === proposal.organisationId);
  const template = artifact?.documentTemplateSnapshot;
  const brandPresentation = template ? { displayName: template.brandDisplayName, colours: template.colours, headerEnabled: template.header.enabled, footerEnabled: template.footer.enabled } : undefined;
  return { grant, proposal, projection: projectFounderProposalForClient(state, proposal), brandPresentation, acceptanceDeclaration: { exactText: acceptance.exactText, checkboxLabel: acceptance.configuration?.acceptanceCheckboxLabel, typedConfirmationPhrase: acceptance.configuration?.typedConfirmationPhrase, typedConfirmationMode: acceptance.configuration?.typedConfirmationMode } };
}

export async function respondToFounderProposal(input: { state: AppState; token: string; response: "ACCEPTED" | "CHANGES_REQUESTED" | "DECLINED"; fullName: string; acceptanceChecked?: boolean; typedConfirmation?: string; organisationName?: string; designation?: string; requestedChanges?: string; idempotencyKey: string; now?: Date }) {
  safeIdempotency(input.idempotencyKey); const resolved = await resolveFounderProposalGrant(input.state, input.token, input.now); const { proposal } = resolved;
  const requestHash = deterministicContentHash({ proposalVersionId: proposal.id, response: input.response, fullName: input.fullName.trim(), acceptanceChecked: input.acceptanceChecked, typedConfirmation: input.typedConfirmation, organisationName: input.organisationName, designation: input.designation, requestedChanges: input.requestedChanges });
  const replay = input.state.founderProposalResponses.find((item) => item.organisationId === proposal.organisationId && item.idempotencyKey === input.idempotencyKey);
  if (replay) { if (replay.requestHash !== requestHash) fail(409, "This idempotency key was used for a different proposal response."); return replay; }
  if (input.state.founderProposalResponses.some((item) => item.proposalVersionId === proposal.id)) fail(409, "This immutable proposal version already has a recorded response.");
  const artifact = input.state.founderProposalArtifacts.find((item) => item.proposalVersionId === proposal.id)!;
  if (input.response === "ACCEPTED") {
    if (!input.acceptanceChecked || !input.fullName.trim()) fail(400, "Full name and explicit acceptance checkbox are required.");
    const typedMatches = resolved.acceptanceDeclaration.typedConfirmationMode === "FULL_NAME" ? input.typedConfirmation === input.fullName : input.typedConfirmation === resolved.acceptanceDeclaration.typedConfirmationPhrase;
    if (!typedMatches) fail(400, "Typed confirmation must exactly match the approved acceptance declaration.");
    if (proposal.content.clientProject.projectKind === "COMMERCIAL" && (!input.organisationName?.trim() || !input.designation?.trim())) fail(400, "Organisation and designation are required for commercial-project acceptance.");
  }
  if (input.response === "CHANGES_REQUESTED" && !input.requestedChanges?.trim()) fail(400, "Requested changes are required.");
  const record = { id: uuid(), organisationId: proposal.organisationId, proposalVersionId: proposal.id, proposalContentHash: proposal.contentHash, artifactHashSha256: artifact.artifactHashSha256, clientId: proposal.clientId, prospectiveProjectId: proposal.prospectiveProjectId, response: input.response, fullName: input.fullName.trim(), acceptanceChecked: input.response === "ACCEPTED" ? true : undefined, typedConfirmationHash: input.response === "ACCEPTED" ? await hashText(input.typedConfirmation!) : undefined, organisationName: input.organisationName?.trim(), designation: input.designation?.trim(), requestedChanges: input.requestedChanges?.trim(), respondedAt: nowIso(input.now), idempotencyKey: input.idempotencyKey, requestHash, recordVersion: 1 };
  input.state.founderProposalResponses.push(record); proposal.status = input.response; if (input.response === "ACCEPTED") proposal.acceptedAt = record.respondedAt; proposal.recordVersion = (proposal.recordVersion ?? 1) + 1;
  return record;
}

/**
 * Creates the Founder-only case/project handoff for an accepted complimentary
 * proposal.  This deliberately lives beside the commercial invariants so the
 * zero-value exception cannot be reached by the legacy payment-only case path.
 */
export function createFounderComplimentaryCaseHandoff(input: {
  state: AppState;
  actor: AppUser;
  founderUserId: string;
  organisationId: string;
  proposalVersionId: string;
  idempotencyKey: string;
  expectedRecordVersion?: number;
  now?: Date;
}) {
  owner(input); safeIdempotency(input.idempotencyKey);
  const proposal = input.state.founderProposalVersions.find((item) => item.id === input.proposalVersionId && item.organisationId === input.organisationId);
  if (!proposal) fail(404, "Proposal version not found.");
  const commercialPolicy = input.state.founderCommercialPolicies.find((policy) => policy.id === proposal.content.policyBindings.commercialPolicyId && policy.organisationId === input.organisationId);
  const requestHash = deterministicContentHash({
    proposalVersionId: proposal.id,
    predecessorVersionId: proposal.predecessorVersionId,
    clientId: proposal.clientId,
    prospectiveProjectId: proposal.prospectiveProjectId,
    contentHash: proposal.contentHash,
    classification: proposal.content.commercial.engagementClassification,
    professionalFeePaise: proposal.content.commercial.professionalFeePaise,
    gstAmountPaise: proposal.content.commercial.gstAmountPaise,
    totalPayablePaise: proposal.content.commercial.totalPayablePaise,
    agreedAdvancePaise: proposal.content.commercial.agreedAdvancePaise,
    commercialPolicyId: proposal.content.policyBindings.commercialPolicyId,
    commercialPolicyVersion: commercialPolicy?.version,
    referenceFeePaise: proposal.content.commercial.referenceFeePaise,
    referenceAdvancePaise: commercialPolicy?.referenceAdvancePaise
  });
  const auditKey = `audit:founder-complimentary-case-handoff:${input.idempotencyKey}`;
  const replay = input.state.founderCommercialAuditEvents.find((event) => event.organisationId === input.organisationId && event.idempotencyKey === auditKey);
  if (replay) {
    if (replay.afterHash !== requestHash) fail(409, "This idempotency key was used for different case-handoff content.");
    const replayCase = input.state.vastuCases.find((item) => item.id === replay.entityId && item.organisationId === input.organisationId);
    if (!replayCase) fail(409, "The prior case-handoff result is unavailable; reload before retrying.");
    return replayCase;
  }
  if (proposal.status !== "ACCEPTED") fail(409, "An accepted proposal version is required before case setup.");
  assertExpected(proposal.recordVersion, input.expectedRecordVersion, "accepted proposal");
  const project = input.state.prospectiveProjects.find((item) => item.id === proposal.prospectiveProjectId && item.organisationId === input.organisationId && item.clientId === proposal.clientId);
  if (!project) fail(409, "The proposal must link to an organisation-scoped prospective project for this client.");
  if (!commercialPolicy) fail(409, "The accepted proposal's exact commercial policy version is unavailable.");
  if (!project.responseVersionId || project.kind !== proposal.content.clientProject.projectKind || project.serviceType !== proposal.serviceType) fail(409, "The proposal and prospective project linkage is inconsistent.");
  const client = input.state.clients.find((item) => item.id === proposal.clientId && (!item.organisationId || item.organisationId === input.organisationId));
  if (!client) fail(409, "The proposal client is outside the active organisation scope.");
  const terms = proposal.content.commercial;
  if (terms.engagementClassification !== "INTERNAL_COMPLIMENTARY") fail(409, "Only an accepted INTERNAL_COMPLIMENTARY proposal can use the Founder exception handoff.");
  if (terms.professionalFeePaise !== 0 || terms.gstAppliedBasisPoints !== 0 || terms.gstAmountPaise !== 0 || terms.totalPayablePaise !== 0 || terms.agreedAdvancePaise !== 0 || terms.remainingBalancePaise !== 0 || !terms.advanceExceptionApproved || !terms.classificationReason?.trim()) fail(409, "The complimentary exception must be an exact zero-value, privately reasoned commercial version.");
  if (input.state.founderCommercialPaymentConfirmations.some((item) => item.organisationId === input.organisationId && item.proposalVersionId === proposal.id)
    || input.state.founderCommercialInvoices.some((item) => item.organisationId === input.organisationId && item.proposalVersionId === proposal.id)
    || input.state.payments.some((item) => item.organisationId === input.organisationId && item.proposalId === proposal.id)) fail(409, "Complimentary case setup cannot create or use a payment or invoice record.");
  const response = input.state.founderProposalResponses.find((item) => item.organisationId === input.organisationId && item.proposalVersionId === proposal.id && item.clientId === proposal.clientId && item.prospectiveProjectId === project.id && item.response === "ACCEPTED");
  if (!response || response.proposalContentHash !== proposal.contentHash) fail(409, "The accepted response is not bound to this exact proposal version.");
  const artifact = input.state.founderProposalArtifacts.find((item) => item.organisationId === input.organisationId && item.proposalVersionId === proposal.id && item.proposalContentHash === proposal.contentHash && item.artifactHashSha256 === response.artifactHashSha256);
  if (!artifact) fail(409, "The accepted proposal artifact hash is unavailable or does not match.");
  const existing = input.state.vastuCases.find((item) => item.organisationId === input.organisationId && item.proposalId === proposal.id && item.clientId === proposal.clientId);
  if (existing) return existing;

  const now = nowIso(input.now);
  const caseId = uuid();
  const projectId = uuid();
  const floorId = uuid();
  const caseNumber = `UV-${new Date(now).getUTCFullYear()}-${String(input.state.vastuCases.length + 1).padStart(3, "0")}`;
  const nextCase: VastuCaseRecord = {
    id: caseId, organisationId: input.organisationId, caseNumber, clientId: proposal.clientId, proposalId: proposal.id, projectId,
    status: "CASE_CREATED", reportStatus: "DRAFT", orientationLocked: false, balanceApproved: false, fullPaymentApproved: false,
    serviceType: proposal.serviceType, canonicalStage: "UNDERSTAND", revisionNumber: 1, recordVersion: 1, evaluationArchitectureVersion: "V1"
  };
  const nextProject: VastuProjectRecord = { id: projectId, organisationId: input.organisationId, clientId: proposal.clientId, activeCaseId: caseId, propertyName: project.displayName ?? proposal.content.clientProject.propertyType ?? "Property project", status: "IN_PROGRESS", createdAt: now };
  const nextFloor: FloorWorkspaceRecord = { id: floorId, organisationId: input.organisationId, caseId, projectId, floorLabel: "Ground floor", status: "DRAFT", locked: false, evidenceUploads: [], idempotencyKey: `handoff-floor:${input.idempotencyKey}`, evaluationArchitectureVersion: "V1" };
  input.state.vastuCases.unshift(nextCase); input.state.projects.unshift(nextProject); input.state.floorWorkspaces.unshift(nextFloor);
  const propertyContext: CasePropertyContextRecord = {
    id: uuid(), organisationId: input.organisationId, clientId: proposal.clientId, caseId, projectId,
    propertyContext: {
      serviceInterest: proposal.serviceType,
      propertyType: project.propertyType ?? "Residential",
      propertyStatus: "Known",
      cityCountry: project.propertyLocation,
      constraints: project.importantNotes,
      floorCount: project.floorCount ?? 1
    },
    version: 1, idempotencyKey: `handoff-property-context:${input.idempotencyKey}`, createdAt: now, updatedAt: now,
    status: "CURRENT", createdByActorUserId: input.actor.id, updatedByActorUserId: input.actor.id, recordVersion: 1
  };
  input.state.casePropertyContexts.unshift(propertyContext);
  project.caseId = caseId; project.status = "CONVERTED"; project.recordVersion = (project.recordVersion ?? 0) + 1;
  proposal.recordVersion = (proposal.recordVersion ?? 0) + 1;
  const timeline: TimelineEvent = { id: uuid(), organisationId: input.organisationId, clientId: proposal.clientId, category: "Commercial", headline: "Complimentary case setup", details: `Case ${caseNumber} opened from the accepted INTERNAL_COMPLIMENTARY proposal. No payment or invoice was created.`, happenedAt: now, actorRole: input.actor.role, actorId: input.actor.id, actorName: input.actor.fullName };
  input.state.timelineEvents.unshift(timeline);
  appendAudit(input.state, { organisationId: input.organisationId, eventType: "COMPLIMENTARY_CASE_HANDOFF_CREATED", entityType: "VASTU_CASE", entityId: caseId, actorUserId: input.actor.id, reason: terms.classificationReason.trim(), proposalVersionId: proposal.id, prospectiveProjectId: project.id, beforeHash: proposal.contentHash, afterHash: requestHash, idempotencyKey: auditKey });
  return nextCase;
}

export function createFounderPaidCaseHandoff(input: { state: AppState; actor: AppUser; founderUserId: string; organisationId: string; proposalVersionId: string; idempotencyKey: string; expectedRecordVersion?: number; now?: Date }) {
  owner(input); safeIdempotency(input.idempotencyKey);
  const proposal = input.state.founderProposalVersions.find((item) => item.id === input.proposalVersionId && item.organisationId === input.organisationId);
  if (!proposal) fail(404, "Proposal version not found.");
  const existing = input.state.vastuCases.find((item) => item.organisationId === input.organisationId && item.proposalId === proposal.id && item.clientId === proposal.clientId);
  if (existing) return existing;
  if (proposal.status !== "ACCEPTED") fail(409, "Proposal must be accepted before opening a case.");
  if (proposal.content.commercial.engagementClassification === "INTERNAL_COMPLIMENTARY") fail(409, "Use the governed complimentary handoff for an INTERNAL_COMPLIMENTARY proposal.");
  assertExpected(proposal.recordVersion, input.expectedRecordVersion, "accepted proposal");
  const terms = proposal.content.commercial;
  if (terms.totalPayablePaise <= 0) fail(409, "A paid proposal must have total payable greater than ₹0.");
  const payment = input.state.founderCommercialPaymentConfirmations.filter((item) => item.organisationId === input.organisationId && item.proposalVersionId === proposal.id && item.type === "ADVANCE").sort((a, b) => b.confirmedAt.localeCompare(a.confirmedAt))[0];
  if (!payment || payment.amountPaise <= 0) fail(409, "Confirm receipt of the advance before opening the case.");
  if (payment.amountPaise > terms.totalPayablePaise) fail(409, "Advance cannot exceed the total payable.");
  if (terms.engagementClassification === "STANDARD_PAID" && payment.amountPaise < terms.agreedAdvancePaise) fail(409, "Confirm receipt of the agreed advance before opening the case.");
  const response = input.state.founderProposalResponses.find((item) => item.organisationId === input.organisationId && item.proposalVersionId === proposal.id && item.clientId === proposal.clientId && item.prospectiveProjectId === proposal.prospectiveProjectId && item.response === "ACCEPTED" && item.proposalContentHash === proposal.contentHash);
  if (!response) fail(409, "The accepted response is not bound to this exact proposal version.");
  const artifact = input.state.founderProposalArtifacts.find((item) => item.organisationId === input.organisationId && item.proposalVersionId === proposal.id && item.proposalContentHash === proposal.contentHash && item.artifactHashSha256 === response.artifactHashSha256);
  if (!artifact) fail(409, "The accepted proposal artifact hash is unavailable or does not match.");
  const project = input.state.prospectiveProjects.find((item) => item.id === proposal.prospectiveProjectId && item.organisationId === input.organisationId && item.clientId === proposal.clientId);
  const client = input.state.clients.find((item) => item.id === proposal.clientId && item.organisationId === input.organisationId);
  if (!project || !client || project.serviceType !== proposal.serviceType || project.responseVersionId !== proposal.content.requirements.qualificationResponseVersionId) fail(409, "The paid proposal is not linked to an organisation-scoped client project.");
  const now = nowIso(input.now); const caseId = uuid(); const projectId = uuid(); const floorId = uuid(); const caseNumber = `UV-${new Date(now).getUTCFullYear()}-${String(input.state.vastuCases.length + 1).padStart(3, "0")}`;
  const nextCase: VastuCaseRecord = { id: caseId, organisationId: input.organisationId, caseNumber, clientId: proposal.clientId, proposalId: proposal.id, projectId, status: "CASE_CREATED", reportStatus: "DRAFT", orientationLocked: false, balanceApproved: false, fullPaymentApproved: false, serviceType: proposal.serviceType, canonicalStage: "UNDERSTAND", revisionNumber: 1, recordVersion: 1, evaluationArchitectureVersion: "V1" };
  const nextProject: VastuProjectRecord = { id: projectId, organisationId: input.organisationId, clientId: proposal.clientId, activeCaseId: caseId, propertyName: project.displayName ?? "Property project", status: "IN_PROGRESS", createdAt: now };
  const nextFloor: FloorWorkspaceRecord = { id: floorId, organisationId: input.organisationId, caseId, projectId, floorLabel: "Ground floor", status: "DRAFT", locked: false, evidenceUploads: [], idempotencyKey: `handoff-floor:${input.idempotencyKey}`, evaluationArchitectureVersion: "V1" };
  input.state.vastuCases.unshift(nextCase); input.state.projects.unshift(nextProject); input.state.floorWorkspaces.unshift(nextFloor);
  const propertyContext: CasePropertyContextRecord = { id: uuid(), organisationId: input.organisationId, clientId: proposal.clientId, caseId, projectId, propertyContext: { serviceInterest: proposal.serviceType, propertyType: project.propertyType ?? "Residential", propertyStatus: "Known", cityCountry: project.propertyLocation, constraints: project.importantNotes, floorCount: project.floorCount ?? 1 }, version: 1, idempotencyKey: `handoff-property-context:${input.idempotencyKey}`, createdAt: now, updatedAt: now, status: "CURRENT", createdByActorUserId: input.actor.id, updatedByActorUserId: input.actor.id, recordVersion: 1 };
  input.state.casePropertyContexts.unshift(propertyContext); project.caseId = caseId; project.status = "CONVERTED"; project.recordVersion = (project.recordVersion ?? 0) + 1; proposal.recordVersion = (proposal.recordVersion ?? 0) + 1;
  input.state.timelineEvents.unshift({ id: uuid(), organisationId: input.organisationId, clientId: proposal.clientId, category: "Commercial", headline: "Paid case opened", details: `Case ${caseNumber} opened from proposal ${proposal.id} after confirmed advance ${payment.id}.`, happenedAt: now, actorRole: input.actor.role, actorId: input.actor.id, actorName: input.actor.fullName });
  appendAudit(input.state, { organisationId: input.organisationId, eventType: "PAID_CASE_HANDOFF_CREATED", entityType: "VASTU_CASE", entityId: caseId, actorUserId: input.actor.id, reason: "Paid proposal handoff after canonical confirmed advance.", proposalVersionId: proposal.id, prospectiveProjectId: project.id, afterHash: deterministicContentHash({ caseId, proposalId: proposal.id, paymentId: payment.id }), idempotencyKey: `audit:${input.idempotencyKey}` });
  return nextCase;
}

export function createFounderProspectiveCase(input: { state: AppState; actor: AppUser; founderUserId: string; organisationId: string; clientId: string; leadId?: string; serviceType: "EXISTING_SPACE" | "NEW_CONSTRUCTION"; propertyType: "Residential" | "Commercial" | "Factory" | "Shop" | "Hospital" | "Hotel" | "Temple"; displayName: string; propertyLocation: string; floorCount?: number; importantNotes?: string; confirmPossibleDuplicate?: boolean; idempotencyKey: string; expectedClientRecordVersion: number; allowLegacyUnownedLocalFixture?: boolean; preCaseReview?: boolean }) {
  owner(input); safeIdempotency(input.idempotencyKey);
  const client = input.state.clients.find((item) => item.id === input.clientId && (item.organisationId === input.organisationId || (input.allowLegacyUnownedLocalFixture === true && !item.organisationId)));
  if (!client) throw new Error("Client is unavailable in this organisation.");
  if (!client.organisationId && input.allowLegacyUnownedLocalFixture) client.organisationId = input.organisationId;
  assertExpected(client.recordVersion, input.expectedClientRecordVersion, "client");
  const clean = (value: string, label: string, max: number) => {
    const next = value.trim(); if (!next || next.length > max || /[\u0000-\u001f<>]/.test(next)) throw new Error(`${label} is required and must be safe text.`); return next;
  };
  const displayName = clean(input.displayName, "Project name", 160);
  const propertyLocation = clean(input.propertyLocation, "Property location", 240);
  const notes = input.importantNotes?.trim(); if (notes && (notes.length > 1200 || /[\u0000-\u001f<>]/.test(notes))) throw new Error("Important notes must be safe text.");
  if (input.floorCount !== undefined && (!Number.isInteger(input.floorCount) || input.floorCount < 1 || input.floorCount > 200)) throw new Error("Number of floors must be between 1 and 200.");
  const retry = input.state.prospectiveProjects.find((item) => item.clientId === client.id && item.idempotencyKey === input.idempotencyKey);
  if (retry) return { project: retry, client, duplicateWarning: false };
  const existingPreCase = input.preCaseReview ? input.state.prospectiveProjects.find((item) => item.clientId === client.id && !item.caseId && item.status !== "CONVERTED") : undefined;
  if (existingPreCase) {
    const kind: "RESIDENTIAL" | "COMMERCIAL" = input.propertyType === "Commercial" || input.propertyType === "Factory" || input.propertyType === "Shop" || input.propertyType === "Hospital" || input.propertyType === "Hotel" ? "COMMERCIAL" : "RESIDENTIAL";
    Object.assign(existingPreCase, { leadId: input.leadId ?? existingPreCase.leadId, kind, status: "REVIEW_PENDING", serviceType: input.serviceType, displayName, variation: `${input.serviceType === "EXISTING_SPACE" ? "Existing Space" : "New Construction"} · ${input.propertyType}`, propertyType: input.propertyType, propertyLocation, floorCount: input.floorCount, importantNotes: notes, recordVersion: (existingPreCase.recordVersion ?? 0) + 1, idempotencyKey: input.idempotencyKey });
    client.recordVersion = (client.recordVersion ?? 0) + 1;
    return { project: existingPreCase, client, duplicateWarning: false };
  }
  const duplicate = input.state.prospectiveProjects.some((item) => item.clientId === client.id && item.status !== "CONVERTED" && item.propertyLocation?.trim().toLowerCase() === propertyLocation.toLowerCase()) || input.state.projects.some((item) => item.clientId === client.id && item.propertyName.trim().toLowerCase() === displayName.toLowerCase());
  if (duplicate && !input.confirmPossibleDuplicate) fail(409, "A similar active project already exists. Review it, then explicitly continue if this is independent.");
  const kind: "RESIDENTIAL" | "COMMERCIAL" = input.propertyType === "Commercial" || input.propertyType === "Factory" || input.propertyType === "Shop" || input.propertyType === "Hospital" || input.propertyType === "Hotel" ? "COMMERCIAL" : "RESIDENTIAL";
  const project = { id: uuid(), organisationId: input.organisationId, clientId: client.id, leadId: input.leadId ?? client.id, ...(input.preCaseReview ? {} : { responseVersionId: `founder-case-intent:${input.idempotencyKey}` }), kind, status: input.preCaseReview ? "REVIEW_PENDING" as const : "COMMERCIAL_PENDING" as const, serviceType: input.serviceType, displayName, variation: `${input.serviceType === "EXISTING_SPACE" ? "Existing Space" : "New Construction"} · ${input.propertyType}`, propertyType: input.propertyType, propertyLocation, floorCount: input.floorCount, importantNotes: notes, createdAt: nowIso(), recordVersion: 1, idempotencyKey: input.idempotencyKey };
  input.state.prospectiveProjects.unshift(project);
  client.recordVersion = (client.recordVersion ?? 0) + 1;
  input.state.timelineEvents.unshift({ id: uuid(), organisationId: input.organisationId, clientId: client.id, category: "Case", headline: "Prospective case opened", details: `Founder opened ${project.variation}. Commercial clearance is required before a Case ID is created.`, happenedAt: nowIso(), actorRole: input.actor.role, actorId: input.actor.id, actorName: input.actor.fullName });
  appendAudit(input.state, { organisationId: input.organisationId, eventType: "PROSPECTIVE_CASE_OPENED", entityType: "PROSPECTIVE_PROJECT", entityId: project.id, actorUserId: input.actor.id, reason: notes || "Founder opened a prospective case.", prospectiveProjectId: project.id, afterHash: deterministicContentHash(project), idempotencyKey: `audit:${input.idempotencyKey}` });
  return { project, client, duplicateWarning: duplicate };
}

export function classifyFounderProspectiveProjectService(input: { state: AppState; actor: AppUser; founderUserId: string; organisationId: string; prospectiveProjectId: string; serviceType: VastuServiceType; expectedRecordVersion?: number; idempotencyKey: string; clientId?: string; leadId?: string; responseVersionId?: string; now?: Date }) {
  owner(input); safeIdempotency(input.idempotencyKey);
  if (!serviceTypes.includes(input.serviceType)) fail(400, "Choose a valid service type.");
  const requestHash = deterministicContentHash({ prospectiveProjectId: input.prospectiveProjectId, serviceType: input.serviceType, clientId: input.clientId, leadId: input.leadId, responseVersionId: input.responseVersionId });
  const auditKey = `prospective-service-classify:${input.idempotencyKey}`;
  const replay = input.state.founderCommercialAuditEvents.find((event) => event.organisationId === input.organisationId && event.idempotencyKey === auditKey);
  if (replay) {
    if (replay.requestHash !== requestHash) fail(409, "This idempotency key was used for different service classification content.");
    const project = input.state.prospectiveProjects.find((item) => item.id === replay.entityId && item.organisationId === input.organisationId);
    if (!project) fail(404, "Prospective project not found.");
    return { project, changed: false, replayed: true, updatedActorUserId: replay.actorUserId, updatedAt: replay.happenedAt };
  }
  const project = input.state.prospectiveProjects.find((item) => item.id === input.prospectiveProjectId && item.organisationId === input.organisationId);
  if (!project) fail(404, "Prospective project not found.");
  if (input.clientId !== undefined && input.clientId !== project.clientId) fail(409, "The prospective project client context does not match.");
  if (input.leadId !== undefined && input.leadId !== project.leadId) fail(409, "The prospective project lead context does not match.");
  if (input.responseVersionId !== undefined && input.responseVersionId !== project.responseVersionId) fail(409, "The prospective project qualification context does not match.");
  const response = input.state.qualificationResponseVersions.find((item) => item.id === project.responseVersionId && item.organisationId === input.organisationId && item.clientId === project.clientId && item.status === "SUBMITTED");
  if (!response) fail(409, "An exact submitted qualification response is required before service classification.");
  if (project.serviceType && project.serviceType !== input.serviceType) fail(409, "Service classification is locked; create an explicit future scope revision instead.");
  const proposals = input.state.founderProposalVersions.filter((item) => item.organisationId === input.organisationId && item.prospectiveProjectId === project.id);
  if (proposals.some((item) => item.serviceType !== input.serviceType)) fail(409, "Service classification is locked by an existing proposal.");
  assertExpected(project.recordVersion, input.expectedRecordVersion, "prospective project");
  const beforeHash = deterministicContentHash({ id: project.id, serviceType: project.serviceType, status: project.status, recordVersion: project.recordVersion });
  const changed = project.serviceType !== input.serviceType;
  if (changed) { project.serviceType = input.serviceType; project.recordVersion = (project.recordVersion ?? 0) + 1; }
  const event = appendAudit(input.state, { organisationId: input.organisationId, eventType: "PROSPECTIVE_PROJECT_SERVICE_CLASSIFIED", entityType: "PROSPECTIVE_PROJECT", entityId: project.id, actorUserId: input.actor.id, reason: `Founder classified the existing prospective project as ${input.serviceType}.`, prospectiveProjectId: project.id, beforeHash, afterHash: deterministicContentHash({ id: project.id, serviceType: project.serviceType, status: project.status, recordVersion: project.recordVersion }), idempotencyKey: auditKey, requestHash });
  return { project, changed, replayed: false, updatedActorUserId: event.actorUserId, updatedAt: event.happenedAt };
}

export function confirmFounderCommercialPayment(input: { state: AppState; actor: AppUser; founderUserId: string; organisationId: string; proposalVersionId: string; paymentId: string; type: "ADVANCE" | "BALANCE"; amountPaise: number; idempotencyKey: string; expectedProposalRecordVersion?: number; now?: Date }) {
  owner(input); safeIdempotency(input.idempotencyKey); safePaise(input.amountPaise, "Confirmed payment");
  const proposal = input.state.founderProposalVersions.find((item) => item.id === input.proposalVersionId && item.organisationId === input.organisationId);
  if (!proposal || proposal.status !== "ACCEPTED") fail(409, "Exact proposal acceptance is required before confirming commercial payment.");
  assertExpected(proposal.recordVersion, input.expectedProposalRecordVersion, "proposal");
  const requestHash = deterministicContentHash({ proposalVersionId: proposal.id, paymentId: input.paymentId, type: input.type, amountPaise: input.amountPaise });
  const replay = input.state.founderCommercialPaymentConfirmations.find((item) => item.organisationId === input.organisationId && item.idempotencyKey === input.idempotencyKey);
  if (replay) { if (replay.requestHash !== requestHash) fail(409, "This idempotency key was used for a different payment confirmation."); return replay; }
  if (input.state.founderCommercialPaymentConfirmations.some((item) => item.organisationId === input.organisationId && item.paymentId === input.paymentId)) fail(409, "This payment receipt is already bound to a commercial confirmation.");
  const terms = proposal.content.commercial;
  if (terms.engagementClassification !== "INTERNAL_COMPLIMENTARY" && terms.totalPayablePaise <= 0) fail(409, "A paid proposal must have total payable greater than ₹0.");
  if (input.type === "ADVANCE" && input.amountPaise <= 0) fail(409, "A paid case requires an advance greater than ₹0.");
  if (input.type === "ADVANCE" && input.amountPaise > terms.totalPayablePaise) fail(409, "Advance cannot exceed the total payable.");
  if (input.type === "ADVANCE" && input.amountPaise < terms.agreedAdvancePaise && terms.engagementClassification === "STANDARD_PAID") fail(409, "Confirmed advance is below the approved agreed advance and has no authorised exception.");
  const confirmedAt = nowIso(input.now); const confirmation = { id: uuid(), organisationId: input.organisationId, proposalVersionId: proposal.id, clientId: proposal.clientId, prospectiveProjectId: proposal.prospectiveProjectId, paymentId: input.paymentId, type: input.type, amountPaise: input.amountPaise, confirmedAt, confirmedByActorUserId: input.actor.id, proposalContentHash: proposal.contentHash, idempotencyKey: input.idempotencyKey, requestHash, recordVersion: 1 };
  input.state.founderCommercialPaymentConfirmations.push(confirmation);
  const confirmedTotal = input.state.founderCommercialPaymentConfirmations.filter((item) => item.proposalVersionId === proposal.id).reduce((sum, item) => sum + item.amountPaise, 0); const remaining = Math.max(0, terms.totalPayablePaise - confirmedTotal); terms.remainingBalancePaise = remaining;
  const deadline = input.state.founderBalanceDeadlines.find((item) => item.proposalVersionId === proposal.id)!;
  if (input.type === "ADVANCE" && !deadline.advanceConfirmedAt) {
    const policy = input.state.founderCommercialPolicies.find((item) => item.id === deadline.commercialPolicyId)!; const instant = new Date(confirmedAt);
    deadline.advancePaymentConfirmationId = confirmation.id; deadline.advanceConfirmedAt = confirmedAt; deadline.dueAt = addDays(instant, policy.balanceDeadlineDays).toISOString(); deadline.status = remaining === 0 ? "PAID" : "DUE"; deadline.remainingAmountPaise = remaining; deadline.recordVersion = (deadline.recordVersion ?? 1) + 1;
    appendAudit(input.state, { organisationId: input.organisationId, eventType: "BALANCE_DEADLINE_CREATED", entityType: "BALANCE_DEADLINE", entityId: deadline.id, actorUserId: input.actor.id, reason: "Seven-day deadline created from immutable confirmed-advance timestamp.", proposalVersionId: proposal.id, prospectiveProjectId: proposal.prospectiveProjectId, afterHash: deterministicContentHash({ advanceConfirmedAt: deadline.advanceConfirmedAt, dueAt: deadline.dueAt, policyVersion: deadline.commercialPolicyVersion }), idempotencyKey: `audit:deadline:${input.idempotencyKey}` });
    appendAudit(input.state, { organisationId: input.organisationId, eventType: "RECEIPT_VOUCHER_DUE", entityType: "STATUTORY_DOCUMENT", entityId: confirmation.id, actorUserId: input.actor.id, reason: "Confirmed advance started the immutable sixty-minute GST Receipt Voucher SLA.", proposalVersionId: proposal.id, prospectiveProjectId: proposal.prospectiveProjectId, afterHash: deterministicContentHash({ advanceConfirmedAt: confirmedAt, dueAt: addMinutes(instant, policy.advanceInvoiceSlaMinutes).toISOString(), policyVersion: policy.version }), idempotencyKey: `audit:receipt-voucher-due:${input.idempotencyKey}` });
  }
  if (remaining === 0) { deadline.status = "PAID"; deadline.remainingAmountPaise = 0; appendAudit(input.state, { organisationId: input.organisationId, eventType: "BALANCE_CONFIRMED", entityType: "BALANCE_DEADLINE", entityId: deadline.id, actorUserId: input.actor.id, reason: "Full GST-inclusive balance confirmed against the accepted proposal.", proposalVersionId: proposal.id, prospectiveProjectId: proposal.prospectiveProjectId, idempotencyKey: `audit:balance:${input.idempotencyKey}` }); }
  registerStatutoryPaymentTrigger({ state: input.state, proposalVersionId: proposal.id, confirmation, now: input.now });
  if (remaining === 0 && terms.engagementClassification !== "INTERNAL_COMPLIMENTARY") registerFinalTaxInvoiceReviewTask({ state: input.state, proposalVersionId: proposal.id, confirmation });
  proposal.recordVersion = (proposal.recordVersion ?? 1) + 1;
  return confirmation;
}

export function projectFounderBalanceDeadline(state: AppState, proposalVersionId: string, now = new Date()) {
  const deadline = state.founderBalanceDeadlines.find((item) => item.proposalVersionId === proposalVersionId); if (!deadline) fail(404, "Balance deadline not found.");
  if (["DUE", "EXTENDED"].includes(deadline.status) && deadline.dueAt && now.getTime() >= new Date(deadline.dueAt).getTime() && deadline.remainingAmountPaise > 0) {
    deadline.status = "OVERDUE"; deadline.recordVersion = (deadline.recordVersion ?? 1) + 1;
    appendAudit(state, { organisationId: deadline.organisationId!, eventType: "BALANCE_OVERDUE", entityType: "BALANCE_DEADLINE", entityId: deadline.id, actorUserId: "SYSTEM", reason: "The snapshotted balance deadline has elapsed with an unpaid confirmed balance.", proposalVersionId, prospectiveProjectId: deadline.prospectiveProjectId, idempotencyKey: `audit:deadline-overdue:${deadline.id}` });
  }
  return deadline;
}

export function projectFounderInvoiceStatus(state: AppState, proposalVersionId: string, now = new Date()) {
  const invoice = state.founderCommercialInvoices.find((item) => item.proposalVersionId === proposalVersionId); if (!invoice) return undefined;
  if (["DUE", "GENERATION_FAILED"].includes(invoice.status) && invoice.dueAt && now.getTime() >= new Date(invoice.dueAt).getTime()) {
    invoice.status = "OVERDUE"; invoice.recordVersion = (invoice.recordVersion ?? 1) + 1;
    appendAudit(state, { organisationId: invoice.organisationId!, eventType: "ADVANCE_INVOICE_OVERDUE", entityType: "COMMERCIAL_INVOICE", entityId: invoice.id, actorUserId: "SYSTEM", reason: "The sixty-minute invoice SLA elapsed before immutable issuance.", proposalVersionId, prospectiveProjectId: invoice.prospectiveProjectId, idempotencyKey: `audit:invoice-overdue:${invoice.id}` });
  }
  return invoice;
}

export function applyFounderBalanceDeadlineException(input: { state: AppState; actor: AppUser; founderUserId: string; organisationId: string; proposalVersionId: string; action: "EXTEND" | "WAIVE"; newDueAt?: string; reason: string; engagementClassification: FounderEngagementClassification; idempotencyKey: string; expectedRecordVersion?: number; now?: Date }) {
  owner(input); safeIdempotency(input.idempotencyKey); const deadline = input.state.founderBalanceDeadlines.find((item) => item.proposalVersionId === input.proposalVersionId && item.organisationId === input.organisationId); if (!deadline) fail(404, "Balance deadline not found.");
  const replay = input.state.founderCommercialAuditEvents.find((item) => item.organisationId === input.organisationId && item.idempotencyKey === `audit:deadline-exception:${input.idempotencyKey}`); if (replay) return deadline;
  assertExpected(deadline.recordVersion, input.expectedRecordVersion, "balance deadline"); trimmed(input.reason, "Private exception reason");
  if (input.engagementClassification !== deadline.engagementClassification) fail(409, "The deadline exception classification does not match the immutable commercial version.");
  const priorDueAt = deadline.dueAt; if (input.action === "EXTEND") { const next = new Date(input.newDueAt ?? ""); if (!Number.isFinite(next.getTime()) || !deadline.dueAt || next <= new Date(deadline.dueAt)) fail(400, "An extension must set a later valid deadline."); deadline.dueAt = next.toISOString(); deadline.status = "EXTENDED"; } else deadline.status = "WAIVED";
  deadline.priorDueAt = priorDueAt; deadline.exceptionReason = input.reason.trim(); deadline.exceptionActorUserId = input.actor.id; deadline.exceptionAt = nowIso(input.now); deadline.recordVersion = (deadline.recordVersion ?? 1) + 1;
  appendAudit(input.state, { organisationId: input.organisationId, eventType: input.action === "EXTEND" ? "BALANCE_DEADLINE_EXTENDED" : "BALANCE_DEADLINE_WAIVED", entityType: "BALANCE_DEADLINE", entityId: deadline.id, actorUserId: input.actor.id, reason: input.reason.trim(), proposalVersionId: input.proposalVersionId, prospectiveProjectId: deadline.prospectiveProjectId, beforeHash: deterministicContentHash({ dueAt: priorDueAt }), afterHash: deterministicContentHash({ dueAt: deadline.dueAt, status: deadline.status }), idempotencyKey: `audit:deadline-exception:${input.idempotencyKey}` });
  return deadline;
}

export async function issueFounderAdvanceInvoice(input: { state: AppState; actor: AppUser; founderUserId: string; organisationId: string; proposalVersionId: string; store: CommercialArtifactStore; idempotencyKey: string; expectedRecordVersion?: number; now?: Date }) {
  owner(input); safeIdempotency(input.idempotencyKey); void input.state; void input.proposalVersionId; void input.store; void input.expectedRecordVersion; void input.now;
  fail(409, "SUPERSEDED — advance confirmation requires a GST Receipt Voucher, not a Tax Invoice. Use the statutory-document issue action.");
}

export function createFounderProposalSuccessor(input: { state: AppState; actor: AppUser; founderUserId: string; organisationId: string; proposalVersionId: string; reason: string; idempotencyKey: string; expectedRecordVersion?: number; now?: Date }) {
  owner(input); safeIdempotency(input.idempotencyKey); const prior = input.state.founderProposalVersions.find((item) => item.id === input.proposalVersionId && item.organisationId === input.organisationId); if (!prior) fail(404, "Proposal version not found.");
  assertExpected(prior.recordVersion, input.expectedRecordVersion, "proposal"); if (!["SUPER_ADMIN_APPROVED", "SENT", "CHANGES_REQUESTED", "DECLINED", "EXPIRED"].includes(prior.status)) fail(409, "A successor is only created for immutable approved or client-reviewed content.");
  const replay = input.state.founderProposalVersions.find((item) => item.organisationId === input.organisationId && item.idempotencyKey === input.idempotencyKey); if (replay) return replay;
  const successor: FounderProposalVersionRecord = { ...structuredClone(prior), id: uuid(), version: prior.version + 1, status: "DRAFT", currentStep: 1, predecessorVersionId: prior.id, successorVersionId: undefined, createdAt: nowIso(input.now), createdByActorUserId: input.actor.id, reviewedAt: undefined, approvedAt: undefined, sentAt: undefined, acceptedAt: undefined, validityEndsAt: undefined, idempotencyKey: input.idempotencyKey, requestHash: deterministicContentHash({ prior: prior.id, reason: trimmed(input.reason, "Successor reason") }), recordVersion: 1 };
  prior.status = "SUPERSEDED"; prior.successorVersionId = successor.id; prior.recordVersion = (prior.recordVersion ?? 1) + 1; input.state.founderProposalVersions.push(successor); return successor;
}

export function getFounderCommercialPublicSummary(state: AppState, proposalVersionId: string, now = new Date()) {
  const proposal = state.founderProposalVersions.find((item) => item.id === proposalVersionId); if (!proposal) fail(404, "Proposal not found.");
  const deadline = projectFounderBalanceDeadline(state, proposal.id, now); const invoice = projectFounderInvoiceStatus(state, proposal.id, now);
  const statutoryDocuments = state.founderStatutoryDocuments.filter((item) => item.proposalVersionId === proposal.id).map((item) => ({ kind: item.kind, status: item.status, dueAt: item.dueAt, issuedAt: item.issuedAt, documentNumber: item.documentNumber }));
  return { proposalStatus: proposal.status, proposalVersion: proposal.version, balance: { status: deadline.status, advanceConfirmedAt: deadline.advanceConfirmedAt, dueAt: deadline.dueAt, remainingAmountPaise: deadline.remainingAmountPaise }, statutoryDocuments, invoice: invoice ? { status: invoice.status, dueAt: invoice.dueAt, issuedAt: invoice.issuedAt, invoiceNumber: invoice.invoiceNumber } : undefined, gates: { acceptanceDoesNotCreateCase: true, paymentProofDoesNotConfirmPayment: true, reportEvidenceMethodologyApprovalGatesRemainEnforced: true } };
}
