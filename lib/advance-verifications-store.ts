import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { join } from "node:path";
import type { AdvanceVerificationRecord } from "@/lib/domain";

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

export async function readAdvanceVerificationRecords(): Promise<AdvanceVerificationRecord[]> {
  await ensureFileExists();
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as Array<Partial<AdvanceVerificationRecord>>;
  return parsed.map((record, index) => hydrateVerification(record, index));
}

export async function writeAdvanceVerificationRecords(records: AdvanceVerificationRecord[]) {
  await ensureFileExists();
  await writeFile(filePath, JSON.stringify(records, null, 2), "utf8");
  return records;
}
