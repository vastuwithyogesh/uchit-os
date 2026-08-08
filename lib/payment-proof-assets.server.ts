import { join, extname } from "node:path";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { paymentProofLabels, type PaymentProofKey, type PaymentProofRecord } from "@/lib/payment-proof-types";

declare global {
  // eslint-disable-next-line no-var
  var uchitVastuPaymentProofAssets: PaymentProofRecord[] | undefined;
}

function mapPaymentProofRecord(record: Record<string, unknown>): PaymentProofRecord {
  return {
    key: String(record.key ?? "advance-proof") as PaymentProofKey,
    label: String(record.label ?? paymentProofLabels["advance-proof"]),
    fileName: String(record.fileName ?? record.file_name ?? ""),
    url: String(record.url ?? ""),
    uploadedAt: String(record.uploadedAt ?? record.uploaded_at ?? new Date().toISOString())
  };
}

export function normalizePaymentProofKey(key?: string | null): PaymentProofKey {
  return key === "balance-proof" ? "balance-proof" : "advance-proof";
}

export async function readPaymentProofManifest(): Promise<PaymentProofRecord[]> {
  if (globalThis.uchitVastuPaymentProofAssets?.length) {
    return structuredClone(globalThis.uchitVastuPaymentProofAssets);
  }

  const env = getRuntimeEnv();
  if (env.DB) {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS payment_proof_assets (
        key TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        file_name TEXT NOT NULL,
        url TEXT NOT NULL,
        uploaded_at TEXT NOT NULL
      )
    `).run();
    const result = await env.DB.prepare("SELECT key, label, file_name, url, uploaded_at FROM payment_proof_assets ORDER BY uploaded_at DESC").all<Record<string, unknown>>();
    const records = (result.results ?? []).map(mapPaymentProofRecord);
    globalThis.uchitVastuPaymentProofAssets = structuredClone(records);
    return records;
  }

  globalThis.uchitVastuPaymentProofAssets ??= [];
  return structuredClone(globalThis.uchitVastuPaymentProofAssets);
}

export async function writePaymentProofManifest(records: PaymentProofRecord[]) {
  globalThis.uchitVastuPaymentProofAssets = structuredClone(records);

  const env = getRuntimeEnv();
  if (env.DB) {
    await env.DB.batch([
      env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS payment_proof_assets (
          key TEXT PRIMARY KEY,
          label TEXT NOT NULL,
          file_name TEXT NOT NULL,
          url TEXT NOT NULL,
          uploaded_at TEXT NOT NULL
        )
      `),
      env.DB.prepare("DELETE FROM payment_proof_assets")
    ]);
    if (records.length > 0) {
      await env.DB.batch(
        records.map((record) =>
          env.DB.prepare("INSERT INTO payment_proof_assets (key, label, file_name, url, uploaded_at) VALUES (?, ?, ?, ?, ?)").bind(
            record.key,
            record.label,
            record.fileName,
            record.url,
            record.uploadedAt
          )
        )
      );
    }
  }
  return records;
}

export function makePaymentProofUrl(fileName: string) {
  return `/api/payment-proofs/files/${encodeURIComponent(fileName)}`;
}

export function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function buildPaymentProofFileName(key: PaymentProofKey, originalName: string) {
  const ext = extname(originalName) || ".png";
  return `${key}-${Date.now()}${ext}`;
}

export async function savePaymentProofUpload(file: File, key = "advance-proof") {
  const normalizedKey = normalizePaymentProofKey(key);
  const safeName = sanitizeFileName(file.name || `${normalizedKey}.png`);
  const fileName = buildPaymentProofFileName(normalizedKey, safeName);
  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "image/png";
  const dataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;

  const manifest = await readPaymentProofManifest();
  const label = paymentProofLabels[normalizedKey];
  const nextRecord: PaymentProofRecord = {
    key: normalizedKey,
    label,
    fileName,
    url: dataUrl,
    uploadedAt: new Date().toISOString()
  };

  await writePaymentProofManifest([nextRecord, ...manifest.filter((record) => record.key !== normalizedKey)]);

  return nextRecord;
}
