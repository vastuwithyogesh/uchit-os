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

function mergeAppState(base: AppState, snapshot: AppState): AppState {
  return {
    ...base,
    ...snapshot,
    clients: snapshot.clients?.length ? snapshot.clients : base.clients,
    leadQualifications: snapshot.leadQualifications?.length ? snapshot.leadQualifications : base.leadQualifications,
    commercialProposals: snapshot.commercialProposals?.length ? snapshot.commercialProposals : base.commercialProposals,
    reviewCallBookings: snapshot.reviewCallBookings?.length ? snapshot.reviewCallBookings : base.reviewCallBookings,
    payments: snapshot.payments?.length ? snapshot.payments : base.payments,
    advanceVerifications: snapshot.advanceVerifications?.length ? snapshot.advanceVerifications : base.advanceVerifications,
    vastuCases: snapshot.vastuCases?.length ? snapshot.vastuCases : base.vastuCases,
    floorWorkspaces: snapshot.floorWorkspaces?.length ? snapshot.floorWorkspaces : base.floorWorkspaces,
    reportVersions: snapshot.reportVersions?.length ? snapshot.reportVersions : base.reportVersions,
    evaluationSnapshots: snapshot.evaluationSnapshots?.length ? snapshot.evaluationSnapshots : base.evaluationSnapshots,
    mapping32D: snapshot.mapping32D?.length ? snapshot.mapping32D : base.mapping32D,
    mapping16D: snapshot.mapping16D?.length ? snapshot.mapping16D : base.mapping16D,
    utilityRules: snapshot.utilityRules?.length ? snapshot.utilityRules : base.utilityRules,
    shaktiSnapshots: snapshot.shaktiSnapshots?.length ? snapshot.shaktiSnapshots : base.shaktiSnapshots,
    timelineEvents: snapshot.timelineEvents?.length ? snapshot.timelineEvents : base.timelineEvents,
    optInLeads: snapshot.optInLeads?.length ? snapshot.optInLeads : base.optInLeads,
    whatsappTemplates: snapshot.whatsappTemplates?.length ? snapshot.whatsappTemplates : base.whatsappTemplates,
    whatsappLogs: snapshot.whatsappLogs?.length ? snapshot.whatsappLogs : base.whatsappLogs
  };
}

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
  const base = getAppState();
  const fromDb = await readStateFromD1();
  if (fromDb) {
    const merged = mergeAppState(base, fromDb);
    setAppState(merged);
    return merged;
  }

  const state = base;
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
