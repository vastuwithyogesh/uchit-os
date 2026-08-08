import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { join } from "node:path";
import type { InboundLeadRecord } from "@/lib/domain";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { buildInboundLeadIdentity, buildStableClientId, normalizeCsvDate, normalizeLeadEmail, normalizeLeadPhone } from "@/lib/lead-import";

const filePath = join(process.cwd(), "data", "optin-leads.json");

async function ensureFileExists() {
  try {
    await access(filePath, fsConstants.F_OK);
  } catch {
    await mkdir(join(process.cwd(), "data"), { recursive: true });
    await writeFile(filePath, JSON.stringify([], null, 2), "utf8");
  }
}

function hydrateLead(record: Partial<InboundLeadRecord>, index: number): InboundLeadRecord {
  const normalizedEmail = normalizeLeadEmail(String(record.email ?? ""));
  const normalizedPhone = normalizeLeadPhone(String(record.phone ?? ""));
  const identityKey =
    String(record.identityKey ?? "").trim() ||
    buildInboundLeadIdentity({
      email: normalizedEmail,
      phone: normalizedPhone,
      fullName: String(record.fullName ?? ""),
      dob: String(record.dob ?? ""),
      city: String(record.city ?? ""),
      source: String(record.source ?? "")
    });
  const uniqueClientId = String(record.uniqueClientId ?? "").trim() || buildStableClientId(identityKey);
  const importedAt = String(record.importedAt ?? new Date().toISOString());
  const firstSeenAt = normalizeCsvDate(String(record.firstSeenAt ?? importedAt));
  const lastSeenAt = normalizeCsvDate(String(record.lastSeenAt ?? importedAt));

  return {
    id: String(record.id ?? `inbound_${Date.now()}_${index}`),
    uniqueClientId,
    identityKey,
    fullName: String(record.fullName ?? `Lead ${index + 1}`),
    email: normalizedEmail,
    phone: normalizedPhone,
    dob: record.dob,
    city: String(record.city ?? ""),
    source: String(record.source ?? "Website opt-in"),
    statusLabel: record.statusLabel,
    utmSource: record.utmSource,
    utmMedium: record.utmMedium,
    utmCampaign: record.utmCampaign,
    utmTerm: record.utmTerm,
    utmContent: record.utmContent,
    landingPage: record.landingPage,
    referrer: record.referrer,
    assignedTo: record.assignedTo,
    deletedAt: record.deletedAt,
    score: typeof record.score === "number" ? record.score : 60,
    message: String(record.message ?? record.notes ?? ""),
    notes: record.notes,
    status: record.status ?? "NEW",
    importedAt,
    firstSeenAt,
    lastSeenAt,
    submissionCount: typeof record.submissionCount === "number" ? record.submissionCount : 1,
    duplicateCount: typeof record.duplicateCount === "number" ? record.duplicateCount : 0,
    isReturningLead: Boolean(record.isReturningLead),
    qualifiedAt: record.qualifiedAt,
    convertedClientId: record.convertedClientId
  };
}

async function readFromD1(): Promise<InboundLeadRecord[] | null> {
  const env = getRuntimeEnv();
  if (!env.DB) {
    return null;
  }

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS optin_leads (
      id TEXT PRIMARY KEY,
      identity_key TEXT NOT NULL UNIQUE,
      unique_client_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      imported_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    )
  `).run();

  const result = await env.DB.prepare("SELECT payload FROM optin_leads ORDER BY last_seen_at DESC").all<{ payload: string }>();
  return (result.results ?? []).map((row, index) => hydrateLead(JSON.parse(row.payload) as Partial<InboundLeadRecord>, index));
}

async function writeToD1(records: InboundLeadRecord[]) {
  const env = getRuntimeEnv();
  if (!env.DB) {
    return null;
  }

  await env.DB.batch([
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS optin_leads (
        id TEXT PRIMARY KEY,
        identity_key TEXT NOT NULL UNIQUE,
        unique_client_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        imported_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      )
    `),
    env.DB.prepare("DELETE FROM optin_leads")
  ]);

  if (records.length > 0) {
    await env.DB.batch(
      records.map((record) =>
        env.DB.prepare(
          "INSERT INTO optin_leads (id, identity_key, unique_client_id, payload, imported_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)"
        ).bind(
          record.id,
          record.identityKey,
          record.uniqueClientId,
          JSON.stringify(record),
          record.importedAt,
          record.lastSeenAt
        )
      )
    );
  }

  return records;
}

export async function readOptInLeadRecords(): Promise<InboundLeadRecord[]> {
  const fromDb = await readFromD1();
  if (fromDb) {
    return fromDb;
  }

  await ensureFileExists();
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as Array<Partial<InboundLeadRecord>>;
  return parsed.map((record, index) => hydrateLead(record, index));
}

export async function writeOptInLeadRecords(records: InboundLeadRecord[]) {
  const wroteToDb = await writeToD1(records);
  if (wroteToDb) {
    return wroteToDb;
  }

  await ensureFileExists();
  await writeFile(filePath, JSON.stringify(records, null, 2), "utf8");
  return records;
}
