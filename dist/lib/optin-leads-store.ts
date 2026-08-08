import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { join } from "node:path";
import type { InboundLeadRecord } from "@/lib/domain";
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
    convertedClientId: record.convertedClientId,
  };
}

export async function readOptInLeadRecords(): Promise<InboundLeadRecord[]> {
  await ensureFileExists();
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as Array<Partial<InboundLeadRecord>>;
  return parsed.map((record, index) => hydrateLead(record, index));
}

export async function writeOptInLeadRecords(records: InboundLeadRecord[]) {
  await ensureFileExists();
  await writeFile(filePath, JSON.stringify(records, null, 2), "utf8");
  return records;
}
