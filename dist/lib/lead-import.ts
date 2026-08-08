import type { InboundLeadRecord } from "@/lib/domain";

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const next = line[index + 1];

    if (character === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  values.push(current.trim());
  return values;
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "").replace(/[_-]/g, "");
}

export function normalizeLeadEmail(email: string) {
  return email.trim().toLowerCase();
}

export function normalizeLeadPhone(phone: string) {
  return phone.replace(/\D/g, "");
}

export function normalizeCsvDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const isoMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) {
    return isoMatch[1];
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return trimmed;
}

export function buildInboundLeadIdentity(input: {
  email?: string;
  phone?: string;
  fullName?: string;
  dob?: string;
  city?: string;
  source?: string;
}) {
  const email = normalizeLeadEmail(String(input.email ?? ""));
  const phone = normalizeLeadPhone(String(input.phone ?? ""));
  const name = String(input.fullName ?? "").trim().toLowerCase();
  const dob = String(input.dob ?? "").trim().toLowerCase();
  const city = String(input.city ?? "").trim().toLowerCase();
  const source = String(input.source ?? "").trim().toLowerCase();

  if (email) {
    return `email:${email}`;
  }
  if (phone) {
    return `phone:${phone}`;
  }
  if (name || dob || city) {
    return `profile:${[name, dob, city, source].filter(Boolean).join("|")}`;
  }
  return `fallback:${[name, dob, city, source].filter(Boolean).join("|") || "unknown"}`;
}

export function buildStableClientId(identityKey: string) {
  let hash = 2166136261;
  for (let index = 0; index < identityKey.length; index += 1) {
    hash ^= identityKey.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const normalized = (hash >>> 0).toString(36).padStart(8, "0").slice(0, 10);
  return `UC-${normalized.toUpperCase()}`;
}

export type ParsedInboundLeadRow = Omit<InboundLeadRecord, "id" | "status" | "importedAt" | "uniqueClientId" | "identityKey" | "firstSeenAt" | "lastSeenAt" | "submissionCount" | "duplicateCount" | "isReturningLead"> & {
  csvCreatedDate: string;
};

export function parseInboundLeadCsv(csvText: string): ParsedInboundLeadRow[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  const body = lines.slice(1);

  return body.map((row, index) => {
    const cells = parseCsvLine(row);
    const record = Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex] ?? ""]));
    const csvStatus = String(record.status ?? "").trim().toLowerCase();
    const csvCreatedDate = normalizeCsvDate(String(record.createdat ?? record.created_at ?? ""));

    return {
      fullName: String(record.fullname ?? record.name ?? `Lead ${index + 1}`),
      email: String(record.email ?? ""),
      phone: String(record.phone ?? record.mobile ?? ""),
      dob: String(record.dob ?? ""),
      city: String(record.city ?? ""),
      source: String(record.source ?? record.utmsource ?? "Website opt-in"),
      statusLabel: String(record.status ?? ""),
      utmSource: String(record.utmsource ?? ""),
      utmMedium: String(record.utmmedium ?? ""),
      utmCampaign: String(record.utmcampaign ?? ""),
      utmTerm: String(record.utmterm ?? ""),
      utmContent: String(record.utmcontent ?? ""),
      landingPage: String(record.landingpage ?? ""),
      referrer: String(record.referrer ?? ""),
      assignedTo: String(record.assignedto ?? ""),
      deletedAt: String(record.deletedat ?? ""),
      score: csvStatus === "qualified" ? 85 : csvStatus === "disqualified" ? 25 : csvStatus === "duplicate" ? 40 : 60,
      message: String(record.notes ?? record.message ?? ""),
      notes: String(record.notes ?? record.message ?? ""),
      csvCreatedDate
    };
  });
}

export function toInboundLeadRecord(input: ParsedInboundLeadRow, index: number): InboundLeadRecord {
  const identityKey = buildInboundLeadIdentity(input);
  const uniqueClientId = buildStableClientId(identityKey);
  const now = new Date().toISOString();

  return {
    id: `inbound_${Date.now()}_${index}`,
    uniqueClientId,
    identityKey,
    fullName: input.fullName,
    email: normalizeLeadEmail(input.email),
    phone: normalizeLeadPhone(input.phone),
    dob: input.dob,
    city: input.city,
    source: input.source,
    statusLabel: input.statusLabel,
    utmSource: input.utmSource,
    utmMedium: input.utmMedium,
    utmCampaign: input.utmCampaign,
    utmTerm: input.utmTerm,
    utmContent: input.utmContent,
    landingPage: input.landingPage,
    referrer: input.referrer,
    assignedTo: input.assignedTo,
    deletedAt: input.deletedAt,
    score: input.score,
    message: input.message,
    notes: input.notes,
    status: "NEW",
    importedAt: now,
    firstSeenAt: input.csvCreatedDate || now.slice(0, 10),
    lastSeenAt: input.csvCreatedDate || now.slice(0, 10),
    submissionCount: 1,
    duplicateCount: 0,
    isReturningLead: false
  };
}
