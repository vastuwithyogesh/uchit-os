import type { AppUser } from "@/lib/domain";
import { migrateD1 } from "@/db/migrations";
import { getRuntimeEnv } from "@/lib/runtime-env";

const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);
const CLASSIFICATION = "QUALIFICATION_QUESTIONNAIRE_SNAPSHOT" as const;
type Row = Record<string, unknown>;

function safeName(value: string) { const name = value.replace(/[\u0000-\u001f\u007f"\\/]/g, "_").trim().slice(0, 255); return name || "qualification-questionnaire-snapshot"; }
function detected(bytes: Uint8Array) {
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value)) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0,4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8,12)) === "WEBP") return "image/webp";
  if (bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0,5)) === "%PDF-") return "application/pdf";
  return null;
}
function polyglot(bytes: Uint8Array, mime: string) { const text = new TextDecoder("latin1").decode(bytes); if (text.startsWith("MZ") || text.includes("PK\u0003\u0004") || /<script|<!doctype\s+html|javascript:/i.test(text)) return true; if (mime === "application/pdf") { const eof = text.lastIndexOf("%%EOF"); return /\/(?:JavaScript|JS)\b/.test(text) || eof < 0 || text.slice(eof + 5).trim().length > 0; } return false; }
async function sha(bytes: Uint8Array) { const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer); return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
function publicAsset(row: Row) { return { id: String(row.id), organisationId: String(row.organisation_id), clientId: String(row.client_id), leadId: String(row.lead_id), prospectiveProjectId: String(row.prospective_project_id), classification: CLASSIFICATION, fileName: String(row.original_file_name), mimeType: String(row.mime_type), sizeBytes: Number(row.size_bytes), checksumSha256: String(row.checksum_sha256), createdAt: String(row.created_at), recordVersion: Number(row.record_version), status: String(row.status) }; }

export async function listPreCaseEvidence(input: { organisationId: string; clientId: string; leadId: string; prospectiveProjectId: string }) {
  const { DB } = getRuntimeEnv(); if (!DB) throw new Error("Protected storage is not configured."); await migrateD1(DB);
  const result = await DB.prepare("SELECT id, organisation_id, client_id, lead_id, prospective_project_id, original_file_name, mime_type, size_bytes, checksum_sha256, created_at, record_version, status FROM pre_case_evidence_assets WHERE organisation_id=? AND client_id=? AND lead_id=? AND prospective_project_id=? ORDER BY created_at DESC").bind(input.organisationId, input.clientId, input.leadId, input.prospectiveProjectId).all<Row>();
  return (result.results ?? []).map(publicAsset);
}

export async function savePreCaseEvidence(file: File, input: { organisationId: string; clientId: string; leadId: string; prospectiveProjectId: string }, actor: AppUser) {
  const { DB, R2 } = getRuntimeEnv(); if (!DB || !R2) throw new Error("Protected storage is not configured.");
  if (!ALLOWED.has(file.type)) throw new Error("Only PDF, PNG, JPEG, or WebP questionnaire snapshots are allowed."); if (file.size < 1 || file.size > MAX_BYTES) throw new Error("Questionnaire snapshot must be between 1 byte and 20 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer()); if (detected(bytes) !== file.type || polyglot(bytes, file.type)) throw new Error("Questionnaire snapshot content does not match its declared type.");
  await migrateD1(DB); const checksum = await sha(bytes); const id = crypto.randomUUID(); const objectKey = `organisations/${input.organisationId}/pre-case-evidence/${input.prospectiveProjectId}/${id}`; const createdAt = new Date().toISOString();
  await R2.put(objectKey, bytes, { httpMetadata: { contentType: file.type }, customMetadata: { checksumSha256: checksum, classification: CLASSIFICATION, immutable: "true" } });
  try {
    await DB.prepare("UPDATE pre_case_evidence_assets SET status='SUPERSEDED', record_version=record_version+1 WHERE organisation_id=? AND client_id=? AND lead_id=? AND prospective_project_id=? AND status='CURRENT'").bind(input.organisationId, input.clientId, input.leadId, input.prospectiveProjectId).run();
    await DB.prepare("INSERT INTO pre_case_evidence_assets (id,organisation_id,client_id,lead_id,prospective_project_id,classification,object_key,original_file_name,mime_type,size_bytes,checksum_sha256,created_by_id,created_by_name,created_at,record_version,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,'CURRENT')").bind(id, input.organisationId, input.clientId, input.leadId, input.prospectiveProjectId, CLASSIFICATION, objectKey, safeName(file.name), file.type, bytes.byteLength, checksum, actor.id, actor.fullName, createdAt).run();
  } catch (error) { await R2.delete(objectKey); throw error; }
  return { id, organisationId: input.organisationId, clientId: input.clientId, leadId: input.leadId, prospectiveProjectId: input.prospectiveProjectId, classification: CLASSIFICATION, fileName: safeName(file.name), mimeType: file.type, sizeBytes: bytes.byteLength, checksumSha256: checksum, createdAt, recordVersion: 1, status: "CURRENT" as const };
}
