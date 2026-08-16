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

export type PersistenceTiming = (name: string, durationMs: number) => void;

function measure(timing: PersistenceTiming | undefined, name: string, startedAt: number) {
  timing?.(name, Math.max(0, performance.now() - startedAt));
}

declare global {
  // eslint-disable-next-line no-var
  var uchitLocalWalkthroughSnapshot: PersistedStateSnapshot | undefined;
}

function localWalkthroughEnabled() {
  return process.env.NODE_ENV !== "production"
    && process.env.UCHIT_VASTU_DEMO_MODE === "true"
    && process.env.UCHIT_VASTU_WALKTHROUGH === "true";
}

/** Activates a disposable in-memory persistence boundary for explicit local walkthroughs. */
export function activateLocalWalkthroughState(state: AppState) {
  if (!localWalkthroughEnabled()) throw new Error("Local walkthrough state is unavailable outside the explicit disposable demo.");
  const snapshot = { state: structuredClone(state), revision: 1 };
  globalThis.uchitLocalWalkthroughSnapshot = snapshot;
  setAppState(structuredClone(snapshot.state));
  return snapshot;
}

async function readStateFromD1(timing?: PersistenceTiming): Promise<PersistedStateSnapshot | null> {
  const environmentStartedAt = performance.now();
  const env = getRuntimeEnv();
  measure(timing, "runtime-env", environmentStartedAt);
  if (!env.DB) {
    return null;
  }

  const migrationStartedAt = performance.now();
  await migrateD1(env.DB);
  measure(timing, "d1-migration", migrationStartedAt);
  const readStartedAt = performance.now();
  const row = await env.DB.prepare("SELECT payload, revision FROM app_state_snapshot WHERE id = ?").bind("current").first<{
    payload: string;
    revision: number;
  }>();
  measure(timing, "d1-read", readStartedAt);
  if (!row?.payload) {
    return null;
  }

  const parseStartedAt = performance.now();
  const state = JSON.parse(row.payload) as AppState;
  measure(timing, "json-parse", parseStartedAt);
  return { state, revision: row.revision };
}

async function writeStateToD1(state: AppState, expectedRevision?: number, timing?: PersistenceTiming) {
  const environmentStartedAt = performance.now();
  const env = getRuntimeEnv();
  measure(timing, "runtime-env-write", environmentStartedAt);
  if (!env.DB) {
    return null;
  }

  const migrationStartedAt = performance.now();
  await migrateD1(env.DB);
  measure(timing, "d1-migration-write", migrationStartedAt);
  const stringifyStartedAt = performance.now();
  const payload = JSON.stringify(state);
  measure(timing, "json-stringify", stringifyStartedAt);
  const updatedAt = new Date().toISOString();

  const writeStartedAt = performance.now();
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
  measure(timing, "d1-write", writeStartedAt);
  return state;
}

export async function loadStateFromPersistence(timing?: PersistenceTiming): Promise<AppState> {
  return (await loadStateSnapshotFromPersistence(timing)).state;
}

export async function loadStateSnapshotFromPersistence(timing?: PersistenceTiming): Promise<{ state: AppState; revision: number | null }> {
  if (localWalkthroughEnabled() && globalThis.uchitLocalWalkthroughSnapshot) {
    const snapshot = globalThis.uchitLocalWalkthroughSnapshot;
    const state = structuredClone(snapshot.state);
    setAppState(state);
    return { state, revision: snapshot.revision };
  }
  const base = getAppState();
  const fromDb = await readStateFromD1(timing);
  if (fromDb) {
    const mergeStartedAt = performance.now();
    const merged = mergeAppState(base, fromDb.state);
    measure(timing, "state-merge", mergeStartedAt);
    setAppState(merged);
    return { state: merged, revision: fromDb.revision };
  }

  const state = base;
  state.optInLeads = await readOptInLeadRecords();
  state.reviewCallBookings = await readReviewCallBookingRecords();
  state.advanceVerifications = await readAdvanceVerificationRecords();
  return { state, revision: null };
}

export async function persistStateToDatabase(state: AppState = getAppState(), expectedRevision?: number, timing?: PersistenceTiming) {
  const cloneStartedAt = performance.now();
  const nextState = structuredClone(state);
  measure(timing, "state-clone", cloneStartedAt);
  if (localWalkthroughEnabled() && globalThis.uchitLocalWalkthroughSnapshot) {
    const current = globalThis.uchitLocalWalkthroughSnapshot;
    if (expectedRevision !== undefined && expectedRevision !== current.revision) throw new PersistenceConflictError();
    globalThis.uchitLocalWalkthroughSnapshot = { state: nextState, revision: current.revision + 1 };
    setAppState(structuredClone(nextState));
    return nextState;
  }
  await writeStateToD1(nextState, expectedRevision, timing);
  const sideStoresStartedAt = performance.now();
  await Promise.all([
    writeOptInLeadRecords(nextState.optInLeads),
    writeReviewCallBookingRecords(nextState.reviewCallBookings),
    writeAdvanceVerificationRecords(nextState.advanceVerifications)
  ]);
  measure(timing, "side-stores-write", sideStoresStartedAt);
  setAppState(nextState);
  return nextState;
}
