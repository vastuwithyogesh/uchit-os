import type { ClientRecord, InboundLeadRecord, VastuServiceType } from "@/lib/domain";
import { deterministicContentHash } from "./evaluation-provenance.ts";

export const LEAD_IMPORT_SCHEMA_VERSION = "uchit-lead-import/v1" as const;
export const LEAD_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const LEAD_IMPORT_MAX_ROWS = 1000;
export const LEAD_IMPORT_TEMPLATE_COLUMNS = [
  "full_name",
  "email",
  "phone",
  "city",
  "service_interest",
  "source",
  "received_at",
  "message",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "status"
] as const;

export const LEAD_IMPORT_TEMPLATE = `${LEAD_IMPORT_TEMPLATE_COLUMNS.join(",")}\n`;

const HEADER_ALIASES: Record<string, (typeof LEAD_IMPORT_TEMPLATE_COLUMNS)[number]> = {
  fullname: "full_name", name: "full_name", email: "email", phone: "phone", mobile: "phone", city: "city",
  serviceinterest: "service_interest", source: "source", receivedat: "received_at", createdat: "received_at",
  message: "message", notes: "message", utmsource: "utm_source", utmmedium: "utm_medium",
  utmcampaign: "utm_campaign", utmterm: "utm_term", utmcontent: "utm_content", status: "status"
};

const FORMULA_PREFIX = /^[=+\-@]/;
const UNSAFE_TEXT = /[<>\u0000-\u001f\u007f]/;

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const next = line[index + 1];
    if (character === '"') {
      if (inQuotes && next === '"') { current += '"'; index += 1; }
      else inQuotes = !inQuotes;
      continue;
    }
    if (character === "," && !inQuotes) { values.push(current.trim()); current = ""; continue; }
    current += character;
  }
  if (inQuotes) throw new Error("The CSV contains an unterminated quoted field.");
  values.push(current.trim());
  return values;
}

function normalizeHeader(value: string) {
  return value.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/\s+/g, "").replace(/[_-]/g, "");
}

export function normalizeLeadEmail(email: string) {
  return email.trim().toLowerCase();
}

export function normalizeLeadPhone(phone: string) {
  return phone.replace(/\D/g, "");
}

export function normalizeCsvDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const isoMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? trimmed : parsed.toISOString().slice(0, 10);
}

export function buildInboundLeadIdentity(input: {
  email?: string; phone?: string; fullName?: string; dob?: string; city?: string; source?: string;
}) {
  const email = normalizeLeadEmail(String(input.email ?? ""));
  const phone = normalizeLeadPhone(String(input.phone ?? ""));
  const name = String(input.fullName ?? "").trim().toLowerCase();
  const dob = String(input.dob ?? "").trim().toLowerCase();
  const city = String(input.city ?? "").trim().toLowerCase();
  const source = String(input.source ?? "").trim().toLowerCase();
  if (email) return `email:${email}`;
  if (phone) return `phone:${phone}`;
  if (name || dob || city) return `profile:${[name, dob, city, source].filter(Boolean).join("|")}`;
  return `fallback:${[name, dob, city, source].filter(Boolean).join("|") || "unknown"}`;
}

export function buildStableClientId(identityKey: string) {
  return `UC-${deterministicContentHash({ identityKey }).slice(0, 24).toUpperCase()}`;
}

export type ParsedInboundLeadRow = {
  fullName: string;
  email: string;
  phone: string;
  city: string;
  serviceInterest?: VastuServiceType;
  source: string;
  statusLabel?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  message: string;
  notes: string;
  csvCreatedDate: string;
};

export type LeadImportDisposition = "CREATE" | "LINK_EXISTING" | "DUPLICATE_IN_FILE" | "REVIEW_REQUIRED" | "INVALID";

export type LeadImportPreviewRow = {
  rowNumber: number;
  disposition: LeadImportDisposition;
  reason: string;
  name: string;
  emailMasked: string;
  phoneMasked: string;
  targetClientId?: string;
  parsed?: ParsedInboundLeadRow;
};

export type LeadImportPreview = {
  schemaVersion: typeof LEAD_IMPORT_SCHEMA_VERSION;
  batchHash: string;
  rows: LeadImportPreviewRow[];
  counts: { total: number; accepted: number; create: number; existingMatch: number; duplicate: number; reviewRequired: number; invalid: number };
  canImport: boolean;
  batchErrors: string[];
};

function safeValue(value: string, label: string, maxLength: number, required = false) {
  const normalized = value.trim();
  if (required && !normalized) return `${label} is required.`;
  if (normalized.length > maxLength) return `${label} is too long.`;
  if (normalized && (UNSAFE_TEXT.test(normalized) || FORMULA_PREFIX.test(normalized))) return `${label} contains unsafe content.`;
  return "";
}

function maskEmail(value: string) {
  if (!value) return "—";
  const [local, domain] = value.split("@");
  return `${local.slice(0, 2)}•••@${domain ?? "private"}`;
}

function maskPhone(value: string) {
  const digits = normalizeLeadPhone(value);
  return digits ? `•••• ${digits.slice(-4)}` : "—";
}

function contactIndex(clients: ClientRecord[], leads: InboundLeadRecord[]) {
  const email = new Map<string, Set<string>>();
  const phone = new Map<string, Set<string>>();
  const add = (map: Map<string, Set<string>>, key: string, clientId: string) => {
    if (!key) return;
    const ids = map.get(key) ?? new Set<string>(); ids.add(clientId); map.set(key, ids);
  };
  for (const client of clients) {
    add(email, normalizeLeadEmail(client.email), client.id);
    add(phone, normalizeLeadPhone(client.phone), client.id);
  }
  for (const lead of leads) {
    const clientId = lead.convertedClientId ?? lead.uniqueClientId;
    add(email, normalizeLeadEmail(lead.email), clientId);
    add(phone, normalizeLeadPhone(lead.phone), clientId);
  }
  return { email, phone };
}

function parseCandidate(headers: Array<(typeof LEAD_IMPORT_TEMPLATE_COLUMNS)[number]>, cells: string[], rowNumber: number) {
  const record = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])) as Record<string, string>;
  const fullName = String(record.full_name ?? "").trim();
  const email = normalizeLeadEmail(String(record.email ?? ""));
  const phone = normalizeLeadPhone(String(record.phone ?? ""));
  const city = String(record.city ?? "").trim();
  const source = String(record.source ?? "").trim() || "CSV import";
  const message = String(record.message ?? "").trim();
  const receivedAt = String(record.received_at ?? "").trim();
  const sourceStatus = String(record.status ?? "").trim();
  const service = String(record.service_interest ?? "").trim();
  const errors = [
    safeValue(fullName, "Full name", 120, true), safeValue(city, "City", 120), safeValue(source, "Source", 120),
    safeValue(message, "Message", 1000), safeValue(String(record.utm_source ?? ""), "UTM source", 200),
    safeValue(String(record.utm_medium ?? ""), "UTM medium", 200), safeValue(String(record.utm_campaign ?? ""), "UTM campaign", 200),
    safeValue(String(record.utm_term ?? ""), "UTM term", 200), safeValue(String(record.utm_content ?? ""), "UTM content", 200)
  ].filter(Boolean);
  if (!email && !phone) errors.push("Email or phone is required.");
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) errors.push("Email is invalid.");
  if (phone && (phone.length < 7 || phone.length > 15)) errors.push("Phone is invalid.");
  if (cells.some((value, index) => FORMULA_PREFIX.test(value.trim())
    && !(headers[index] === "phone" && /^\+\d{7,15}$/.test(value.trim())))) errors.push("Formula-like CSV cells are not allowed.");
  let csvCreatedDate = "";
  if (receivedAt) {
    csvCreatedDate = normalizeCsvDate(receivedAt);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(csvCreatedDate) || Number.isNaN(Date.parse(`${csvCreatedDate}T00:00:00Z`))) errors.push("Received date is invalid.");
  }
  if (errors.length) return { rowNumber, error: errors[0], fullName, email, phone };
  const serviceInterest = service === "EXISTING_SPACE" || service === "NEW_CONSTRUCTION" ? service as VastuServiceType : undefined;
  const reviewReason = sourceStatus && sourceStatus.toUpperCase() !== "NEW"
    ? "The supplied stage is not an approved import default and requires review."
    : service && !serviceInterest ? "The supplied service interest is not an approved value and requires review." : "";
  const parsed: ParsedInboundLeadRow = {
    fullName, email, phone, city, serviceInterest, source, statusLabel: sourceStatus,
    utmSource: String(record.utm_source ?? "").trim(), utmMedium: String(record.utm_medium ?? "").trim(),
    utmCampaign: String(record.utm_campaign ?? "").trim(), utmTerm: String(record.utm_term ?? "").trim(),
    utmContent: String(record.utm_content ?? "").trim(), message, notes: message, csvCreatedDate
  };
  return { rowNumber, parsed, fullName, email, phone, reviewReason };
}

export function buildLeadImportPreview(csvText: string, scope: { clients: ClientRecord[]; leads: InboundLeadRecord[]; organisationId?: string }): LeadImportPreview {
  const batchHash = deterministicContentHash({ schemaVersion: LEAD_IMPORT_SCHEMA_VERSION, csvText });
  const batchErrors: string[] = [];
  if (!csvText.trim()) batchErrors.push("The CSV file is empty.");
  if (csvText.includes("\uFFFD")) batchErrors.push("The CSV must use valid UTF-8 encoding.");
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) batchErrors.push("The CSV must contain a header and at least one data row.");
  if (lines.length - 1 > LEAD_IMPORT_MAX_ROWS) batchErrors.push(`The CSV exceeds the ${LEAD_IMPORT_MAX_ROWS}-row limit.`);
  let headers: Array<(typeof LEAD_IMPORT_TEMPLATE_COLUMNS)[number]> = [];
  if (!batchErrors.length) {
    try {
      const rawHeaders = parseCsvLine(lines[0]);
      const normalized = rawHeaders.map(normalizeHeader);
      if (normalized.some((header) => /dob|dateofbirth|gender|birthtime|birthplace|vehicle|house|rawpayload|assignedto|owner/.test(header))) {
        batchErrors.push("Sensitive or authoritative columns are not permitted in the standard lead import.");
      } else if (normalized.some((header) => !HEADER_ALIASES[header])) {
        batchErrors.push("Unsupported columns are present. Use the Uchit CSV template.");
      } else {
        headers = normalized.map((header) => HEADER_ALIASES[header]);
        if (new Set(headers).size !== headers.length) batchErrors.push("The CSV contains duplicate columns.");
        if (!headers.includes("full_name") || (!headers.includes("email") && !headers.includes("phone"))) {
          batchErrors.push("The CSV requires full_name and at least one email or phone column.");
        }
      }
    } catch (error) { batchErrors.push(error instanceof Error ? error.message : "The CSV header is invalid."); }
  }

  const rows: LeadImportPreviewRow[] = [];
  const existing = contactIndex(scope.clients, scope.leads);
  const batchContacts = new Map<string, string>();
  if (!batchErrors.length) {
    for (let index = 1; index < lines.length; index += 1) {
      const rowNumber = index + 1;
      let cells: string[];
      try { cells = parseCsvLine(lines[index]); }
      catch (error) {
        rows.push({ rowNumber, disposition: "INVALID", reason: error instanceof Error ? error.message : "The row is malformed.", name: `Row ${rowNumber}`, emailMasked: "—", phoneMasked: "—" });
        continue;
      }
      if (cells.length !== headers.length) {
        rows.push({ rowNumber, disposition: "INVALID", reason: "The row does not match the template column count.", name: `Row ${rowNumber}`, emailMasked: "—", phoneMasked: "—" });
        continue;
      }
      const candidate = parseCandidate(headers, cells, rowNumber);
      if ("error" in candidate) {
        rows.push({ rowNumber, disposition: "INVALID", reason: candidate.error ?? "The row is invalid.", name: candidate.fullName || `Row ${rowNumber}`, emailMasked: maskEmail(candidate.email), phoneMasked: maskPhone(candidate.phone) });
        continue;
      }
      if (candidate.reviewReason) {
        rows.push({ rowNumber, disposition: "REVIEW_REQUIRED", reason: candidate.reviewReason, name: candidate.fullName, emailMasked: maskEmail(candidate.email), phoneMasked: maskPhone(candidate.phone), parsed: candidate.parsed });
        continue;
      }
      const matches = new Set<string>();
      for (const id of existing.email.get(candidate.email) ?? []) matches.add(id);
      for (const id of existing.phone.get(candidate.phone) ?? []) matches.add(id);
      const emailBatch = candidate.email ? batchContacts.get(`email:${candidate.email}`) : undefined;
      const phoneBatch = candidate.phone ? batchContacts.get(`phone:${candidate.phone}`) : undefined;
      if (emailBatch) matches.add(emailBatch);
      if (phoneBatch) matches.add(phoneBatch);
      if (matches.size > 1) {
        rows.push({ rowNumber, disposition: "REVIEW_REQUIRED", reason: "Email and phone resolve to different existing identities; automatic merge is blocked.", name: candidate.fullName, emailMasked: maskEmail(candidate.email), phoneMasked: maskPhone(candidate.phone), parsed: candidate.parsed });
        continue;
      }
      const targetClientId = matches.values().next().value as string | undefined;
      const identityKey = buildInboundLeadIdentity(candidate.parsed);
      const stableClientId = targetClientId ?? buildStableClientId(scope.organisationId ? `${scope.organisationId}:${identityKey}` : identityKey);
      const duplicateInFile = Boolean(emailBatch || phoneBatch);
      rows.push({ rowNumber, disposition: duplicateInFile ? "DUPLICATE_IN_FILE" : targetClientId ? "LINK_EXISTING" : "CREATE",
        reason: duplicateInFile ? "Matches an earlier row in this file." : targetClientId ? "Exact identity match will link to the existing permanent client." : "A new permanent Uchit Client ID will be created.",
        name: candidate.fullName, emailMasked: maskEmail(candidate.email), phoneMasked: maskPhone(candidate.phone), targetClientId: stableClientId, parsed: candidate.parsed });
      if (candidate.email) batchContacts.set(`email:${candidate.email}`, stableClientId);
      if (candidate.phone) batchContacts.set(`phone:${candidate.phone}`, stableClientId);
    }
  }
  const count = (disposition: LeadImportDisposition) => rows.filter((row) => row.disposition === disposition).length;
  const counts = { total: rows.length, accepted: count("CREATE") + count("LINK_EXISTING") + count("DUPLICATE_IN_FILE"),
    create: count("CREATE"), existingMatch: count("LINK_EXISTING"), duplicate: count("DUPLICATE_IN_FILE"),
    reviewRequired: count("REVIEW_REQUIRED"), invalid: count("INVALID") };
  return { schemaVersion: LEAD_IMPORT_SCHEMA_VERSION, batchHash, rows, counts,
    canImport: batchErrors.length === 0 && counts.invalid === 0 && counts.accepted > 0, batchErrors };
}

export function publicLeadImportPreview(preview: LeadImportPreview) {
  return { ...preview, rows: preview.rows.map(({ parsed: _parsed, targetClientId: _targetClientId, ...row }) => row) };
}

/** Backward-compatible parser entry point; protected routes must preview before calling it. */
export function parseInboundLeadCsv(csvText: string): ParsedInboundLeadRow[] {
  const preview = buildLeadImportPreview(csvText, { clients: [], leads: [] });
  if (preview.batchErrors.length || preview.counts.invalid || preview.counts.reviewRequired) {
    throw new Error(preview.batchErrors[0] ?? preview.rows.find((row) => row.disposition === "INVALID" || row.disposition === "REVIEW_REQUIRED")?.reason ?? "CSV validation failed.");
  }
  return preview.rows.flatMap((row) => row.parsed ? [row.parsed] : []);
}

export function toInboundLeadRecord(input: ParsedInboundLeadRow, index: number): InboundLeadRecord {
  const identityKey = buildInboundLeadIdentity(input);
  const uniqueClientId = buildStableClientId(identityKey);
  const now = new Date().toISOString();
  return { id: `inbound_${crypto.randomUUID()}_${index}`, uniqueClientId, identityKey, fullName: input.fullName,
    email: normalizeLeadEmail(input.email), phone: normalizeLeadPhone(input.phone), city: input.city,
    serviceInterest: input.serviceInterest, source: input.source, statusLabel: input.statusLabel,
    utmSource: input.utmSource, utmMedium: input.utmMedium, utmCampaign: input.utmCampaign, utmTerm: input.utmTerm,
    utmContent: input.utmContent, score: 60, message: input.message, notes: input.notes, status: "NEW", importedAt: now,
    firstSeenAt: input.csvCreatedDate || now.slice(0, 10), lastSeenAt: input.csvCreatedDate || now.slice(0, 10),
    submissionCount: 1, duplicateCount: 0, isReturningLead: false, sourceSystem: "CSV_IMPORT", syncStatus: "APPLIED", recordVersion: 1 };
}
