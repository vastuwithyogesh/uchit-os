import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { join } from "node:path";
import type { ReviewCallBookingRecord } from "@/lib/domain";

const filePath = join(process.cwd(), "data", "review-call-bookings.json");

async function ensureFileExists() {
  try {
    await access(filePath, fsConstants.F_OK);
  } catch {
    await mkdir(join(process.cwd(), "data"), { recursive: true });
    await writeFile(filePath, JSON.stringify([], null, 2), "utf8");
  }
}

function hydrateBooking(record: Partial<ReviewCallBookingRecord>, index: number): ReviewCallBookingRecord {
  return {
    id: String(record.id ?? `booking_${Date.now()}_${index}`),
    clientId: String(record.clientId ?? ""),
    proposalId: String(record.proposalId ?? ""),
    provider: record.provider === "ZOOM" ? "ZOOM" : "GOOGLE_MEET",
    scheduledAt: String(record.scheduledAt ?? new Date().toISOString()),
    durationMinutes: typeof record.durationMinutes === "number" ? record.durationMinutes : 30,
    meetingLink: String(record.meetingLink ?? ""),
    calendarHoldId: String(record.calendarHoldId ?? ""),
    status: record.status === "SENT" || record.status === "COMPLETED" || record.status === "CANCELLED" ? record.status : "BOOKED",
    bookedBy: String(record.bookedBy ?? "System"),
    bookedAt: String(record.bookedAt ?? new Date().toISOString())
  };
}

export async function readReviewCallBookingRecords(): Promise<ReviewCallBookingRecord[]> {
  await ensureFileExists();
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as Array<Partial<ReviewCallBookingRecord>>;
  return parsed.map((record, index) => hydrateBooking(record, index));
}

export async function writeReviewCallBookingRecords(records: ReviewCallBookingRecord[]) {
  await ensureFileExists();
  await writeFile(filePath, JSON.stringify(records, null, 2), "utf8");
  return records;
}
