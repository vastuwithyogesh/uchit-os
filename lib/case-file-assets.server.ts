import type { AppUser, VastuServiceType } from "@/lib/domain";
import { migrateD1 } from "@/db/migrations";
import { getRuntimeEnv } from "@/lib/runtime-env";

const MAX_CASE_FILE_BYTES = 20 * 1024 * 1024;
const ALLOWED_CASE_FILE_MIME_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);

type CaseFileScope = { organisationId: string; caseId: string; caseRevisionNumber: number; serviceType: VastuServiceType; floorLabel?: string };
type CaseFileRow = Record<string, unknown>;

function safeDisplayName(value: string) {
  const name = value.replace(/[\u0000-\u001f\u007f"\\/]/g, "_").trim().slice(0, 255);
  return name || "case-document";
}

function detectedMime(bytes: Uint8Array) {
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP") return "image/webp";
  if (bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-") return "application/pdf";
  return null;
}

function hasPolyglotMarker(bytes: Uint8Array, mime: string) {
  const text = new TextDecoder("latin1").decode(bytes);
  if (text.startsWith("MZ") || text.includes("PK\u0003\u0004") || /<script|<!doctype\s+html|javascript:/i.test(text)) return true;
  if (mime === "application/pdf") {
    if (/\/(?:JavaScript|JS)\b/.test(text)) return true;
    const eof = text.lastIndexOf("%%EOF");
    return eof < 0 || text.slice(eof + 5).trim().length > 0;
  }
  return false;
}

async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function publicMetadata(row: CaseFileRow) {
  return { id: String(row.id), evidenceRef: String(row.evidence_ref), caseId: String(row.case_id), caseRevisionNumber: Number(row.case_revision_number), serviceType: String(row.service_type), floorLabel: row.floor_label ? String(row.floor_label) : undefined, fileName: String(row.original_file_name), mimeType: String(row.mime_type), sizeBytes: Number(row.size_bytes), createdAt: String(row.created_at), status: "IMMUTABLE" as const };
}

export async function saveCaseFileUpload(file: File, scope: CaseFileScope, uploader: AppUser) {
  const { DB, R2 } = getRuntimeEnv();
  if (!DB || !R2) throw new Error("Protected case-file storage is not configured.");
  if (!ALLOWED_CASE_FILE_MIME_TYPES.has(file.type)) throw new Error("Only PDF, PNG, JPEG, or WebP case files are allowed.");
  if (file.size < 1 || file.size > MAX_CASE_FILE_BYTES) throw new Error("Case file must be between 1 byte and 20 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = detectedMime(bytes);
  if (detected !== file.type || hasPolyglotMarker(bytes, file.type)) throw new Error("Case file content is unsupported, polyglot, or does not match its declared type.");
  await migrateD1(DB);
  const checksum = await sha256Hex(bytes);
  const duplicate = await DB.prepare("SELECT id, evidence_ref, case_id, case_revision_number, service_type, floor_label, original_file_name, mime_type, size_bytes, created_at, status FROM case_file_assets WHERE organisation_id = ? AND case_id = ? AND case_revision_number = ? AND service_type = ? AND COALESCE(floor_label, '') = ? AND checksum_sha256 = ? AND status = 'IMMUTABLE'")
    .bind(scope.organisationId, scope.caseId, scope.caseRevisionNumber, scope.serviceType, scope.floorLabel ?? "", checksum).first<CaseFileRow>();
  if (duplicate) return publicMetadata(duplicate);
  const id = crypto.randomUUID();
  const evidenceRef = `case-file-${id}`;
  const objectKey = `organisations/${scope.organisationId}/case-files/${id}`;
  const createdAt = new Date().toISOString();
  const fileName = safeDisplayName(file.name);
  await R2.put(objectKey, bytes, { httpMetadata: { contentType: file.type }, customMetadata: { checksumSha256: checksum, immutable: "true" } });
  try {
    await DB.prepare(`INSERT INTO case_file_assets
      (id, evidence_ref, organisation_id, case_id, case_revision_number, service_type, floor_label, object_key, original_file_name,
       mime_type, size_bytes, checksum_sha256, uploaded_by_id, uploaded_by_name, uploaded_by_role, created_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'IMMUTABLE')`)
      .bind(id, evidenceRef, scope.organisationId, scope.caseId, scope.caseRevisionNumber, scope.serviceType, scope.floorLabel ?? null, objectKey, fileName, file.type, bytes.byteLength, checksum, uploader.id, uploader.fullName, uploader.role, createdAt).run();
  } catch (error) {
    await R2.delete(objectKey);
    throw error;
  }
  return { id, evidenceRef, caseId: scope.caseId, caseRevisionNumber: scope.caseRevisionNumber, serviceType: scope.serviceType, floorLabel: scope.floorLabel, fileName, mimeType: file.type, sizeBytes: bytes.byteLength, createdAt, status: "IMMUTABLE" as const };
}

export async function listCaseFiles(scope: CaseFileScope) {
  const { DB, R2 } = getRuntimeEnv();
  if (!DB || !R2) throw new Error("Protected case-file storage is not configured.");
  await migrateD1(DB);
  const result = await DB.prepare("SELECT id, evidence_ref, case_id, case_revision_number, service_type, floor_label, original_file_name, mime_type, size_bytes, created_at, status FROM case_file_assets WHERE organisation_id = ? AND case_id = ? AND case_revision_number = ? AND service_type = ? AND COALESCE(floor_label, '') = ? ORDER BY created_at DESC")
    .bind(scope.organisationId, scope.caseId, scope.caseRevisionNumber, scope.serviceType, scope.floorLabel ?? "").all<CaseFileRow>();
  return (result.results ?? []).map(publicMetadata);
}

export async function assertCaseFileEvidenceScope(evidenceRef: string, scope: CaseFileScope) {
  const { DB, R2 } = getRuntimeEnv();
  if (!DB || !R2) throw new Error("Protected case-file storage is not configured.");
  await migrateD1(DB);
  const row = await DB.prepare("SELECT id FROM case_file_assets WHERE evidence_ref = ? AND organisation_id = ? AND case_id = ? AND case_revision_number = ? AND service_type = ? AND COALESCE(floor_label, '') = ? AND status = 'IMMUTABLE'")
    .bind(evidenceRef, scope.organisationId, scope.caseId, scope.caseRevisionNumber, scope.serviceType, scope.floorLabel ?? "").first<{ id: string }>();
  if (!row) throw new Error("Evidence reference does not resolve to an immutable file in this case revision and floor.");
}

export async function resolveCaseFileEvidenceAuthority(evidenceRef: string, scope: CaseFileScope) {
  const { DB, R2 } = getRuntimeEnv();
  if (!DB || !R2) throw new Error("Protected case-file storage is not configured.");
  await migrateD1(DB);
  const row = await DB.prepare(`SELECT id, evidence_ref, object_key, original_file_name, mime_type, size_bytes, checksum_sha256
    FROM case_file_assets WHERE evidence_ref=? AND organisation_id=? AND case_id=? AND case_revision_number=?
    AND service_type=? AND COALESCE(floor_label,'')=? AND status='IMMUTABLE'`)
    .bind(evidenceRef, scope.organisationId, scope.caseId, scope.caseRevisionNumber, scope.serviceType, scope.floorLabel ?? "")
    .first<{ id: string; evidence_ref: string; object_key: string; original_file_name: string; mime_type: string; size_bytes: number; checksum_sha256: string }>();
  if (!row) throw new Error("Evidence reference does not resolve to an immutable file in this exact scope.");
  const object = await R2.get(row.object_key);
  if (!object) throw new Error("Protected evidence bytes are unavailable from private storage.");
  const bytes = await streamBytes(object.body);
  const checksum = await sha256Hex(bytes);
  if (bytes.length !== Number(row.size_bytes) || checksum !== row.checksum_sha256) throw new Error("Protected evidence failed its immutable checksum verification.");
  return { artifactId: row.id, evidenceRef: row.evidence_ref, fileName: safeDisplayName(row.original_file_name), mimeType: row.mime_type, sizeBytes: bytes.length, checksumSha256: checksum };
}

export async function assertCaseFileEvidenceRefs(evidenceRefs: readonly string[], scope: Omit<CaseFileScope, "floorLabel">) {
  const { DB, R2 } = getRuntimeEnv();
  if (!DB || !R2) throw new Error("Protected case-file storage is not configured.");
  await migrateD1(DB);
  for (const evidenceRef of evidenceRefs) {
    const row = await DB.prepare("SELECT id FROM case_file_assets WHERE evidence_ref = ? AND organisation_id = ? AND case_id = ? AND case_revision_number = ? AND service_type = ? AND status = 'IMMUTABLE'")
      .bind(evidenceRef, scope.organisationId, scope.caseId, scope.caseRevisionNumber, scope.serviceType).first<{ id: string }>();
    if (!row) throw new Error("Evidence reference does not resolve to an immutable file in this case revision.");
  }
}

export async function readCaseFile(assetId: string, scope: CaseFileScope) {
  const { DB, R2 } = getRuntimeEnv();
  if (!DB || !R2 || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(assetId)) return null;
  await migrateD1(DB);
  const row = await DB.prepare("SELECT object_key, original_file_name, mime_type FROM case_file_assets WHERE id = ? AND organisation_id = ? AND case_id = ? AND case_revision_number = ? AND service_type = ? AND COALESCE(floor_label, '') = ? AND status = 'IMMUTABLE'")
    .bind(assetId, scope.organisationId, scope.caseId, scope.caseRevisionNumber, scope.serviceType, scope.floorLabel ?? "").first<{ object_key: string; original_file_name: string; mime_type: string }>();
  if (!row) return null;
  const object = await R2.get(row.object_key);
  return object ? { object, fileName: safeDisplayName(row.original_file_name), mimeType: row.mime_type } : null;
}

async function streamBytes(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const result = await reader.read(); if (result.done) break;
    chunks.push(result.value); size += result.value.length;
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

/** Server-only evidence resolver for immutable report generation. */
export async function readCaseFileEvidenceForReport(evidenceRef: string, scope: CaseFileScope) {
  const { DB, R2 } = getRuntimeEnv();
  if (!DB || !R2) throw new Error("Protected case-file storage is not configured.");
  await migrateD1(DB);
  const row = await DB.prepare(`SELECT object_key, original_file_name, mime_type, size_bytes, checksum_sha256
    FROM case_file_assets WHERE evidence_ref=? AND organisation_id=? AND case_id=? AND case_revision_number=?
    AND service_type=? AND COALESCE(floor_label,'')=? AND status='IMMUTABLE'`)
    .bind(evidenceRef, scope.organisationId, scope.caseId, scope.caseRevisionNumber, scope.serviceType, scope.floorLabel ?? "")
    .first<{ object_key: string; original_file_name: string; mime_type: string; size_bytes: number; checksum_sha256: string }>();
  if (!row) throw new Error("Mandatory report evidence does not resolve inside this exact organisation, case revision, and floor.");
  const object = await R2.get(row.object_key);
  if (!object) throw new Error("Mandatory report evidence bytes are unavailable from private storage.");
  const bytes = await streamBytes(object.body);
  const checksum = await sha256Hex(bytes);
  if (bytes.length !== Number(row.size_bytes) || checksum !== row.checksum_sha256) throw new Error("Mandatory report evidence failed its immutable checksum verification.");
  return { bytes, fileName: safeDisplayName(row.original_file_name), mimeType: row.mime_type, checksumSha256: checksum };
}
