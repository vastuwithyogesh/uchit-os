import { migrateD1 } from "../db/migrations.ts";
import type { InboundLeadRecord } from "./domain.ts";
import type { D1DatabaseBinding } from "./runtime-env.ts";

export const OPTIN_EVENT_SCHEMA_VERSION = "uchit-optin/v1";
export const OPTIN_SIGNATURE_MAX_SKEW_SECONDS = 300;
export const OPTIN_MAX_BODY_BYTES = 64 * 1024;

export class InboundEventError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

type OptinEvent = {
  schemaVersion: typeof OPTIN_EVENT_SCHEMA_VERSION; eventId: string; occurredAt: string; source: string;
  contact: { fullName: string; email?: string; phone?: string };
  consent: { contact: true; version: "uchit-intake/v1" };
  attribution?: { utmSource?: string; utmMedium?: string; utmCampaign?: string; utmTerm?: string; utmContent?: string };
  message?: string;
};

const encoder = new TextEncoder();
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const unsafeText = /[<>\u0000-\u001f\u007f]|(?:^|\s)(?:[a-z][a-z0-9+.-]*:|\/\/)|(?:https?:\/\/|www\.)/i;

function exactObject(value: unknown, allowed: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InboundEventError(400, `${label} must be an object.`);
  const record = value as Record<string, unknown>;
  const unknown = Object.keys(record).find((key) => !allowed.includes(key));
  if (unknown) throw new InboundEventError(400, `${label} contains an unsupported field.`);
  return record;
}

function safeText(value: unknown, label: string, max: number, required = false) {
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string") throw new InboundEventError(400, `${label} must be text.`);
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > max || unsafeText.test(normalized)) throw new InboundEventError(400, `${label} is invalid.`);
  return normalized || undefined;
}

export function parseInboundOptinEvent(value: unknown, nowMs: number): OptinEvent {
  const body = exactObject(value, ["schemaVersion", "eventId", "occurredAt", "source", "contact", "consent", "attribution", "message"], "event");
  if (body.schemaVersion !== OPTIN_EVENT_SCHEMA_VERSION) throw new InboundEventError(400, "Unsupported schemaVersion.");
  if (typeof body.eventId !== "string" || !uuidPattern.test(body.eventId)) throw new InboundEventError(400, "eventId must be a UUID.");
  if (typeof body.occurredAt !== "string") throw new InboundEventError(400, "occurredAt must be an ISO date-time.");
  const occurred = Date.parse(body.occurredAt);
  if (!Number.isFinite(occurred) || !/^\d{4}-\d{2}-\d{2}T/.test(body.occurredAt)) throw new InboundEventError(400, "occurredAt must be an ISO date-time.");
  if (occurred > nowMs + OPTIN_SIGNATURE_MAX_SKEW_SECONDS * 1000) throw new InboundEventError(400, "occurredAt is too far in the future.");
  const contact = exactObject(body.contact, ["fullName", "email", "phone"], "contact");
  const fullName = safeText(contact.fullName, "contact.fullName", 120, true)!;
  const email = safeText(contact.email, "contact.email", 254)?.toLowerCase();
  const rawPhone = safeText(contact.phone, "contact.phone", 32);
  const phone = rawPhone?.replace(/[\s().-]/g, "");
  if (email && !emailPattern.test(email)) throw new InboundEventError(400, "contact.email is invalid.");
  if (phone && !/^\+[1-9]\d{7,14}$/.test(phone)) throw new InboundEventError(400, "contact.phone must use canonical E.164 format.");
  if (!email && !phone) throw new InboundEventError(400, "Provide contact.email or contact.phone.");
  const consent = exactObject(body.consent, ["contact", "version"], "consent");
  if (consent.contact !== true || consent.version !== "uchit-intake/v1") throw new InboundEventError(400, "Explicit uchit-intake/v1 contact consent is required.");
  let attribution: OptinEvent["attribution"];
  if (body.attribution !== undefined) {
    const raw = exactObject(body.attribution, ["utmSource", "utmMedium", "utmCampaign", "utmTerm", "utmContent"], "attribution");
    attribution = Object.fromEntries(Object.entries(raw).map(([key, item]) => [key, safeText(item, `attribution.${key}`, 120)]).filter(([, item]) => item !== undefined));
  }
  return { schemaVersion: OPTIN_EVENT_SCHEMA_VERSION, eventId: body.eventId.toLowerCase(), occurredAt: new Date(occurred).toISOString(), source: safeText(body.source, "source", 80, true)!, contact: { fullName, ...(email ? { email } : {}), ...(phone ? { phone } : {}) }, consent: { contact: true, version: "uchit-intake/v1" }, ...(attribution && Object.keys(attribution).length ? { attribution } : {}), ...(body.message !== undefined ? { message: safeText(body.message, "message", 500) } : {}) };
}

async function hexDigest(algorithm: "SHA-256" | "HMAC", value: Uint8Array, secret?: string) {
  const result = algorithm === "HMAC"
    ? await crypto.subtle.sign("HMAC", await crypto.subtle.importKey("raw", encoder.encode(secret!), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), value.slice().buffer)
    : await crypto.subtle.digest("SHA-256", value.slice().buffer);
  return [...new Uint8Array(result)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeHexEqual(left: string, right: string) {
  if (left.length !== right.length || !/^[0-9a-f]+$/i.test(left) || !/^[0-9a-f]+$/i.test(right)) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export async function verifyInboundSignature(rawBody: Uint8Array, timestampHeader: string | null, signatureHeader: string | null, secret: string, nowMs: number) {
  if (!/^\d{10}$/.test(timestampHeader ?? "")) throw new InboundEventError(401, "Invalid signature timestamp.");
  const timestamp = Number(timestampHeader) * 1000;
  if (Math.abs(nowMs - timestamp) > OPTIN_SIGNATURE_MAX_SKEW_SECONDS * 1000) throw new InboundEventError(401, "Signature timestamp is outside the allowed window.");
  const supplied = signatureHeader?.match(/^sha256=([0-9a-f]{64})$/i)?.[1];
  if (!supplied) throw new InboundEventError(401, "Invalid signature.");
  const signed = new Uint8Array(encoder.encode(`${timestampHeader}.`).length + rawBody.length);
  signed.set(encoder.encode(`${timestampHeader}.`)); signed.set(rawBody, encoder.encode(`${timestampHeader}.`).length);
  const expected = await hexDigest("HMAC", signed, secret);
  if (!constantTimeHexEqual(supplied, expected)) throw new InboundEventError(401, "Invalid signature.");
}

function identityFor(event: OptinEvent) { return event.contact.email ? `email:${event.contact.email}` : `phone:${event.contact.phone!.replace(/\D/g, "")}`; }
function stableClientId(identity: string) { let hash = 2166136261; for (let i = 0; i < identity.length; i += 1) { hash ^= identity.charCodeAt(i); hash = Math.imul(hash, 16777619); } return `UC-${(hash >>> 0).toString(36).padStart(8, "0").slice(0, 10).toUpperCase()}`; }

export async function ingestInboundOptinEvent(db: D1DatabaseBinding, event: OptinEvent, rawBody: Uint8Array, receivedAt: string) {
  await migrateD1(db);
  const payloadHash = await hexDigest("SHA-256", rawBody);
  const replay = await db.prepare("SELECT payload_hash, outcome, submission_count FROM inbound_optin_events WHERE event_id = ?").bind(event.eventId).first<{ payload_hash: string; outcome: "CREATED" | "UPDATED"; submission_count: number }>();
  if (replay) {
    if (replay.payload_hash !== payloadHash) throw new InboundEventError(409, "eventId was already used with different content.");
    return { outcome: replay.outcome, submissionCount: replay.submission_count, replayed: true } as const;
  }
  const identity = identityFor(event);
  const identityHash = await hexDigest("SHA-256", encoder.encode(identity));
  const row = await db.prepare("SELECT payload FROM optin_leads WHERE identity_key = ?").bind(identity).first<{ payload: string }>();
  const existing = row ? JSON.parse(row.payload) as InboundLeadRecord : undefined;
  const submissionCount = (existing?.submissionCount ?? 0) + 1;
  const outcome = existing ? "UPDATED" : "CREATED";
  const lead: InboundLeadRecord = existing ? { ...existing } : { id: `inbound_${crypto.randomUUID()}`, uniqueClientId: stableClientId(identity), identityKey: identity, fullName: event.contact.fullName, email: event.contact.email ?? "", phone: event.contact.phone?.replace(/\D/g, "") ?? "", city: "", source: event.source, score: 0, message: "", status: "NEW", importedAt: receivedAt, firstSeenAt: event.occurredAt.slice(0, 10), lastSeenAt: event.occurredAt.slice(0, 10), submissionCount: 1, duplicateCount: 0, isReturningLead: false };
  lead.fullName = event.contact.fullName; lead.email = event.contact.email ?? lead.email; lead.phone = event.contact.phone?.replace(/\D/g, "") ?? lead.phone; lead.source = event.source; lead.message = event.message ?? lead.message; lead.utmSource = event.attribution?.utmSource; lead.utmMedium = event.attribution?.utmMedium; lead.utmCampaign = event.attribution?.utmCampaign; lead.utmTerm = event.attribution?.utmTerm; lead.utmContent = event.attribution?.utmContent; lead.lastSeenAt = event.occurredAt.slice(0, 10); lead.submissionCount = submissionCount; lead.duplicateCount = Math.max(0, submissionCount - 1); lead.isReturningLead = submissionCount > 1;
  try {
    await db.batch([
      db.prepare(`INSERT INTO optin_leads (id, identity_key, unique_client_id, payload, imported_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(identity_key) DO UPDATE SET payload=excluded.payload, last_seen_at=excluded.last_seen_at`).bind(lead.id, identity, lead.uniqueClientId, JSON.stringify(lead), lead.importedAt, lead.lastSeenAt),
      db.prepare("INSERT INTO inbound_optin_events (event_id, occurred_at, source, payload_hash, identity_hash, received_at, outcome, submission_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(event.eventId, event.occurredAt, "SIGNED_WEBHOOK", payloadHash, identityHash, receivedAt, outcome, submissionCount)
    ]);
  } catch (error) {
    const concurrent = await db.prepare("SELECT payload_hash, outcome, submission_count FROM inbound_optin_events WHERE event_id = ?").bind(event.eventId).first<{ payload_hash: string; outcome: "CREATED" | "UPDATED"; submission_count: number }>();
    if (concurrent?.payload_hash === payloadHash) return { outcome: concurrent.outcome, submissionCount: concurrent.submission_count, replayed: true } as const;
    throw error;
  }
  return { outcome, submissionCount, replayed: false } as const;
}

export async function readBoundedRequestBody(request: Request, maxBytes = OPTIN_MAX_BODY_BYTES) {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new InboundEventError(413, "Request body is too large.");
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new InboundEventError(413, "Request body is too large."); }
    chunks.push(value);
  }
  const body = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return body;
}

/** Secret-safe ADMIN readiness projection; no event payload, contact, identity or hashes are returned. */
export async function getOptInIntegrationReadiness(db: D1DatabaseBinding | undefined, secret: string | undefined) {
  const base = { enabled: Boolean(db && secret), configured: Boolean(db && secret), schemaVersion: OPTIN_EVENT_SCHEMA_VERSION, lastReceivedAt: null as string | null, lastOutcome: null as "CREATED" | "UPDATED" | null, eventCount: 0 };
  if (!db || !secret) return base;
  try {
    await migrateD1(db);
    const count = await db.prepare("SELECT COUNT(*) AS count FROM inbound_optin_events").first<{ count: number }>();
    const latest = await db.prepare("SELECT received_at, outcome FROM inbound_optin_events ORDER BY received_at DESC LIMIT 1").first<{ received_at: string; outcome: "CREATED" | "UPDATED" }>();
    return { ...base, lastReceivedAt: latest?.received_at ?? null, lastOutcome: latest?.outcome ?? null, eventCount: Number(count?.count ?? 0) };
  } catch { return { ...base, enabled: false }; }
}
