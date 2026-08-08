import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { join } from "node:path";
import type { ReviewCallBookingRecord } from "@/lib/domain";
import { getRuntimeEnv } from "@/lib/runtime-env";

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

async function readFromD1(): Promise<ReviewCallBookingRecord[] | null> {
  const env = getRuntimeEnv();
  if (!env.DB) {
    return null;
  }

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS review_call_bookings (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      proposal_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      scheduled_at TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      meeting_link TEXT NOT NULL,
      calendar_hold_id TEXT NOT NULL,
      status TEXT NOT NULL,
      booked_by TEXT NOT NULL,
      booked_at TEXT NOT NULL,
      payload TEXT NOT NULL
    )
  `).run();

  const result = await env.DB.prepare("SELECT payload FROM review_call_bookings ORDER BY booked_at DESC").all<{ payload: string }>();
  return (result.results ?? []).map((row, index) => hydrateBooking(JSON.parse(row.payload) as Partial<ReviewCallBookingRecord>, index));
}

async function writeToD1(records: ReviewCallBookingRecord[]) {
  const env = getRuntimeEnv();
  if (!env.DB) {
    return null;
  }

  await env.DB.batch([
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS review_call_bookings (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        proposal_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        scheduled_at TEXT NOT NULL,
        duration_minutes INTEGER NOT NULL,
        meeting_link TEXT NOT NULL,
        calendar_hold_id TEXT NOT NULL,
        status TEXT NOT NULL,
        booked_by TEXT NOT NULL,
        booked_at TEXT NOT NULL,
        payload TEXT NOT NULL
      )
    `),
    env.DB.prepare("DELETE FROM review_call_bookings")
  ]);

  if (records.length > 0) {
    await env.DB.batch(
      records.map((record) =>
        env.DB.prepare(
          "INSERT INTO review_call_bookings (id, client_id, proposal_id, provider, scheduled_at, duration_minutes, meeting_link, calendar_hold_id, status, booked_by, booked_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(
          record.id,
          record.clientId,
          record.proposalId,
          record.provider,
          record.scheduledAt,
          record.durationMinutes,
          record.meetingLink,
          record.calendarHoldId,
          record.status,
          record.bookedBy,
          record.bookedAt,
          JSON.stringify(record)
        )
      )
    );
  }

  return records;
}

export async function readReviewCallBookingRecords(): Promise<ReviewCallBookingRecord[]> {
  const fromDb = await readFromD1();
  if (fromDb) {
    return fromDb;
  }

  await ensureFileExists();
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as Array<Partial<ReviewCallBookingRecord>>;
  return parsed.map((record, index) => hydrateBooking(record, index));
}

export async function writeReviewCallBookingRecords(records: ReviewCallBookingRecord[]) {
  const wroteToDb = await writeToD1(records);
  if (wroteToDb) {
    return wroteToDb;
  }

  await ensureFileExists();
  await writeFile(filePath, JSON.stringify(records, null, 2), "utf8");
  return records;
}
