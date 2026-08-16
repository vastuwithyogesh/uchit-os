import type {
  AppUser, DocumentDeliveryChannel, DocumentDeliveryEventRecord, DocumentDeliveryRecord,
  ReportVersionRecord
} from "./domain.ts";
import { deterministicContentHash } from "./evaluation-provenance.ts";
import type { ProtectedPdfDeliveryDescriptor } from "./final-pdf.server.ts";
import type { AppState } from "./store.ts";

export class DocumentDeliveryError extends Error {
  readonly statusCode: 400 | 403 | 404 | 409 | 428;
  constructor(statusCode: 400 | 403 | 404 | 409 | 428, message: string) {
    super(message); this.statusCode = statusCode; this.name = "DocumentDeliveryError";
  }
}

export type DeliveryReadinessCheck = {
  key: "REPORT_SEQUENCE" | "INTEGRITY" | "TEMPLATE_SNAPSHOT" | "FINAL_APPROVAL" | "PROTECTED_PDF" | "PAYMENT_RELEASE" | "RECIPIENT" | "REGENERATION";
  label: string; passed: boolean; detail: string;
};

export type DeliveryReadinessProjection = {
  ready: boolean; reportId: string; checks: DeliveryReadinessCheck[]; blockers: string[];
};

type StaffMutationInput = {
  state: AppState; organisationId: string; actor: AppUser; idempotencyKey: unknown; requestId: string;
};

function required(value: unknown, label: string, max = 500) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new DocumentDeliveryError(400, `${label} is required and must be ${max} characters or fewer.`);
  return value.trim();
}

function stableKey(value: unknown) {
  const key = required(value, "Idempotency key", 160);
  if (key.length < 8) throw new DocumentDeliveryError(400, "Idempotency key must contain at least 8 characters.");
  return key;
}

function expectedVersion(record: { recordVersion?: number }, value: unknown, label: string) {
  if (!Number.isInteger(value) || Number(value) < 0) throw new DocumentDeliveryError(428, `The latest ${label} version is required.`);
  if ((record.recordVersion ?? 0) !== Number(value)) throw new DocumentDeliveryError(409, `The ${label} changed. Refresh and try again.`);
}

function actorSnapshot(actor: AppUser, occurredAt = new Date().toISOString()) {
  return { actorUserId: actor.id, actorDisplayName: actor.fullName, actorRole: actor.role, occurredAt };
}

function exactScope(state: AppState, organisationId: string, reportIdValue: unknown) {
  const reportId = required(reportIdValue, "Report ID", 160);
  const report = state.reportVersions.find((item) => item.id === reportId && item.organisationId === organisationId);
  const caseRecord = report && state.vastuCases.find((item) => item.id === report.caseId && item.organisationId === organisationId);
  const project = caseRecord?.projectId ? state.projects.find((item) => item.id === caseRecord.projectId && item.organisationId === organisationId) : undefined;
  const floor = report?.floorId && state.floorWorkspaces.find((item) => item.id === report.floorId && item.caseId === caseRecord?.id && item.projectId === project?.id && item.organisationId === organisationId);
  const client = caseRecord && state.clients.find((item) => item.id === caseRecord.clientId && item.organisationId === organisationId);
  if (!report || !caseRecord || !project || !floor || !client) throw new DocumentDeliveryError(404, "The exact report, project, case, floor, and recipient scope was not found.");
  if (report.isPreview || report.artifact?.templateVersion !== "uchit-verdict/v5" || !report.artifact.immutable || report.artifact.floorId !== floor.id) {
    throw new DocumentDeliveryError(409, "Only an immutable one-floor uchit-verdict/v5 report may enter delivery.");
  }
  return { report, caseRecord, project, floor, client };
}

function approvalFor(state: AppState, report: ReportVersionRecord) {
  const evidence = [...state.stageAFloorApprovalCheckpoints]
    .filter((item) => item.reportId === report.id && item.checkpoint === "FOUNDER_APPROVED" && item.reportArtifactHash === report.artifact?.contentHash)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0];
  return evidence ? {
    actorUserId: evidence.actorUserId, actorDisplayName: evidence.actorDisplayName,
    actorRole: evidence.actorRole, occurredAt: evidence.occurredAt
  } : undefined;
}

function appendEvent(state: AppState, delivery: DocumentDeliveryRecord, input: {
  eventType: DocumentDeliveryEventRecord["eventType"]; actor: AppUser; channel?: DocumentDeliveryChannel;
  reason: string; requestId: string; idempotencyKey: string; occurredAt?: string;
}) {
  const replay = state.documentDeliveryEvents.find((item) => item.organisationId === delivery.organisationId && item.idempotencyKey === input.idempotencyKey);
  if (replay) return replay;
  const event: DocumentDeliveryEventRecord = {
    id: crypto.randomUUID(), organisationId: delivery.organisationId, deliveryId: delivery.id,
    documentFamily: delivery.documentFamily, reportId: delivery.reportId, caseId: delivery.caseId, floorId: delivery.floorId,
    protectedPdfArtifactId: delivery.protectedPdfArtifactId, protectedPdfChecksumSha256: delivery.protectedPdfChecksumSha256,
    eventType: input.eventType, ...(input.channel ? { channel: input.channel } : {}), actorUserId: input.actor.id,
    actorDisplayName: input.actor.fullName, actorRole: input.actor.role, recipientClientId: delivery.recipientClientId,
    occurredAt: input.occurredAt ?? new Date().toISOString(), reason: input.reason, requestId: input.requestId,
    idempotencyKey: input.idempotencyKey, createdByActorUserId: input.actor.id, updatedByActorUserId: input.actor.id, recordVersion: 1
  };
  state.documentDeliveryEvents.push(event); return event;
}

function appendClientTimeline(state: AppState, delivery: DocumentDeliveryRecord, actor: AppUser, headline: string, details: string, occurredAt: string) {
  state.timelineEvents.unshift({ id: crypto.randomUUID(), organisationId: delivery.organisationId, clientId: delivery.recipientClientId,
    category: "Report Delivery", headline, details, happenedAt: occurredAt, actorId: actor.id, actorName: actor.fullName,
    actorRole: actor.role, createdByActorUserId: actor.id, updatedByActorUserId: actor.id, recordVersion: 1 });
}

export function projectVastuRemedyDeliveryReadiness(input: {
  state: AppState; organisationId: string; reportId: string; protectedPdf?: ProtectedPdfDeliveryDescriptor;
}): DeliveryReadinessProjection {
  const { state, organisationId } = input;
  let scoped: ReturnType<typeof exactScope> | undefined;
  try { scoped = exactScope(state, organisationId, input.reportId); } catch (error) {
    const detail = error instanceof Error ? error.message : "The report scope is invalid.";
    return { ready: false, reportId: input.reportId, checks: [{ key: "REPORT_SEQUENCE", label: "Report sequence finalised", passed: false, detail }], blockers: [detail] };
  }
  const { report, caseRecord, client } = scoped;
  const artifact = report.artifact!;
  const reportSequence = report.status === "RELEASED" && artifact.stageBRenderManifest?.integrityStatus === "PASS";
  const integrity = artifact.stageBRenderManifest?.integrityStatus === "PASS"
    && (!artifact.sectionARenderManifest || (artifact.sectionARenderManifest.integrityStatus === "PASS" && artifact.remediationReportIntegrity?.status === "PASS"))
    && (!artifact.sectionCRenderManifest || artifact.sectionCRenderManifest.integrityStatus === "PASS");
  const template = artifact.documentTemplateSnapshot;
  const approval = approvalFor(state, report);
  const protectedPdf = input.protectedPdf;
  const protectedPass = protectedPdf?.status === "RELEASED" && protectedPdf.reportId === report.id
    && protectedPdf.caseId === caseRecord.id && protectedPdf.floorId === report.floorId
    && protectedPdf.reportTemplateVersion === "uchit-verdict/v5" && protectedPdf.sourceSnapshotHash === artifact.contentHash;
  const paymentEvidence = state.payments.some((item) => item.organisationId === organisationId && item.caseId === caseRecord.id && item.type === "BALANCE" && item.status === "APPROVED" && Boolean(item.proofAssetId));
  const payment = caseRecord.fullPaymentApproved && caseRecord.balanceApproved && paymentEvidence;
  const recipient = Boolean(client.email.trim());
  const regeneration = !state.dependencyInvalidations.some((item) => item.organisationId === organisationId && item.caseId === caseRecord.id && item.floorId === report.floorId && ["NEEDS_REGENERATION", "REPLACEMENT_REQUIRED", "REGENERATED"].includes(item.status));
  const checks: DeliveryReadinessCheck[] = [
    { key: "REPORT_SEQUENCE", label: "Report sequence finalised", passed: reportSequence, detail: reportSequence ? "Released immutable v5 floor report." : "The exact v5 floor report has not completed protected release." },
    { key: "INTEGRITY", label: "Integrity PASS", passed: integrity, detail: integrity ? "All present A/B/C and report-wide integrity gates pass." : "A report-body integrity gate is missing or failed." },
    { key: "TEMPLATE_SNAPSHOT", label: "Template snapshot frozen", passed: Boolean(template?.snapshotHash), detail: template?.snapshotHash ? `Snapshot ${template.snapshotHash}` : "The report has no frozen document-template snapshot." },
    { key: "FINAL_APPROVAL", label: "Final approval", passed: Boolean(approval), detail: approval ? `Approved by ${approval.actorDisplayName}.` : "The exact report hash has no Founder approval checkpoint." },
    { key: "PROTECTED_PDF", label: "Protected PDF verified", passed: protectedPass, detail: protectedPass ? `Released PDF ${protectedPdf!.artifactId}.` : "The exact released protected PDF is missing or does not match the report hash." },
    { key: "PAYMENT_RELEASE", label: "Payment and release gate", passed: payment, detail: payment ? "Existing full-balance evidence is approved." : "Existing full-balance approval/evidence is incomplete." },
    { key: "RECIPIENT", label: "Client recipient resolved", passed: recipient, detail: recipient ? `${client.displayName} · ${client.email}` : "The case client has no usable recipient email." },
    { key: "REGENERATION", label: "No regeneration blocker", passed: regeneration, detail: regeneration ? "No open floor regeneration state." : "An existing regeneration lifecycle item remains open." }
  ];
  return { ready: checks.every((item) => item.passed), reportId: report.id, checks, blockers: checks.filter((item) => !item.passed).map((item) => item.detail) };
}

export function prepareDocumentDelivery(input: StaffMutationInput & {
  reportId: unknown; expectedRecordVersion: unknown; protectedPdf: ProtectedPdfDeliveryDescriptor;
}) {
  const key = stableKey(input.idempotencyKey); const scoped = exactScope(input.state, input.organisationId, input.reportId);
  expectedVersion(scoped.report, input.expectedRecordVersion, "report");
  const snapshot = scoped.report.artifact!.documentTemplateSnapshot;
  if (!snapshot?.snapshotHash) throw new DocumentDeliveryError(409, "A frozen document-template snapshot is required before delivery preparation.");
  const descriptor = input.protectedPdf;
  if (descriptor.organisationId !== input.organisationId || descriptor.reportId !== scoped.report.id || descriptor.caseId !== scoped.caseRecord.id
    || descriptor.projectId !== scoped.project.id || descriptor.floorId !== scoped.floor.id || descriptor.reportTemplateVersion !== "uchit-verdict/v5"
    || descriptor.sourceSnapshotHash !== scoped.report.artifact!.contentHash) throw new DocumentDeliveryError(409, "The protected PDF identity does not match the exact report scope.");
  const requestHash = deterministicContentHash({ reportId: scoped.report.id, protectedPdfArtifactId: descriptor.artifactId, recipientClientId: scoped.client.id });
  const replay = input.state.documentDeliveries.find((item) => item.organisationId === input.organisationId && item.idempotencyKey === key);
  if (replay) {
    if (replay.requestHash !== requestHash) throw new DocumentDeliveryError(409, "This delivery preparation key was already used with different inputs.");
    return { delivery: replay, replayed: true };
  }
  const sameArtifact = input.state.documentDeliveries.find((item) => item.organisationId === input.organisationId && item.protectedPdfArtifactId === descriptor.artifactId && item.recipientClientId === scoped.client.id);
  if (sameArtifact) return { delivery: sameArtifact, replayed: true };
  const finalApproval = approvalFor(input.state, scoped.report);
  if (!finalApproval) throw new DocumentDeliveryError(409, "The exact report hash has no Founder final-approval checkpoint.");
  const previousCaseDelivery = scoped.caseRecord.parentCaseId
    ? [...input.state.documentDeliveries].reverse().find((item) => item.organisationId === input.organisationId && item.caseId === scoped.caseRecord.parentCaseId && item.recipientClientId === scoped.client.id)
    : undefined;
  const now = new Date().toISOString();
  const delivery: DocumentDeliveryRecord = {
    id: crypto.randomUUID(), organisationId: input.organisationId, documentFamily: "VASTU_REMEDY_REPORT",
    projectId: scoped.project.id, caseId: scoped.caseRecord.id, floorId: scoped.floor.id, reportId: scoped.report.id,
    reportVersionLabel: scoped.report.versionLabel, reportTemplateVersion: "uchit-verdict/v5", reportArtifactId: scoped.report.id,
    reportCanonicalHash: scoped.report.artifact!.contentHash, protectedPdfArtifactId: descriptor.artifactId,
    protectedPdfChecksumSha256: descriptor.artifactHashSha256, protectedPdfMimeType: "application/pdf", protectedPdfSizeBytes: descriptor.sizeBytes,
    documentTemplateSnapshotHash: snapshot.snapshotHash, brandProfileId: snapshot.brandProfile.id,
    documentTemplateId: snapshot.documentTemplate.id, recipientClientId: scoped.client.id,
    recipientDisplayName: scoped.client.displayName, recipientEmail: scoped.client.email.trim().toLowerCase(), status: "DRAFT",
    prepared: actorSnapshot(input.actor, now), finalApproval, ...(previousCaseDelivery ? { replacementForDeliveryId: previousCaseDelivery.id } : {}),
    createdAt: now, updatedAt: now, idempotencyKey: key, requestHash, createdByActorUserId: input.actor.id,
    updatedByActorUserId: input.actor.id, recordVersion: 1
  };
  input.state.documentDeliveries.push(delivery);
  appendEvent(input.state, delivery, { eventType: "PREPARED", actor: input.actor, reason: "Exact immutable v5 protected artifact pinned for controlled delivery.", requestId: input.requestId, idempotencyKey: `${key}:prepared`, occurredAt: now });
  return { delivery, replayed: false };
}

function ownedDelivery(state: AppState, organisationId: string, deliveryIdValue: unknown) {
  const deliveryId = required(deliveryIdValue, "Delivery ID", 160);
  const delivery = state.documentDeliveries.find((item) => item.id === deliveryId && item.organisationId === organisationId);
  if (!delivery) throw new DocumentDeliveryError(404, "Delivery record not found.");
  return delivery;
}

export function markDocumentDeliveryReady(input: StaffMutationInput & {
  deliveryId: unknown; expectedRecordVersion: unknown; protectedPdf: ProtectedPdfDeliveryDescriptor;
}) {
  const key = stableKey(input.idempotencyKey); const delivery = ownedDelivery(input.state, input.organisationId, input.deliveryId);
  const prior = input.state.documentDeliveryEvents.find((item) => item.deliveryId === delivery.id && item.idempotencyKey === `${key}:ready`);
  if (prior && (delivery.status === "READY" || delivery.status === "DELIVERED" || delivery.status === "ACKNOWLEDGED")) return { delivery, readiness: projectVastuRemedyDeliveryReadiness({ state: input.state, organisationId: input.organisationId, reportId: delivery.reportId, protectedPdf: input.protectedPdf }), replayed: true };
  expectedVersion(delivery, input.expectedRecordVersion, "delivery");
  const readiness = projectVastuRemedyDeliveryReadiness({ state: input.state, organisationId: input.organisationId, reportId: delivery.reportId, protectedPdf: input.protectedPdf });
  const pinMatches = input.protectedPdf.artifactId === delivery.protectedPdfArtifactId && input.protectedPdf.artifactHashSha256 === delivery.protectedPdfChecksumSha256 && input.protectedPdf.sourceSnapshotHash === delivery.reportCanonicalHash;
  if (!readiness.ready || !pinMatches) {
    appendEvent(input.state, delivery, { eventType: "READINESS_FAILED", actor: input.actor, reason: !pinMatches ? "The inspected protected artifact does not match the delivery snapshot." : readiness.blockers.join(" "), requestId: input.requestId, idempotencyKey: `${key}:readiness-failed` });
    return { delivery, readiness: { ...readiness, ready: false, blockers: [...readiness.blockers, ...(!pinMatches ? ["The protected artifact pin changed."] : [])] }, replayed: false };
  }
  const now = new Date().toISOString(); delivery.status = "READY"; delivery.ready = actorSnapshot(input.actor, now);
  delivery.updatedAt = now; delivery.updatedByActorUserId = input.actor.id; delivery.recordVersion = (delivery.recordVersion ?? 0) + 1;
  appendEvent(input.state, delivery, { eventType: "READY", actor: input.actor, reason: "All existing report, integrity, approval, payment, recipient, and protected-artifact gates passed.", requestId: input.requestId, idempotencyKey: `${key}:ready`, occurredAt: now });
  return { delivery, readiness, replayed: false };
}

export function deliverDocument(input: StaffMutationInput & {
  deliveryId: unknown; expectedRecordVersion: unknown; channel: unknown; manualHandoffDescription?: unknown;
  protectedPdf: ProtectedPdfDeliveryDescriptor;
}) {
  const key = stableKey(input.idempotencyKey); const delivery = ownedDelivery(input.state, input.organisationId, input.deliveryId);
  const channel = input.channel === "CLIENT_PORTAL" || input.channel === "MANUAL_HANDOFF" ? input.channel : undefined;
  if (!channel) throw new DocumentDeliveryError(400, "Delivery channel must be CLIENT_PORTAL or MANUAL_HANDOFF.");
  const prior = input.state.documentDeliveryEvents.find((item) => item.deliveryId === delivery.id && item.idempotencyKey === `${key}:delivered`);
  if (prior) return { delivery, replayed: true };
  expectedVersion(delivery, input.expectedRecordVersion, "delivery");
  if (delivery.status !== "READY" && delivery.status !== "DELIVERED" && delivery.status !== "ACKNOWLEDGED") throw new DocumentDeliveryError(409, "Only a Ready delivery can be delivered.");
  if (input.protectedPdf.status !== "RELEASED" || input.protectedPdf.artifactId !== delivery.protectedPdfArtifactId
    || input.protectedPdf.artifactHashSha256 !== delivery.protectedPdfChecksumSha256
    || input.protectedPdf.sourceSnapshotHash !== delivery.reportCanonicalHash) {
    throw new DocumentDeliveryError(409, "Delivery is blocked because the exact released protected artifact no longer matches its delivery snapshot.");
  }
  const manual = channel === "MANUAL_HANDOFF" ? required(input.manualHandoffDescription, "Manual handoff description", 500) : undefined;
  const now = new Date().toISOString(); const repeat = delivery.status === "DELIVERED" || delivery.status === "ACKNOWLEDGED";
  if (!repeat) {
    delivery.status = "DELIVERED"; delivery.channel = channel; delivery.delivered = actorSnapshot(input.actor, now);
    if (manual) delivery.manualHandoffDescription = manual;
    delivery.updatedAt = now; delivery.updatedByActorUserId = input.actor.id; delivery.recordVersion = (delivery.recordVersion ?? 0) + 1;
  }
  appendEvent(input.state, delivery, { eventType: repeat ? "REDELIVERED" : channel === "MANUAL_HANDOFF" ? "MANUAL_HANDOFF_RECORDED" : "DELIVERED",
    actor: input.actor, channel, reason: manual ?? (repeat ? "Same immutable protected artifact delivered again." : "Client portal access activated for the exact immutable protected artifact."),
    requestId: input.requestId, idempotencyKey: `${key}:delivered`, occurredAt: now });
  appendClientTimeline(input.state, delivery, input.actor, repeat ? "Final report delivery recorded again" : "Final protected report delivered",
    `${delivery.reportVersionLabel} was ${channel === "MANUAL_HANDOFF" ? "recorded as manually handed to" : "made available securely to"} ${delivery.recipientDisplayName}.`, now);
  return { delivery, replayed: false, repeated: repeat };
}

export function acknowledgeDocumentDelivery(input: {
  state: AppState; actor: AppUser; clientId: string; deliveryId: unknown; expectedRecordVersion: unknown;
  idempotencyKey: unknown; requestId: string;
}) {
  if (input.actor.role !== "CLIENT") throw new DocumentDeliveryError(403, "Only the recipient client may acknowledge receipt.");
  const key = stableKey(input.idempotencyKey);
  const delivery = input.state.documentDeliveries.find((item) => item.id === input.deliveryId && item.recipientClientId === input.clientId);
  if (!delivery) throw new DocumentDeliveryError(404, "Delivered report not found.");
  const prior = input.state.documentDeliveryEvents.find((item) => item.deliveryId === delivery.id && item.idempotencyKey === `${key}:acknowledged`);
  if (prior && delivery.status === "ACKNOWLEDGED") return { delivery, replayed: true };
  expectedVersion(delivery, input.expectedRecordVersion, "delivery");
  if (delivery.status !== "DELIVERED" && delivery.status !== "ACKNOWLEDGED") throw new DocumentDeliveryError(409, "Receipt can be acknowledged only after delivery.");
  if (delivery.status !== "ACKNOWLEDGED") {
    const now = new Date().toISOString(); delivery.status = "ACKNOWLEDGED"; delivery.acknowledged = actorSnapshot(input.actor, now);
    delivery.updatedAt = now; delivery.updatedByActorUserId = input.actor.id; delivery.recordVersion = (delivery.recordVersion ?? 0) + 1;
    appendEvent(input.state, delivery, { eventType: "ACKNOWLEDGED", actor: input.actor, channel: delivery.channel,
      reason: "Client acknowledged receipt only; this is not a legal signature or implementation confirmation.", requestId: input.requestId,
      idempotencyKey: `${key}:acknowledged`, occurredAt: now });
    appendClientTimeline(input.state, delivery, input.actor, "Report receipt acknowledged", `${delivery.recipientDisplayName} acknowledged receipt of ${delivery.reportVersionLabel}. This is a receipt acknowledgement only.`, now);
  }
  return { delivery, replayed: false };
}

export function appendDocumentDeliveryAccess(input: {
  state: AppState; delivery: DocumentDeliveryRecord; actor: AppUser; eventType: "VIEWED" | "DOWNLOADED"; requestId: string;
}) {
  return appendEvent(input.state, input.delivery, { eventType: input.eventType, actor: input.actor, channel: "CLIENT_PORTAL",
    reason: `${input.eventType === "VIEWED" ? "Viewed" : "Downloaded"} exact delivered protected PDF.`, requestId: input.requestId,
    idempotencyKey: `delivery:${input.delivery.id}:${input.eventType.toLowerCase()}:${input.requestId}` });
}

export function deliveryHealth(state: AppState, delivery: DocumentDeliveryRecord, descriptor?: ProtectedPdfDeliveryDescriptor) {
  const issues: string[] = [];
  const report = state.reportVersions.find((item) => item.id === delivery.reportId && item.organisationId === delivery.organisationId);
  const client = state.clients.find((item) => item.id === delivery.recipientClientId && item.organisationId === delivery.organisationId);
  if (!report) issues.push("MISSING_REPORT_ARTIFACT");
  if (!client) issues.push("MISSING_RECIPIENT");
  if (!descriptor) issues.push("MISSING_PROTECTED_PDF");
  else {
    if (descriptor.artifactId !== delivery.protectedPdfArtifactId) issues.push("PROTECTED_ARTIFACT_ID_MISMATCH");
    if (descriptor.artifactHashSha256 !== delivery.protectedPdfChecksumSha256) issues.push("PROTECTED_PDF_CHECKSUM_MISMATCH");
    if (descriptor.sourceSnapshotHash !== delivery.reportCanonicalHash) issues.push("REPORT_HASH_MISMATCH");
  }
  if ((delivery.status === "DELIVERED" || delivery.status === "ACKNOWLEDGED") && !delivery.delivered?.occurredAt) issues.push("DELIVERED_TIMESTAMP_MISSING");
  if (delivery.replacementForDeliveryId && !state.documentDeliveries.some((item) => item.id === delivery.replacementForDeliveryId && item.organisationId === delivery.organisationId)) issues.push("INVALID_REPLACEMENT_LINK");
  return { healthy: issues.length === 0, issues };
}

export function listDocumentDeliveryEvents(state: AppState, deliveryId: string) {
  return state.documentDeliveryEvents.filter((item) => item.deliveryId === deliveryId).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}
