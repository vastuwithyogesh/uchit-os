import type { ClientRecord, InboundLeadRecord, LeadSourceProfile, VastuServiceType } from "@/lib/domain";
import { deterministicContentHash } from "./evaluation-provenance.ts";

export const LEAD_IMPORT_SCHEMA_VERSION = "uchit-lead-import/v1.1" as const;
export const LEAD_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const LEAD_IMPORT_MAX_ROWS = 1000;

export const LEAD_IMPORT_TEMPLATE_COLUMNS = [
  "id", "name", "email", "phone", "dob", "city", "created_at", "status", "notes", "source",
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "landing_page", "referrer",
  "assigned_to", "deleted_at", "property_stage", "submission_count", "last_submitted_at", "client_code"
] as const;

export const LEAD_IMPORT_MINIMAL_TEMPLATE_COLUMNS = [
  "full_name", "email", "phone", "city", "service_interest", "source", "received_at", "message",
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "status"
] as const;

export const LEAD_IMPORT_TEMPLATE = `${LEAD_IMPORT_TEMPLATE_COLUMNS.join(",")}\n`;
export const LEAD_IMPORT_MINIMAL_TEMPLATE = `${LEAD_IMPORT_MINIMAL_TEMPLATE_COLUMNS.join(",")}\n`;
export const VASTU_WITH_YOGESH_FORMAT = "VASTU_WITH_YOGESH_APPLY_LEADS" as const;
export const UCHIT_MINIMAL_FORMAT = "UCHIT_MINIMAL" as const;
export const LEAD_IMPORT_FORMAT_LABELS = {
  [VASTU_WITH_YOGESH_FORMAT]: "Vastu With Yogesh Apply Leads",
  [UCHIT_MINIMAL_FORMAT]: "Uchit minimal template"
} as const;

type ApplyHeader = (typeof LEAD_IMPORT_TEMPLATE_COLUMNS)[number];
type MinimalHeader = (typeof LEAD_IMPORT_MINIMAL_TEMPLATE_COLUMNS)[number];
type ImportFormat = typeof VASTU_WITH_YOGESH_FORMAT | typeof UCHIT_MINIMAL_FORMAT;
type DetectedFormat = { format: ImportFormat; headers: ApplyHeader[] | MinimalHeader[]; columns: readonly string[] };
type FormatError = { error: string };
type ParsedCandidate = { rowNumber: number; fullName: string; email: string; phone: string; reviewReason: string; parsed: ParsedInboundLeadRow; isSourceTombstone?: boolean };
type InvalidCandidate = { rowNumber: number; fullName: string; email: string; phone: string; error: string };

const MINIMAL_HEADER_ALIASES: Record<string, MinimalHeader> = {
  fullname: "full_name", name: "full_name", email: "email", phone: "phone", mobile: "phone", city: "city",
  serviceinterest: "service_interest", source: "source", receivedat: "received_at", createdat: "received_at",
  message: "message", notes: "message", utmsource: "utm_source", utmmedium: "utm_medium",
  utmcampaign: "utm_campaign", utmterm: "utm_term", utmcontent: "utm_content", status: "status"
};

const FORMULA_PREFIX = /^[=+\-@]/;
const UNSAFE_TEXT = /[<>\u0000-\u001f\u007f]/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const MAX_SOURCE_TELEMETRY = 1_000_000;

function parseCsv(csvText: string) {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index];
    const next = csvText[index + 1];
    if (character === '"') {
      if (quoted && next === '"') { field += '"'; index += 1; }
      else quoted = !quoted;
      continue;
    }
    if (character === "," && !quoted) { record.push(field.trim()); field = ""; continue; }
    if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      record.push(field.trim()); field = "";
      if (record.some((value) => value.length > 0)) records.push(record);
      record = [];
      continue;
    }
    field += character;
  }
  if (quoted) throw new Error("The CSV contains an unterminated quoted field.");
  record.push(field.trim());
  if (record.some((value) => value.length > 0)) records.push(record);
  return records;
}

function normalizeHeader(value: string) {
  return value.replace(/^\uFEFF/, "").trim().toLowerCase();
}

function compactHeader(value: string) {
  return normalizeHeader(value).replace(/\s+/g, "").replace(/[_-]/g, "");
}

export function normalizeLeadEmail(email: string) {
  return email.trim().toLowerCase();
}

export function normalizeLeadPhone(phone: string) {
  return phone.replace(/\D/g, "");
}

export function normalizeIndianSourcePhone(phone: string) {
  const raw = phone.trim();
  if (!raw) return { canonical: "", valid: false, reviewRequired: false };
  const compact = raw.replace(/[\s().-]/g, "");
  if (compact.startsWith("+") && /^\+[1-9]\d{6,14}$/.test(compact)) {
    return { canonical: compact, valid: true, reviewRequired: false };
  }
  if (/^\d{10}$/.test(compact)) return { canonical: `+91${compact}`, valid: true, reviewRequired: false };
  return { canonical: "", valid: false, reviewRequired: /^\d+$/.test(compact) };
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
  sourceRecordId?: string;
  externalClientCode?: string;
  sourceProfile?: LeadSourceProfile;
};

export type LeadImportDisposition = "CREATE" | "LINK_EXISTING" | "DUPLICATE_IN_FILE" | "REVIEW_REQUIRED" | "INVALID";

export type LeadImportPreviewRow = {
  rowNumber: number;
  disposition: LeadImportDisposition;
  reason: string;
  name: string;
  emailMasked: string;
  phoneMasked: string;
  isSourceTombstone?: boolean;
  targetClientId?: string;
  parsed?: ParsedInboundLeadRow;
};

export type LeadImportPreview = {
  schemaVersion: typeof LEAD_IMPORT_SCHEMA_VERSION;
  format: ImportFormat;
  formatLabel: (typeof LEAD_IMPORT_FORMAT_LABELS)[ImportFormat];
  columns: readonly string[];
  batchHash: string;
  rows: LeadImportPreviewRow[];
  counts: { total: number; accepted: number; create: number; existingMatch: number; duplicate: number; reviewRequired: number; invalid: number; sourceTombstone: number };
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

function validIso(value: string) {
  return ISO_TIMESTAMP_PATTERN.test(value) && !Number.isNaN(Date.parse(value));
}

function safeUrl(value: string, label: string, allowRelative: boolean) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length > 2048 || UNSAFE_TEXT.test(trimmed) || FORMULA_PREFIX.test(trimmed)) return `${label} is invalid.`;
  if (allowRelative && /^\/(?!\/)[^\u0000-\u001f]*$/.test(trimmed)) return "";
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? "" : `${label} must use http(s).`;
  } catch { return `${label} is invalid.`; }
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
  const sourceRecordId = new Map<string, Set<string>>();
  const externalClientCode = new Map<string, Set<string>>();
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
    add(sourceRecordId, lead.sourceRecordId ?? "", clientId);
    add(externalClientCode, lead.externalClientCode ?? "", clientId);
  }
  return { email, phone, sourceRecordId, externalClientCode };
}

function detectFormat(rawHeaders: string[]): DetectedFormat | FormatError {
  const exact = rawHeaders.map(normalizeHeader);
  const applySet = new Set<string>(LEAD_IMPORT_TEMPLATE_COLUMNS);
  if (exact.length === LEAD_IMPORT_TEMPLATE_COLUMNS.length && exact.every((header) => applySet.has(header))) {
    if (new Set(exact).size !== exact.length) return { error: "The CSV contains duplicate columns." } as const;
    return { format: VASTU_WITH_YOGESH_FORMAT, headers: exact as ApplyHeader[], columns: LEAD_IMPORT_TEMPLATE_COLUMNS } as const;
  }
  const compact = rawHeaders.map(compactHeader);
  if (compact.every((header) => MINIMAL_HEADER_ALIASES[header])) {
    const headers = compact.map((header) => MINIMAL_HEADER_ALIASES[header]);
    if (new Set(headers).size !== headers.length) return { error: "The CSV contains duplicate columns." } as const;
    if (!headers.includes("full_name") || (!headers.includes("email") && !headers.includes("phone"))) {
      return { error: "The Uchit minimal CSV requires full_name and at least one email or phone column." } as const;
    }
    return { format: UCHIT_MINIMAL_FORMAT, headers, columns: LEAD_IMPORT_MINIMAL_TEMPLATE_COLUMNS } as const;
  }
  const missing = LEAD_IMPORT_TEMPLATE_COLUMNS.filter((header) => !exact.includes(header));
  const extra = exact.filter((header) => !applySet.has(header));
  const detail = [missing.length ? `Missing: ${missing.join(", ")}.` : "", extra.length ? `Unsupported: ${extra.join(", ")}.` : ""].filter(Boolean).join(" ");
  return { error: `The CSV schema does not match Vastu With Yogesh Apply Leads. ${detail}`.trim() } as const;
}

function parseMinimalCandidate(headers: MinimalHeader[], cells: string[], rowNumber: number): ParsedCandidate | InvalidCandidate {
  const record = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])) as Record<MinimalHeader, string>;
  const fullName = String(record.full_name ?? "").trim();
  const email = normalizeLeadEmail(String(record.email ?? ""));
  const rawPhone = String(record.phone ?? "");
  const phoneResult = normalizeIndianSourcePhone(rawPhone);
  const phone = phoneResult.valid ? phoneResult.canonical : normalizeLeadPhone(rawPhone);
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
  if (email && (!EMAIL_PATTERN.test(email) || email.length > 254)) errors.push("Email is invalid.");
  if (rawPhone && (!phone || phone.length < 7 || phone.length > 16)) errors.push("Phone is invalid.");
  if (cells.some((value, index) => FORMULA_PREFIX.test(value.trim())
    && !(headers[index] === "phone" && /^\+[1-9]\d{6,14}$/.test(value.trim().replace(/[\s().-]/g, ""))))) errors.push("Formula-like CSV cells are not allowed.");
  let csvCreatedDate = "";
  if (receivedAt) {
    csvCreatedDate = normalizeCsvDate(receivedAt);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(csvCreatedDate) || Number.isNaN(Date.parse(`${csvCreatedDate}T00:00:00Z`))) errors.push("Received date is invalid.");
  }
  if (errors.length) return { rowNumber, error: errors[0]!, fullName, email, phone };
  const serviceInterest = service === "EXISTING_SPACE" || service === "NEW_CONSTRUCTION" ? service as VastuServiceType : undefined;
  const reviewReason = sourceStatus && sourceStatus.toUpperCase() !== "NEW"
    ? "The supplied stage is not an approved import default and requires review."
    : service && !serviceInterest ? "The supplied service interest is not an approved value and requires review." : "";
  return { rowNumber, fullName, email, phone, reviewReason, parsed: {
    fullName, email, phone, city, serviceInterest, source, statusLabel: sourceStatus,
    utmSource: String(record.utm_source ?? "").trim(), utmMedium: String(record.utm_medium ?? "").trim(),
    utmCampaign: String(record.utm_campaign ?? "").trim(), utmTerm: String(record.utm_term ?? "").trim(),
    utmContent: String(record.utm_content ?? "").trim(), message, notes: message, csvCreatedDate
  } satisfies ParsedInboundLeadRow };
}

function parseApplyCandidate(headers: ApplyHeader[], cells: string[], rowNumber: number): ParsedCandidate | InvalidCandidate {
  const record = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])) as Record<ApplyHeader, string>;
  const fullName = record.name.trim();
  const email = normalizeLeadEmail(record.email);
  const rawPhone = record.phone.trim();
  const phoneResult = normalizeIndianSourcePhone(rawPhone);
  const phone = phoneResult.canonical;
  const sourceStatus = record.status.trim().toLowerCase();
  const propertyStage = record.property_stage.trim().toLowerCase();
  const submissionCount = Number(record.submission_count);
  const errors = [
    safeValue(record.id, "Source ID", 256, true), safeValue(record.client_code, "External client code", 160, true),
    safeValue(fullName, "Name", 120, true), safeValue(record.city, "City", 160), safeValue(record.source, "Source", 160),
    safeValue(record.notes, "Source note", 2000), safeValue(record.assigned_to, "Source assignment", 200),
    safeValue(record.utm_source, "UTM source", 200), safeValue(record.utm_medium, "UTM medium", 200),
    safeValue(record.utm_campaign, "UTM campaign", 300), safeValue(record.utm_term, "UTM term", 300),
    safeValue(record.utm_content, "UTM content", 500), safeUrl(record.landing_page, "Landing page", true),
    safeUrl(record.referrer, "Referrer", false)
  ].filter(Boolean);
  if (!email && !phone) errors.push("At least one valid email or phone is required.");
  if (email && (!EMAIL_PATTERN.test(email) || email.length > 254)) errors.push("Email is invalid.");
  if (rawPhone && !phoneResult.valid && !email) errors.push("Phone is invalid and no valid email is available.");
  if (!validIso(record.created_at)) errors.push("Created timestamp must be ISO 8601.");
  if (!validIso(record.last_submitted_at)) errors.push("Last submitted timestamp must be ISO 8601.");
  if (record.dob && (!/^\d{4}-\d{2}-\d{2}$/.test(record.dob) || Number.isNaN(Date.parse(`${record.dob}T00:00:00Z`)))) errors.push("Date of birth is invalid.");
  if (record.deleted_at && !validIso(record.deleted_at)) errors.push("Source deleted timestamp must be ISO 8601.");
  if (!Number.isSafeInteger(submissionCount) || submissionCount < 1 || submissionCount > MAX_SOURCE_TELEMETRY) errors.push("Submission count must be a bounded positive integer.");
  if (!sourceStatus) errors.push("Source status is required.");
  if (propertyStage && propertyStage !== "new" && propertyStage !== "existing") errors.push("Property stage must be new, existing or blank.");
  if (cells.some((value, index) => FORMULA_PREFIX.test(value.trim())
    && !(headers[index] === "phone" && /^\+[1-9][\d\s().-]{6,20}$/.test(value.trim())))) errors.push("Formula-like CSV cells are not allowed.");
  if (errors.length) return { rowNumber, error: errors[0]!, fullName, email, phone };

  const reviewReasons: string[] = [];
  if (sourceStatus === "lost") reviewReasons.push("Source status lost has no approved disqualification reason and requires review.");
  else if (sourceStatus !== "new") reviewReasons.push("The source status is not mapped to an automatic canonical transition.");
  if (rawPhone && phoneResult.reviewRequired) reviewReasons.push("The source phone is not an approved Indian 10-digit or explicit E.164 value.");
  const sourceProfile: LeadSourceProfile = {
    format: VASTU_WITH_YOGESH_FORMAT, sourceRowHash: deterministicContentHash({ headers, cells }), rawPhone,
    dob: record.dob || undefined, sourceAssignedTo: record.assigned_to || undefined,
    sourceDeletedAt: record.deleted_at || undefined, propertyStage: propertyStage ? propertyStage as "new" | "existing" : undefined,
    sourceCreatedAt: record.created_at, sourceLastSubmittedAt: record.last_submitted_at, sourceSubmissionCount: submissionCount,
    landingPage: record.landing_page || undefined, referrer: record.referrer || undefined,
    sourceNote: record.notes || undefined
  };
  return { rowNumber, fullName, email, phone, reviewReason: reviewReasons.join(" "), isSourceTombstone: Boolean(record.deleted_at), parsed: {
    fullName, email, phone, city: record.city, source: record.source || "Vastu With Yogesh", statusLabel: sourceStatus,
    utmSource: record.utm_source, utmMedium: record.utm_medium, utmCampaign: record.utm_campaign,
    utmTerm: record.utm_term, utmContent: record.utm_content, message: record.notes, notes: record.notes,
    csvCreatedDate: record.created_at, sourceRecordId: record.id, externalClientCode: record.client_code, sourceProfile
  } satisfies ParsedInboundLeadRow };
}

export function buildLeadImportPreview(csvText: string, scope: { clients: ClientRecord[]; leads: InboundLeadRecord[]; organisationId?: string }): LeadImportPreview {
  const batchHash = deterministicContentHash({ schemaVersion: LEAD_IMPORT_SCHEMA_VERSION, csvText });
  const batchErrors: string[] = [];
  if (!csvText.trim()) batchErrors.push("The CSV file is empty.");
  if (csvText.includes("\uFFFD")) batchErrors.push("The CSV must use valid UTF-8 encoding.");
  let records: string[][] = [];
  try { records = parseCsv(csvText); }
  catch (error) { batchErrors.push(error instanceof Error ? error.message : "The CSV is malformed."); }
  if (records.length < 2) batchErrors.push("The CSV must contain a header and at least one data row.");
  if (records.length - 1 > LEAD_IMPORT_MAX_ROWS) batchErrors.push(`The CSV exceeds the ${LEAD_IMPORT_MAX_ROWS}-row limit.`);
  const detected: DetectedFormat | FormatError = records[0] ? detectFormat(records[0]) : { error: "The CSV header is missing." };
  if ("error" in detected) batchErrors.push(detected.error);
  const format: ImportFormat = "format" in detected ? detected.format : VASTU_WITH_YOGESH_FORMAT;
  const columns: readonly string[] = "columns" in detected ? detected.columns : LEAD_IMPORT_TEMPLATE_COLUMNS;
  const rows: LeadImportPreviewRow[] = [];
  const existing = contactIndex(scope.clients, scope.leads);
  const batchContacts = new Map<string, string>();
  const batchSourceIds = new Set<string>();
  const batchClientCodes = new Set<string>();

  if (!batchErrors.length && "headers" in detected) {
    for (let index = 1; index < records.length; index += 1) {
      const rowNumber = index + 1;
      const cells = records[index];
      if (cells.length !== detected.headers.length) {
        rows.push({ rowNumber, disposition: "INVALID", reason: "The row does not match the detected template column count.", name: `Row ${rowNumber}`, emailMasked: "—", phoneMasked: "—" });
        continue;
      }
      const candidate = detected.format === VASTU_WITH_YOGESH_FORMAT
        ? parseApplyCandidate(detected.headers as ApplyHeader[], cells, rowNumber)
        : parseMinimalCandidate(detected.headers as MinimalHeader[], cells, rowNumber);
      if ("error" in candidate) {
        rows.push({ rowNumber, disposition: "INVALID", reason: candidate.error ?? "The row is invalid.", name: candidate.fullName || `Row ${rowNumber}`, emailMasked: maskEmail(candidate.email), phoneMasked: maskPhone(candidate.phone) });
        continue;
      }
      const sourceRecordId = candidate.parsed.sourceRecordId;
      const externalClientCode = candidate.parsed.externalClientCode;
      if ((sourceRecordId && batchSourceIds.has(sourceRecordId)) || (externalClientCode && batchClientCodes.has(externalClientCode))) {
        rows.push({ rowNumber, disposition: "INVALID", reason: "Source ID or external client code is duplicated in this file.", name: candidate.fullName, emailMasked: maskEmail(candidate.email), phoneMasked: maskPhone(candidate.phone), isSourceTombstone: candidate.isSourceTombstone });
        continue;
      }
      if (sourceRecordId) batchSourceIds.add(sourceRecordId);
      if (externalClientCode) batchClientCodes.add(externalClientCode);
      if (candidate.reviewReason) {
        rows.push({ rowNumber, disposition: "REVIEW_REQUIRED", reason: candidate.reviewReason, name: candidate.fullName, emailMasked: maskEmail(candidate.email), phoneMasked: maskPhone(candidate.phone), parsed: candidate.parsed, isSourceTombstone: candidate.isSourceTombstone });
        continue;
      }

      const matches = new Set<string>();
      for (const id of existing.email.get(candidate.email) ?? []) matches.add(id);
      for (const id of existing.phone.get(normalizeLeadPhone(candidate.phone)) ?? []) matches.add(id);
      for (const id of existing.sourceRecordId.get(sourceRecordId ?? "") ?? []) matches.add(id);
      for (const id of existing.externalClientCode.get(externalClientCode ?? "") ?? []) matches.add(id);
      const emailBatch = candidate.email ? batchContacts.get(`email:${candidate.email}`) : undefined;
      const phoneBatch = candidate.phone ? batchContacts.get(`phone:${normalizeLeadPhone(candidate.phone)}`) : undefined;
      if (emailBatch) matches.add(emailBatch);
      if (phoneBatch) matches.add(phoneBatch);
      if (matches.size > 1) {
        rows.push({ rowNumber, disposition: "REVIEW_REQUIRED", reason: "Identity or immutable source references resolve to different clients; automatic merge is blocked.", name: candidate.fullName, emailMasked: maskEmail(candidate.email), phoneMasked: maskPhone(candidate.phone), parsed: candidate.parsed, isSourceTombstone: candidate.isSourceTombstone });
        continue;
      }
      const targetClientId = matches.values().next().value as string | undefined;
      const identityKey = buildInboundLeadIdentity(candidate.parsed);
      const stableClientId = targetClientId ?? buildStableClientId(scope.organisationId ? `${scope.organisationId}:${identityKey}` : identityKey);
      const duplicateInFile = Boolean(emailBatch || phoneBatch);
      rows.push({ rowNumber, disposition: duplicateInFile ? "DUPLICATE_IN_FILE" : targetClientId ? "LINK_EXISTING" : "CREATE",
        reason: duplicateInFile ? "Matches an earlier row in this file." : targetClientId ? "Exact identity or immutable source reference will link to the existing permanent client." : "A new permanent Uchit Client ID will be created.",
        name: candidate.fullName, emailMasked: maskEmail(candidate.email), phoneMasked: maskPhone(candidate.phone), targetClientId: stableClientId, parsed: candidate.parsed, isSourceTombstone: candidate.isSourceTombstone });
      if (candidate.email) batchContacts.set(`email:${candidate.email}`, stableClientId);
      if (candidate.phone) batchContacts.set(`phone:${normalizeLeadPhone(candidate.phone)}`, stableClientId);
    }
  }
  const count = (disposition: LeadImportDisposition) => rows.filter((row) => row.disposition === disposition).length;
  const counts = { total: rows.length, accepted: count("CREATE") + count("LINK_EXISTING") + count("DUPLICATE_IN_FILE"),
    create: count("CREATE"), existingMatch: count("LINK_EXISTING"), duplicate: count("DUPLICATE_IN_FILE"),
    reviewRequired: count("REVIEW_REQUIRED"), invalid: count("INVALID"), sourceTombstone: rows.filter((row) => row.isSourceTombstone).length };
  return { schemaVersion: LEAD_IMPORT_SCHEMA_VERSION, format, formatLabel: LEAD_IMPORT_FORMAT_LABELS[format], columns,
    batchHash, rows, counts, canImport: batchErrors.length === 0 && counts.invalid === 0 && counts.accepted > 0, batchErrors };
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
  const firstSeenAt = input.sourceProfile?.sourceCreatedAt ?? (input.csvCreatedDate || now);
  const lastSeenAt = input.sourceProfile?.sourceLastSubmittedAt ?? (input.csvCreatedDate || now);
  return { id: `inbound_${crypto.randomUUID()}_${index}`, uniqueClientId, identityKey, fullName: input.fullName,
    email: normalizeLeadEmail(input.email), phone: input.phone, city: input.city,
    serviceInterest: input.serviceInterest, source: input.source, statusLabel: input.statusLabel,
    utmSource: input.utmSource, utmMedium: input.utmMedium, utmCampaign: input.utmCampaign, utmTerm: input.utmTerm,
    utmContent: input.utmContent, score: 60, message: input.message, notes: input.notes, status: "NEW", importedAt: now,
    firstSeenAt, lastSeenAt, submissionCount: input.sourceProfile?.sourceSubmissionCount ?? 1, duplicateCount: 0,
    isReturningLead: (input.sourceProfile?.sourceSubmissionCount ?? 1) > 1, sourceSystem: input.sourceProfile ? "LOVABLE_CSV_IMPORT" : "CSV_IMPORT",
    sourceRecordType: input.sourceProfile ? "APPLICATION" : undefined, sourceRecordId: input.sourceRecordId,
    externalClientCode: input.externalClientCode, sourceProfile: input.sourceProfile, syncStatus: "APPLIED", recordVersion: 1 };
}
