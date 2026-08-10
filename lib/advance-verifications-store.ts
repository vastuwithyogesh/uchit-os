import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { join } from "node:path";
import type { AdvanceVerificationRecord } from "@/lib/domain";
import { getRuntimeEnv } from "@/lib/runtime-env";

const filePath = join(process.cwd(), "data", "advance-verifications.json");

async function ensureFileExists() {
  try {
    await access(filePath, fsConstants.F_OK);
  } catch {
    await mkdir(join(process.cwd(), "data"), { recursive: true });
    await writeFile(filePath, JSON.stringify([], null, 2), "utf8");
  }
}

function hydrateVerification(record: Partial<AdvanceVerificationRecord>, index: number): AdvanceVerificationRecord {
  return {
    id: String(record.id ?? `advver_${Date.now()}_${index}`),
    clientId: String(record.clientId ?? ""),
    proposalId: String(record.proposalId ?? ""),
    amountInr: typeof record.amountInr === "number" ? record.amountInr : 0,
    referenceScreenshotUrl: String(record.referenceScreenshotUrl ?? ""),
    referenceScreenshotFileName: String(record.referenceScreenshotFileName ?? ""),
    verifiedBy: String(record.verifiedBy ?? "System"),
    verifiedAt: String(record.verifiedAt ?? new Date().toISOString()),
    paymentId: String(record.paymentId ?? ""),
    caseId: record.caseId ? String(record.caseId) : undefined,
    status: record.status === "CASE_OPENED" ? "CASE_OPENED" : "VERIFIED"
  };
}

async function readFromD1(): Promise<AdvanceVerificationRecord[] | null> {
  const env = getRuntimeEnv();
  if (!env.DB) {
    return null;
  }

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS advance_verifications (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      proposal_id TEXT NOT NULL,
      amount_inr INTEGER NOT NULL,
      reference_screenshot_url TEXT NOT NULL,
      reference_screenshot_file_name TEXT NOT NULL,
      verified_by TEXT NOT NULL,
      verified_at TEXT NOT NULL,
      payment_id TEXT NOT NULL,
      case_id TEXT,
      status TEXT NOT NULL,
      payload TEXT NOT NULL
    )
  `).run();

  const result = await env.DB.prepare("SELECT payload FROM advance_verifications ORDER BY verified_at DESC").all<{ payload: string }>();
  return (result.results ?? []).map((row: { payload: string }, index: number) =>
    hydrateVerification(JSON.parse(row.payload) as Partial<AdvanceVerificationRecord>, index)
  );
}

async function writeToD1(records: AdvanceVerificationRecord[]) {
  const env = getRuntimeEnv();
  if (!env.DB) {
    return null;
  }
  const db = env.DB;

  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS advance_verifications (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        proposal_id TEXT NOT NULL,
        amount_inr INTEGER NOT NULL,
        reference_screenshot_url TEXT NOT NULL,
        reference_screenshot_file_name TEXT NOT NULL,
        verified_by TEXT NOT NULL,
        verified_at TEXT NOT NULL,
        payment_id TEXT NOT NULL,
        case_id TEXT,
        status TEXT NOT NULL,
        payload TEXT NOT NULL
      )
    `),
    db.prepare("DELETE FROM advance_verifications")
  ]);

  if (records.length > 0) {
    await env.DB.batch(
      records.map((record) =>
        db.prepare(
          "INSERT INTO advance_verifications (id, client_id, proposal_id, amount_inr, reference_screenshot_url, reference_screenshot_file_name, verified_by, verified_at, payment_id, case_id, status, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(
          record.id,
          record.clientId,
          record.proposalId,
          record.amountInr,
          record.referenceScreenshotUrl,
          record.referenceScreenshotFileName,
          record.verifiedBy,
          record.verifiedAt,
          record.paymentId,
          record.caseId ?? null,
          record.status,
          JSON.stringify(record)
        )
      )
    );
  }

  return records;
}

export async function readAdvanceVerificationRecords(): Promise<AdvanceVerificationRecord[]> {
  const fromDb = await readFromD1();
  if (fromDb) {
    return fromDb;
  }

  await ensureFileExists();
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as Array<Partial<AdvanceVerificationRecord>>;
  return parsed.map((record, index) => hydrateVerification(record, index));
}

export async function writeAdvanceVerificationRecords(records: AdvanceVerificationRecord[]) {
  const wroteToDb = await writeToD1(records);
  if (wroteToDb) {
    return wroteToDb;
  }

  await ensureFileExists();
  await writeFile(filePath, JSON.stringify(records, null, 2), "utf8");
  return records;
}
