import { InboundEventError, readBoundedRequestBody, verifyInboundSignature } from "./inbound-optin-events.server.ts";
import type { D1DatabaseBinding } from "./runtime-env.ts";

export const LOVABLE_INTEGRATION_SCHEMA_VERSION = "uchit-lovable/v1" as const;
export const LOVABLE_INTEGRATION_MAX_BODY_BYTES = 64 * 1024;
export const LOVABLE_INTEGRATION_MAX_CLOCK_SKEW_SECONDS = 300;

export const lovableSourceEnvironments = ["PREVIEW", "STAGING", "PUBLISHED", "PRODUCTION"] as const;
export type LovableSourceEnvironment = (typeof lovableSourceEnvironments)[number];
export const lovableSourceRecordTypes = ["APPLICATION", "NUMEROLOGY_SUBMISSION", "LEAD_ACTIVITY", "LEAD_FOLLOWUP", "LEAD_MERGE"] as const;
export type LovableSourceRecordType = (typeof lovableSourceRecordTypes)[number];
export const lovableEventTypes = ["LEAD_UPSERT", "PIPELINE_CHANGE_REQUEST", "ACTIVITY_APPEND", "FOLLOWUP_UPSERT", "LEAD_DELETE", "LEAD_MERGE"] as const;
export type LovableEventType = (typeof lovableEventTypes)[number];

type Attribution = {
  utmSource?: string; utmMedium?: string; utmCampaign?: string; utmTerm?: string; utmContent?: string;
};

type LeadUpsertPayload = {
  fullName: string; email?: string; phone?: string; city?: string; source?: string; propertyStage?: string;
  status?: string; notes?: string; landingPage?: string; referrer?: string; submissionCount?: number;
  lastSubmittedAt?: string; attribution?: Attribution;
};

type PipelineChangePayload = {
  sourceStatus: string; nextAction?: string; nextActionDueAt?: string; reason?: string;
};

type ActivityPayload = {
  activityType: "call" | "email" | "whatsapp" | "meeting" | "note" | "status_change" | "sms";
  content?: string;
};

type FollowupPayload = { title: string; notes?: string; dueAt?: string; completedAt?: string };
type DeletePayload = { deletedAt?: string; reason?: string };
type MergePayload = { survivorSourceRecordId: string; mergedSourceRecordId: string; matchReason?: string };

export type LovableEventPayload = LeadUpsertPayload | PipelineChangePayload | ActivityPayload | FollowupPayload | DeletePayload | MergePayload;

export type LovableIntegrationEvent = {
  schemaVersion: typeof LOVABLE_INTEGRATION_SCHEMA_VERSION;
  eventId: string;
  sourceSystem: "LOVABLE";
  sourceEnvironment: LovableSourceEnvironment;
  sourceRecordType: LovableSourceRecordType;
  sourceRecordId: string;
  externalClientCode?: string;
  eventType: LovableEventType;
  occurredAt: string;
  actor: { kind: "SOURCE_USER" | "SOURCE_SYSTEM"; sourceActorId?: string };
  recordVersion?: number;
  payload: LovableEventPayload;
};

export type LovableWrapperConfig = {
  enabled: boolean;
  activated: boolean;
  environment?: LovableSourceEnvironment;
  sourceKey?: string;
  secret?: string;
  outboundUrl?: string;
  db?: D1DatabaseBinding;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const phonePattern = /^\+[1-9]\d{7,14}$/;
const unsafeText = /[<>\u0000-\u001f\u007f]|(?:^|\s)(?:[a-z][a-z0-9+.-]*:|\/\/)|(?:https?:\/\/|www\.)/i;

function exactObject(value: unknown, allowed: readonly string[], label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InboundEventError(400, `${label} must be an object.`);
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !allowed.includes(key))) throw new InboundEventError(400, `${label} contains an unsupported field.`);
  return record;
}

function safeText(value: unknown, label: string, max: number, required = false) {
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string") throw new InboundEventError(400, `${label} must be text.`);
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > max || unsafeText.test(normalized)) throw new InboundEventError(400, `${label} is invalid.`);
  return normalized || undefined;
}

function safeIso(value: unknown, label: string, nowMs: number, allowFuture = false) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) throw new InboundEventError(400, `${label} must be an ISO date-time.`);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || (!allowFuture && parsed > nowMs + LOVABLE_INTEGRATION_MAX_CLOCK_SKEW_SECONDS * 1000)) throw new InboundEventError(400, `${label} is invalid.`);
  return new Date(parsed).toISOString();
}

function optionalEmail(value: unknown) {
  const email = safeText(value, "payload.email", 254)?.toLowerCase();
  if (email && !emailPattern.test(email)) throw new InboundEventError(400, "payload.email is invalid.");
  return email;
}

function optionalPhone(value: unknown) {
  const raw = safeText(value, "payload.phone", 32);
  if (!raw) return undefined;
  const phone = raw.replace(/[\s().-]/g, "");
  if (!phonePattern.test(phone)) throw new InboundEventError(400, "payload.phone must use canonical E.164 format.");
  return phone;
}

function parseAttribution(value: unknown): Attribution | undefined {
  if (value === undefined) return undefined;
  const raw = exactObject(value, ["utmSource", "utmMedium", "utmCampaign", "utmTerm", "utmContent"], "payload.attribution");
  const result = Object.fromEntries(Object.entries(raw).map(([key, item]) => [key, safeText(item, `payload.attribution.${key}`, 120)]).filter(([, item]) => item !== undefined));
  return Object.keys(result).length ? result as Attribution : undefined;
}

function parsePayload(eventType: LovableEventType, value: unknown, nowMs: number): LovableEventPayload {
  if (eventType === "LEAD_UPSERT") {
    const raw = exactObject(value, ["fullName", "email", "phone", "city", "source", "propertyStage", "status", "notes", "landingPage", "referrer", "submissionCount", "lastSubmittedAt", "attribution"], "payload");
    const email = optionalEmail(raw.email); const phone = optionalPhone(raw.phone);
    if (!email && !phone) throw new InboundEventError(400, "payload.email or payload.phone is required.");
    const submissionCount = raw.submissionCount;
    if (submissionCount !== undefined && (typeof submissionCount !== "number" || !Number.isSafeInteger(submissionCount) || submissionCount < 1 || submissionCount > 1_000_000)) throw new InboundEventError(400, "payload.submissionCount is invalid.");
    return {
      fullName: safeText(raw.fullName, "payload.fullName", 120, true)!,
      ...(email ? { email } : {}), ...(phone ? { phone } : {}),
      ...(raw.city !== undefined ? { city: safeText(raw.city, "payload.city", 120) } : {}),
      ...(raw.source !== undefined ? { source: safeText(raw.source, "payload.source", 120) } : {}),
      ...(raw.propertyStage !== undefined ? { propertyStage: safeText(raw.propertyStage, "payload.propertyStage", 120) } : {}),
      ...(raw.status !== undefined ? { status: safeText(raw.status, "payload.status", 80) } : {}),
      ...(raw.notes !== undefined ? { notes: safeText(raw.notes, "payload.notes", 2000) } : {}),
      ...(raw.landingPage !== undefined ? { landingPage: safeText(raw.landingPage, "payload.landingPage", 500) } : {}),
      ...(raw.referrer !== undefined ? { referrer: safeText(raw.referrer, "payload.referrer", 500) } : {}),
      ...(submissionCount !== undefined ? { submissionCount } : {}),
      ...(raw.lastSubmittedAt !== undefined ? { lastSubmittedAt: safeIso(raw.lastSubmittedAt, "payload.lastSubmittedAt", nowMs) } : {}),
      ...(parseAttribution(raw.attribution) ? { attribution: parseAttribution(raw.attribution) } : {})
    } satisfies LeadUpsertPayload;
  }
  if (eventType === "PIPELINE_CHANGE_REQUEST") {
    const raw = exactObject(value, ["sourceStatus", "nextAction", "nextActionDueAt", "reason"], "payload");
    const sourceStatus = safeText(raw.sourceStatus, "payload.sourceStatus", 80, true)!;
    const dueAt = raw.nextActionDueAt === undefined ? undefined : safeIso(raw.nextActionDueAt, "payload.nextActionDueAt", nowMs, true);
    return { sourceStatus, ...(raw.nextAction !== undefined ? { nextAction: safeText(raw.nextAction, "payload.nextAction", 500) } : {}), ...(dueAt ? { nextActionDueAt: dueAt } : {}), ...(raw.reason !== undefined ? { reason: safeText(raw.reason, "payload.reason", 500) } : {}) } satisfies PipelineChangePayload;
  }
  if (eventType === "ACTIVITY_APPEND") {
    const raw = exactObject(value, ["activityType", "content"], "payload");
    const activityType = raw.activityType;
    if (!["call", "email", "whatsapp", "meeting", "note", "status_change", "sms"].includes(String(activityType))) throw new InboundEventError(400, "payload.activityType is invalid.");
    return { activityType: activityType as ActivityPayload["activityType"], ...(raw.content !== undefined ? { content: safeText(raw.content, "payload.content", 2000) } : {}) };
  }
  if (eventType === "FOLLOWUP_UPSERT") {
    const raw = exactObject(value, ["title", "notes", "dueAt", "completedAt"], "payload");
    return { title: safeText(raw.title, "payload.title", 240, true)!, ...(raw.notes !== undefined ? { notes: safeText(raw.notes, "payload.notes", 2000) } : {}), ...(raw.dueAt !== undefined ? { dueAt: safeIso(raw.dueAt, "payload.dueAt", nowMs, true) } : {}), ...(raw.completedAt !== undefined ? { completedAt: safeIso(raw.completedAt, "payload.completedAt", nowMs, true) } : {}) } satisfies FollowupPayload;
  }
  if (eventType === "LEAD_DELETE") {
    const raw = exactObject(value, ["deletedAt", "reason"], "payload");
    return { ...(raw.deletedAt !== undefined ? { deletedAt: safeIso(raw.deletedAt, "payload.deletedAt", nowMs) } : {}), ...(raw.reason !== undefined ? { reason: safeText(raw.reason, "payload.reason", 500) } : {}) } satisfies DeletePayload;
  }
  const raw = exactObject(value, ["survivorSourceRecordId", "mergedSourceRecordId", "matchReason"], "payload");
  return { survivorSourceRecordId: safeText(raw.survivorSourceRecordId, "payload.survivorSourceRecordId", 256, true)!, mergedSourceRecordId: safeText(raw.mergedSourceRecordId, "payload.mergedSourceRecordId", 256, true)!, ...(raw.matchReason !== undefined ? { matchReason: safeText(raw.matchReason, "payload.matchReason", 500) } : {}) } satisfies MergePayload;
}

function assertEventRecordBinding(recordType: LovableSourceRecordType, eventType: LovableEventType) {
  const allowed: Record<LovableSourceRecordType, readonly LovableEventType[]> = {
    APPLICATION: ["LEAD_UPSERT", "PIPELINE_CHANGE_REQUEST", "LEAD_DELETE"],
    NUMEROLOGY_SUBMISSION: ["LEAD_UPSERT"],
    LEAD_ACTIVITY: ["ACTIVITY_APPEND"],
    LEAD_FOLLOWUP: ["FOLLOWUP_UPSERT"],
    LEAD_MERGE: ["LEAD_MERGE"]
  };
  if (!allowed[recordType].includes(eventType)) throw new InboundEventError(400, "Event type does not match source record type.");
}

export function parseLovableIntegrationEvent(value: unknown, nowMs = Date.now()): LovableIntegrationEvent {
  const raw = exactObject(value, ["schemaVersion", "eventId", "sourceSystem", "sourceEnvironment", "sourceRecordType", "sourceRecordId", "externalClientCode", "eventType", "occurredAt", "actor", "recordVersion", "payload"], "event");
  if (raw.schemaVersion !== LOVABLE_INTEGRATION_SCHEMA_VERSION) throw new InboundEventError(400, "Unsupported schemaVersion.");
  if (typeof raw.eventId !== "string" || !uuidPattern.test(raw.eventId)) throw new InboundEventError(400, "eventId must be a UUID.");
  if (raw.sourceSystem !== "LOVABLE") throw new InboundEventError(400, "sourceSystem is invalid.");
  if (!lovableSourceEnvironments.includes(raw.sourceEnvironment as LovableSourceEnvironment)) throw new InboundEventError(400, "sourceEnvironment is invalid.");
  if (!lovableSourceRecordTypes.includes(raw.sourceRecordType as LovableSourceRecordType)) throw new InboundEventError(400, "sourceRecordType is invalid.");
  if (!lovableEventTypes.includes(raw.eventType as LovableEventType)) throw new InboundEventError(400, "eventType is invalid.");
  assertEventRecordBinding(raw.sourceRecordType as LovableSourceRecordType, raw.eventType as LovableEventType);
  const actor = exactObject(raw.actor, ["kind", "sourceActorId"], "actor");
  if (actor.kind !== "SOURCE_USER" && actor.kind !== "SOURCE_SYSTEM") throw new InboundEventError(400, "actor.kind is invalid.");
  const parsedVersion = raw.recordVersion;
  if (parsedVersion !== undefined && (typeof parsedVersion !== "number" || !Number.isSafeInteger(parsedVersion) || parsedVersion < 0)) throw new InboundEventError(428, "recordVersion must be a non-negative integer.");
  return {
    schemaVersion: LOVABLE_INTEGRATION_SCHEMA_VERSION,
    eventId: raw.eventId.toLowerCase(),
    sourceSystem: "LOVABLE",
    sourceEnvironment: raw.sourceEnvironment as LovableSourceEnvironment,
    sourceRecordType: raw.sourceRecordType as LovableSourceRecordType,
    sourceRecordId: safeText(raw.sourceRecordId, "sourceRecordId", 256, true)!,
    ...(raw.externalClientCode !== undefined ? { externalClientCode: safeText(raw.externalClientCode, "externalClientCode", 160) } : {}),
    eventType: raw.eventType as LovableEventType,
    occurredAt: safeIso(raw.occurredAt, "occurredAt", nowMs),
    actor: { kind: actor.kind as "SOURCE_USER" | "SOURCE_SYSTEM", ...(actor.sourceActorId !== undefined ? { sourceActorId: safeText(actor.sourceActorId, "actor.sourceActorId", 256) } : {}) },
    ...(parsedVersion !== undefined ? { recordVersion: parsedVersion } : {}),
    payload: parsePayload(raw.eventType as LovableEventType, raw.payload, nowMs)
  };
}

export function getLovableIntegrationConfig(env: { DB?: D1DatabaseBinding; LOVABLE_INTEGRATION_SECRET?: string; LOVABLE_INTEGRATION_ENABLED?: string; LOVABLE_INTEGRATION_ACTIVATION?: string; LOVABLE_INTEGRATION_ENVIRONMENT?: string; LOVABLE_INTEGRATION_SOURCE_KEY?: string; LOVABLE_INTEGRATION_OUTBOUND_URL?: string }): LovableWrapperConfig {
  const environment = lovableSourceEnvironments.includes(env.LOVABLE_INTEGRATION_ENVIRONMENT as LovableSourceEnvironment) ? env.LOVABLE_INTEGRATION_ENVIRONMENT as LovableSourceEnvironment : undefined;
  return {
    enabled: env.LOVABLE_INTEGRATION_ENABLED === "true" && Boolean(env.LOVABLE_INTEGRATION_SECRET && environment && env.LOVABLE_INTEGRATION_SOURCE_KEY),
    activated: env.LOVABLE_INTEGRATION_ACTIVATION === "approved",
    ...(environment ? { environment } : {}), ...(env.LOVABLE_INTEGRATION_SOURCE_KEY ? { sourceKey: env.LOVABLE_INTEGRATION_SOURCE_KEY } : {}),
    ...(env.LOVABLE_INTEGRATION_SECRET ? { secret: env.LOVABLE_INTEGRATION_SECRET } : {}), ...(env.LOVABLE_INTEGRATION_OUTBOUND_URL ? { outboundUrl: env.LOVABLE_INTEGRATION_OUTBOUND_URL } : {}),
    ...(env.DB ? { db: env.DB } : {})
  };
}

export function isLovableWrapperReady(config: LovableWrapperConfig) {
  return Boolean(config.enabled && config.activated && config.db && config.environment && config.sourceKey && config.secret);
}

export { readBoundedRequestBody, verifyInboundSignature };
