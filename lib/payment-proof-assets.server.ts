import { getRuntimeEnv, type D1DatabaseBinding } from "@/lib/runtime-env";
import { paymentProofLabels, type PaymentProofKey, type PaymentProofRecord } from "@/lib/payment-proof-types";

const MAX_PROOF_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);

type ProofContext = { clientId?: string; proposalId?: string; caseId?: string };
type ProofUploader = { id: string; email: string };

function cleanContextValue(value?: string) {
  const clean = value?.trim();
  return clean && /^[a-zA-Z0-9_-]{1,128}$/.test(clean) ? clean : undefined;
}

function hasExpectedSignature(bytes: Uint8Array, mimeType: string) {
  if (mimeType === "image/png") return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
  if (mimeType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/webp") return bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  if (mimeType === "application/pdf") return bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  return false;
}

async function sha256Hex(bytes: Uint8Array) {
  const digestInput = new Uint8Array(bytes.byteLength);
  digestInput.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", digestInput.buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function ensureProofTable(db: D1DatabaseBinding) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS payment_proof_assets_v2 (
    id TEXT PRIMARY KEY, slot_id TEXT NOT NULL UNIQUE, proof_key TEXT NOT NULL, label TEXT NOT NULL,
    original_file_name TEXT NOT NULL, object_key TEXT NOT NULL UNIQUE, mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL, checksum_sha256 TEXT NOT NULL, uploaded_by_id TEXT NOT NULL,
    uploaded_by_email TEXT NOT NULL, uploaded_at TEXT NOT NULL, status TEXT NOT NULL,
    client_id TEXT, proposal_id TEXT, case_id TEXT
  )`).run();
}

function mapV2(row: Record<string, unknown>): PaymentProofRecord {
  const id = String(row.id);
  return {
    id,
    key: normalizePaymentProofKey(String(row.proof_key)),
    label: String(row.label),
    fileName: String(row.original_file_name),
    url: makePaymentProofUrl(id),
    uploadedAt: String(row.uploaded_at),
    mimeType: String(row.mime_type),
    sizeBytes: Number(row.size_bytes),
    checksumSha256: String(row.checksum_sha256),
    uploadedBy: String(row.uploaded_by_email),
    status: String(row.status) as PaymentProofRecord["status"],
    clientId: row.client_id ? String(row.client_id) : undefined,
    proposalId: row.proposal_id ? String(row.proposal_id) : undefined,
    caseId: row.case_id ? String(row.case_id) : undefined
  };
}

export function normalizePaymentProofKey(key?: string | null): PaymentProofKey {
  return key === "balance-proof" ? "balance-proof" : "advance-proof";
}

export function makePaymentProofUrl(id: string) {
  return `/api/payment-proofs/files/${encodeURIComponent(id)}`;
}

export async function readPaymentProofManifest(): Promise<PaymentProofRecord[]> {
  const { DB } = getRuntimeEnv();
  if (!DB) return [];
  await ensureProofTable(DB);
  const result = await DB.prepare("SELECT * FROM payment_proof_assets_v2 ORDER BY uploaded_at DESC").all<Record<string, unknown>>();
  const current = (result.results ?? []).map(mapV2);
  if (current.length) return current;

  // Compatibility boundary: retain legacy metadata, but never return embedded data URLs.
  const legacyExists = await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='payment_proof_assets'").first();
  if (!legacyExists) return [];
  const legacy = await DB.prepare("SELECT key, label, file_name, url, uploaded_at FROM payment_proof_assets ORDER BY uploaded_at DESC").all<Record<string, unknown>>();
  return (legacy.results ?? []).map((row: Record<string, unknown>) => ({
    key: normalizePaymentProofKey(String(row.key)), label: String(row.label), fileName: String(row.file_name),
    url: String(row.url).startsWith("data:") ? "" : String(row.url), uploadedAt: String(row.uploaded_at), status: "UPLOADED"
  }));
}

export async function savePaymentProofUpload(file: File, key: string, uploader: ProofUploader, context: ProofContext = {}) {
  const { DB, R2 } = getRuntimeEnv();
  if (!DB || !R2) throw new Error("Secure payment-proof storage is not configured.");
  if (!ALLOWED_MIME_TYPES.has(file.type)) throw new Error("Only PNG, JPEG, WebP, or PDF payment proofs are allowed.");
  if (file.size < 1 || file.size > MAX_PROOF_BYTES) throw new Error("Payment proof must be between 1 byte and 10 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasExpectedSignature(bytes, file.type)) throw new Error("The payment proof content does not match its declared file type.");

  const normalizedKey = normalizePaymentProofKey(key);
  const safeContext = {
    clientId: cleanContextValue(context.clientId), proposalId: cleanContextValue(context.proposalId), caseId: cleanContextValue(context.caseId)
  };
  const id = crypto.randomUUID();
  const slotId = [normalizedKey, safeContext.clientId ?? "", safeContext.proposalId ?? "", safeContext.caseId ?? ""].join(":");
  const objectKey = `payment-proofs/${id}`;
  const uploadedAt = new Date().toISOString();
  const checksum = await sha256Hex(bytes);
  await ensureProofTable(DB);
  const previous = await DB.prepare("SELECT object_key FROM payment_proof_assets_v2 WHERE slot_id = ?").bind(slotId).first<{ object_key: string }>();

  await R2.put(objectKey, bytes, { httpMetadata: { contentType: file.type }, customMetadata: { checksumSha256: checksum } });
  try {
    await DB.prepare(`INSERT OR REPLACE INTO payment_proof_assets_v2
      (id, slot_id, proof_key, label, original_file_name, object_key, mime_type, size_bytes, checksum_sha256,
       uploaded_by_id, uploaded_by_email, uploaded_at, status, client_id, proposal_id, case_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'UPLOADED', ?, ?, ?)`)
      .bind(id, slotId, normalizedKey, paymentProofLabels[normalizedKey], file.name.slice(0, 255), objectKey, file.type,
        bytes.byteLength, checksum, uploader.id, uploader.email, uploadedAt,
        safeContext.clientId ?? null, safeContext.proposalId ?? null, safeContext.caseId ?? null).run();
  } catch (error) {
    await R2.delete(objectKey);
    throw error;
  }
  if (previous?.object_key && previous.object_key !== objectKey) {
    try { await R2.delete(previous.object_key); } catch { /* Metadata already points only to the new private object. */ }
  }
  return mapV2({ id, proof_key: normalizedKey, label: paymentProofLabels[normalizedKey], original_file_name: file.name,
    mime_type: file.type, size_bytes: bytes.byteLength, checksum_sha256: checksum, uploaded_by_email: uploader.email,
    uploaded_at: uploadedAt, status: "UPLOADED", client_id: safeContext.clientId, proposal_id: safeContext.proposalId, case_id: safeContext.caseId });
}

export async function readPaymentProofFile(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { DB, R2 } = getRuntimeEnv();
  if (!DB || !R2) return null;
  await ensureProofTable(DB);
  const row = await DB.prepare("SELECT object_key, mime_type, original_file_name FROM payment_proof_assets_v2 WHERE id = ?").bind(id)
    .first<{ object_key: string; mime_type: string; original_file_name: string }>();
  if (!row) return null;
  const object = await R2.get(row.object_key);
  return object ? { object, mimeType: row.mime_type, fileName: row.original_file_name } : null;
}
