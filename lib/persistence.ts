import { AppState, getAppState, setAppState } from "@/lib/store";
import { readOptInLeadRecords, writeOptInLeadRecords } from "@/lib/optin-leads-store";
import { readReviewCallBookingRecords, writeReviewCallBookingRecords } from "@/lib/review-call-bookings-store";
import { readAdvanceVerificationRecords, writeAdvanceVerificationRecords } from "@/lib/advance-verifications-store";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { migrateD1 } from "@/db/migrations";
import { mergeAppState } from "@/lib/persistence-merge";

export class PersistenceConflictError extends Error {
  constructor() {
    super("The saved state changed before this write completed. Reload and retry the operation.");
    this.name = "PersistenceConflictError";
  }
}

type PersistedStateSnapshot = {
  state: AppState;
  revision: number;
};

async function readStateFromD1(): Promise<PersistedStateSnapshot | null> {
  const env = getRuntimeEnv();
  if (!env.DB) {
    return null;
  }

  await migrateD1(env.DB);
  const row = await env.DB.prepare("SELECT payload, revision FROM app_state_snapshot WHERE id = ?").bind("current").first<{
    payload: string;
    revision: number;
  }>();
  if (!row?.payload) {
    return null;
  }

  return { state: JSON.parse(row.payload) as AppState, revision: row.revision };
}

async function writeStateToD1(state: AppState, expectedRevision?: number) {
  const env = getRuntimeEnv();
  if (!env.DB) {
    return null;
  }

  await migrateD1(env.DB);
  const payload = JSON.stringify(state);
  const updatedAt = new Date().toISOString();

  if (expectedRevision !== undefined) {
    const result = await env.DB.prepare(
      "UPDATE app_state_snapshot SET payload = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND revision = ?"
    ).bind(payload, updatedAt, "current", expectedRevision).run();
    if (result.meta.changes !== 1) throw new PersistenceConflictError();
  } else {
    await env.DB.prepare(
      `INSERT INTO app_state_snapshot (id, payload, updated_at, revision) VALUES (?, ?, ?, 1)
       ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at,
       revision = app_state_snapshot.revision + 1`
    ).bind("current", payload, updatedAt).run();
  }
  return state;
}

export async function loadStateFromPersistence(): Promise<AppState> {
  return (await loadStateSnapshotFromPersistence()).state;
}

export async function loadStateSnapshotFromPersistence(): Promise<{ state: AppState; revision: number | null }> {
  const base = getAppState();
  const fromDb = await readStateFromD1();
  if (fromDb) {
    const merged = mergeAppState(base, fromDb.state);
    setAppState(merged);
    return { state: merged, revision: fromDb.revision };
  }

  const state = base;
  state.optInLeads = await readOptInLeadRecords();
  state.reviewCallBookings = await readReviewCallBookingRecords();
  state.advanceVerifications = await readAdvanceVerificationRecords();
  return { state, revision: null };
}

export async function persistStateToDatabase(state: AppState = getAppState(), expectedRevision?: number) {
  const nextState = structuredClone(state);
  await writeStateToD1(nextState, expectedRevision);
  await Promise.all([
    writeOptInLeadRecords(nextState.optInLeads),
    writeReviewCallBookingRecords(nextState.reviewCallBookings),
    writeAdvanceVerificationRecords(nextState.advanceVerifications)
  ]);
  setAppState(nextState);
  return nextState;
}
