import { AppState, getAppState, setAppState } from "@/lib/store";
import { readOptInLeadRecords, writeOptInLeadRecords } from "@/lib/optin-leads-store";
import { readReviewCallBookingRecords, writeReviewCallBookingRecords } from "@/lib/review-call-bookings-store";
import { readAdvanceVerificationRecords, writeAdvanceVerificationRecords } from "@/lib/advance-verifications-store";
import { getRuntimeEnv } from "@/lib/runtime-env";

const stateTableSql = `
CREATE TABLE IF NOT EXISTS app_state_snapshot (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
`;

async function readStateFromD1(): Promise<AppState | null> {
  const env = getRuntimeEnv();
  if (!env.DB) {
    return null;
  }

  await env.DB.prepare(stateTableSql).run();
  const row = await env.DB.prepare("SELECT payload FROM app_state_snapshot WHERE id = ?").bind("current").first<{ payload: string }>();
  if (!row?.payload) {
    return null;
  }

  return JSON.parse(row.payload) as AppState;
}

async function writeStateToD1(state: AppState) {
  const env = getRuntimeEnv();
  if (!env.DB) {
    return null;
  }

  await env.DB.prepare(stateTableSql).run();
  await env.DB.prepare("DELETE FROM app_state_snapshot WHERE id = ?").bind("current").run();
  await env.DB.prepare("INSERT INTO app_state_snapshot (id, payload, updated_at) VALUES (?, ?, ?)").bind(
    "current",
    JSON.stringify(state),
    new Date().toISOString()
  ).run();
  return state;
}

export async function loadStateFromPersistence(): Promise<AppState> {
  const fromDb = await readStateFromD1();
  if (fromDb) {
    setAppState(fromDb);
    return fromDb;
  }

  const state = getAppState();
  state.optInLeads = await readOptInLeadRecords();
  state.reviewCallBookings = await readReviewCallBookingRecords();
  state.advanceVerifications = await readAdvanceVerificationRecords();
  return state;
}

export async function persistStateToDatabase(state: AppState = getAppState()) {
  const nextState = structuredClone(state);
  setAppState(nextState);
  await writeStateToD1(nextState);
  await Promise.all([
    writeOptInLeadRecords(nextState.optInLeads),
    writeReviewCallBookingRecords(nextState.reviewCallBookings),
    writeAdvanceVerificationRecords(nextState.advanceVerifications)
  ]);
  return nextState;
}
