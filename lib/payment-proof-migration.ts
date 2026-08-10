import type { D1DatabaseBinding, R2BucketBinding } from "./runtime-env.ts";

export type LegacyPaymentProof = {
  legacyId: string;
  key?: string;
  label?: string;
  fileName?: string;
  uploadedAt?: string;
  dataUrl?: string;
  bytes?: Uint8Array;
  mimeType?: string;
};

export type LegacyProofOwnership = {
  clientId: string;
  proposalId?: string;
  caseId?: string;
  uploadedById: string;
  uploadedByEmail: string;
};

export type MigrationRecordResult = {
  legacyId: string;
  outcome: "PLANNED" | "MIGRATED" | "SKIPPED" | "FAILED";
  checksumSha256?: string;
  targetId?: string;
  objectKey?: string;
  reason?: string;
};

export type PaymentProofMigrationManifest = {
  mode: "DRY_RUN" | "EXECUTE";
  startedAt: string;
  completedAt: string;
  totals: { records: number; planned: number; migrated: number; skipped: number; failed: number };
  records: MigrationRecordResult[];
  legacyDataDeleted: false;
};

type MigrationOptions = {
  execute?: boolean;
  now?: () => Date;
};

const allowedMimeTypes = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);
const cleanIdPattern = /^[a-zA-Z0-9_-]{1,128}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const maxProofBytes = 10 * 1024 * 1024;

function parseDataUrl(dataUrl: string) {
  const match = /^data:([^;,]+);base64,([a-zA-Z0-9+/=\r\n]+)$/.exec(dataUrl);
  if (!match) throw new Error("Legacy payload is not a supported base64 data URL.");
  const binary = atob(match[2].replace(/[\r\n]/g, ""));
  return { mimeType: match[1].toLowerCase(), bytes: Uint8Array.from(binary, (character) => character.charCodeAt(0)) };
}

function normalizePaymentProofKey(key?: string) {
  return key === "balance-proof" ? "balance-proof" : "advance-proof";
}

function hasExpectedSignature(bytes: Uint8Array, mimeType: string) {
  if (mimeType === "image/png") return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  if (mimeType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/webp") return bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  if (mimeType === "application/pdf") return bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  return false;
}

async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function deterministicUuid(hex: string) {
  const chars = hex.slice(0, 32).split("");
  chars[12] = "5";
  chars[16] = ((parseInt(chars[16], 16) & 3) | 8).toString(16);
  const value = chars.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function validateOwnership(ownership?: LegacyProofOwnership) {
  if (!ownership) throw new Error("A reviewed ownership mapping is required.");
  if (!cleanIdPattern.test(ownership.clientId)) throw new Error("Ownership mapping has an invalid clientId.");
  if (!ownership.proposalId && !ownership.caseId) throw new Error("Ownership mapping must include proposalId or caseId.");
  for (const value of [ownership.proposalId, ownership.caseId, ownership.uploadedById]) {
    if (value && !cleanIdPattern.test(value)) throw new Error("Ownership mapping contains an invalid identifier.");
  }
  if (!emailPattern.test(ownership.uploadedByEmail)) throw new Error("Ownership mapping has an invalid uploader email.");
}

function decodeLegacyProof(record: LegacyPaymentProof) {
  if (record.bytes) return { bytes: record.bytes, mimeType: record.mimeType?.toLowerCase() ?? "" };
  if (record.dataUrl) return parseDataUrl(record.dataUrl);
  throw new Error("Legacy proof bytes are missing.");
}

async function ensureMigrationTables(db: D1DatabaseBinding) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS payment_proof_migration_journal (
    legacy_id TEXT PRIMARY KEY, target_id TEXT NOT NULL, checksum_sha256 TEXT NOT NULL,
    object_key TEXT NOT NULL, migrated_at TEXT NOT NULL, status TEXT NOT NULL
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS payment_proof_assets_v2 (
    id TEXT PRIMARY KEY, slot_id TEXT NOT NULL UNIQUE, proof_key TEXT NOT NULL, label TEXT NOT NULL,
    original_file_name TEXT NOT NULL, object_key TEXT NOT NULL UNIQUE, mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL, checksum_sha256 TEXT NOT NULL, uploaded_by_id TEXT NOT NULL,
    uploaded_by_email TEXT NOT NULL, uploaded_at TEXT NOT NULL, status TEXT NOT NULL,
    client_id TEXT, proposal_id TEXT, case_id TEXT
  )`).run();
}

export async function migrateLegacyPaymentProofs(
  db: D1DatabaseBinding | undefined,
  r2: R2BucketBinding | undefined,
  records: LegacyPaymentProof[],
  ownershipByLegacyId: Record<string, LegacyProofOwnership>,
  options: MigrationOptions = {}
): Promise<PaymentProofMigrationManifest> {
  const execute = options.execute === true;
  if (execute && (!db || !r2)) throw new Error("Execute mode requires explicit D1 and R2 bindings.");
  const now = options.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const output: MigrationRecordResult[] = [];
  const seenLegacyIds = new Set<string>();
  if (execute) await ensureMigrationTables(db!);

  for (const record of records) {
    try {
      if (!record.legacyId || !cleanIdPattern.test(record.legacyId)) throw new Error("Legacy record has an invalid legacyId.");
      if (seenLegacyIds.has(record.legacyId)) throw new Error("Duplicate legacyId in migration input.");
      seenLegacyIds.add(record.legacyId);
      const ownership = ownershipByLegacyId[record.legacyId];
      validateOwnership(ownership);
      const { bytes, mimeType } = decodeLegacyProof(record);
      if (!allowedMimeTypes.has(mimeType)) throw new Error("Legacy proof MIME type is not allowed.");
      if (bytes.byteLength < 1 || bytes.byteLength > maxProofBytes) throw new Error("Legacy proof size is outside the allowed range.");
      if (!hasExpectedSignature(bytes, mimeType)) throw new Error("Legacy proof signature does not match its MIME type.");
      const checksum = await sha256Hex(bytes);
      const targetId = deterministicUuid(await sha256Hex(new TextEncoder().encode(`legacy-payment-proof:${record.legacyId}:${checksum}`)));
      const objectKey = `payment-proofs/sha256/${checksum}`;
      const resultBase = { legacyId: record.legacyId, checksumSha256: checksum, targetId, objectKey };

      if (!execute) {
        output.push({ ...resultBase, outcome: "PLANNED" });
        continue;
      }

      const journal = await db!.prepare("SELECT status FROM payment_proof_migration_journal WHERE legacy_id = ?")
        .bind(record.legacyId).first<{ status: string }>();
      if (journal?.status === "MIGRATED") {
        output.push({ ...resultBase, outcome: "SKIPPED", reason: "Already migrated successfully." });
        continue;
      }

      const proofKey = normalizePaymentProofKey(record.key);
      const slotId = [proofKey, ownership.clientId, ownership.proposalId ?? "", ownership.caseId ?? ""].join(":");
      const occupied = await db!.prepare("SELECT id, checksum_sha256 FROM payment_proof_assets_v2 WHERE slot_id = ?")
        .bind(slotId).first<{ id: string; checksum_sha256: string }>();
      if (occupied && occupied.checksum_sha256 !== checksum) throw new Error("Target payment slot already contains a different proof.");

      if (!occupied) {
        const existingObject = await r2!.get(objectKey);
        if (!existingObject) await r2!.put(objectKey, bytes, {
          httpMetadata: { contentType: mimeType }, customMetadata: { checksumSha256: checksum, migration: "legacy-v1" }
        });
        const uploadedAt = record.uploadedAt && !Number.isNaN(Date.parse(record.uploadedAt)) ? new Date(record.uploadedAt).toISOString() : now().toISOString();
        await db!.prepare(`INSERT OR IGNORE INTO payment_proof_assets_v2
          (id, slot_id, proof_key, label, original_file_name, object_key, mime_type, size_bytes, checksum_sha256,
           uploaded_by_id, uploaded_by_email, uploaded_at, status, client_id, proposal_id, case_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'UPLOADED', ?, ?, ?)`).bind(
            targetId, slotId, proofKey, record.label?.slice(0, 100) || (proofKey === "balance-proof" ? "Balance proof" : "Advance proof"),
            record.fileName?.slice(0, 255) || `legacy-${record.legacyId}`, objectKey, mimeType, bytes.byteLength, checksum,
            ownership.uploadedById, ownership.uploadedByEmail, uploadedAt, ownership.clientId,
            ownership.proposalId ?? null, ownership.caseId ?? null
          ).run();
      }
      await db!.prepare(`INSERT OR REPLACE INTO payment_proof_migration_journal
        (legacy_id, target_id, checksum_sha256, object_key, migrated_at, status) VALUES (?, ?, ?, ?, ?, 'MIGRATED')`)
        .bind(record.legacyId, occupied?.id ?? targetId, checksum, objectKey, now().toISOString()).run();
      output.push({ ...resultBase, targetId: occupied?.id ?? targetId, outcome: occupied ? "SKIPPED" : "MIGRATED", reason: occupied ? "Identical proof already occupies the mapped slot." : undefined });
    } catch (error) {
      output.push({ legacyId: record.legacyId || "(missing)", outcome: "FAILED", reason: error instanceof Error ? error.message : "Unknown migration error." });
    }
  }

  const count = (outcome: MigrationRecordResult["outcome"]) => output.filter((record) => record.outcome === outcome).length;
  return {
    mode: execute ? "EXECUTE" : "DRY_RUN", startedAt, completedAt: now().toISOString(),
    totals: { records: output.length, planned: count("PLANNED"), migrated: count("MIGRATED"), skipped: count("SKIPPED"), failed: count("FAILED") },
    records: output, legacyDataDeleted: false
  };
}
