import test from "node:test";
import assert from "node:assert/strict";
import { d1Migrations, migrateD1 } from "../db/migrations.ts";
import { createStateBackup, validateStateBackup } from "../lib/state-backup.ts";

class FakeStatement {
  constructor(db, sql) { this.db = db; this.sql = sql.trim(); this.values = []; }
  bind(...values) { this.values = values; return this; }
  async run() { return this.db.run(this.sql, this.values); }
  async all() { return this.db.all(this.sql); }
  async first() { return null; }
}

class FakeD1 {
  constructor({ revisionColumn = false, revision = null, applied = [] } = {}) { this.tables = new Set(revisionColumn ? ["app_state_snapshot"] : []); this.columns = new Map(revisionColumn ? [["app_state_snapshot", new Set(["id", "payload", "updated_at", "revision"])]] : []); this.indexes = new Set(); this.applied = new Set(applied); this.revision = revision; }
  prepare(sql) { return new FakeStatement(this, sql); }
  async batch(statements) { const results = []; for (const statement of statements) results.push(await statement.run()); return results; }
  async run(sql, values) {
    if (/CREATE TABLE IF NOT EXISTS schema_migrations/i.test(sql)) this.tables.add("schema_migrations");
    if (/CREATE TABLE IF NOT EXISTS app_state_snapshot/i.test(sql)) { this.tables.add("app_state_snapshot"); this.columns.set("app_state_snapshot", new Set(["id", "payload", "updated_at"])); }
    if (/ALTER TABLE app_state_snapshot ADD COLUMN revision/i.test(sql)) { this.columns.get("app_state_snapshot").add("revision"); if (this.revision === null) this.revision = 0; }
    if (/CREATE TABLE IF NOT EXISTS case_file_assets/i.test(sql)) { this.tables.add("case_file_assets"); this.columns.set("case_file_assets", new Set(["id", "evidence_ref", "case_id", "case_revision_number", "service_type", "floor_label", "object_key", "checksum_sha256", "status"])); }
    if (/CREATE TABLE IF NOT EXISTS staff_role_assignments/i.test(sql)) this.tables.add("staff_role_assignments");
    if (/CREATE TABLE IF NOT EXISTS staff_role_assignment_audit/i.test(sql)) this.tables.add("staff_role_assignment_audit");
    if (/CREATE TABLE IF NOT EXISTS optin_leads/i.test(sql)) this.tables.add("optin_leads");
    if (/CREATE TABLE IF NOT EXISTS inbound_optin_events/i.test(sql)) this.tables.add("inbound_optin_events");
    const index = sql.match(/CREATE INDEX IF NOT EXISTS (\w+)/i); if (index) this.indexes.add(index[1]);
    if (/INSERT OR IGNORE INTO schema_migrations/i.test(sql)) this.applied.add(Number(values[0]));
    return { meta: { changes: 1 }, success: true };
  }
  async all(sql) {
    if (/SELECT version FROM schema_migrations/i.test(sql)) return { results: [...this.applied].sort((a, b) => a - b).map((version) => ({ version })), meta: {} };
    if (/PRAGMA table_info\(app_state_snapshot\)/i.test(sql)) return { results: [...(this.columns.get("app_state_snapshot") ?? [])].map((name) => ({ name })), meta: {} };
    return { results: [], meta: {} };
  }
}

test("v1 through v5 migrate an empty database and repeat without drift", async () => {
  const db = new FakeD1();
  await migrateD1(db);
  assert.deepEqual([...db.applied], [1, 2, 3, 4, 5]);
  assert.ok(db.tables.has("app_state_snapshot"));
  assert.ok(db.tables.has("case_file_assets"));
  assert.ok(db.tables.has("staff_role_assignments"));
  assert.ok(db.tables.has("staff_role_assignment_audit"));
  assert.ok(db.tables.has("optin_leads"));
  assert.ok(db.tables.has("inbound_optin_events"));
  assert.ok(db.columns.get("app_state_snapshot").has("revision"));
  assert.deepEqual([...db.indexes].sort(), ["idx_case_file_assets_floor", "idx_case_file_assets_scope", "idx_inbound_optin_events_identity", "idx_inbound_optin_events_received", "idx_staff_role_audit_target_time"]);
  const before = JSON.stringify({ applied: [...db.applied], tables: [...db.tables], indexes: [...db.indexes], revision: db.revision });
  await migrateD1(db);
  assert.equal(JSON.stringify({ applied: [...db.applied], tables: [...db.tables], indexes: [...db.indexes], revision: db.revision }), before);
});

test("production-like v2 schema adopts migration markers without changing revision", async () => {
  const db = new FakeD1({ revisionColumn: true, revision: 37, applied: [1] });
  await migrateD1(db);
  assert.equal(db.revision, 37);
  assert.deepEqual([...db.applied], [1, 2, 3, 4, 5]);
  assert.ok(db.tables.has("case_file_assets"));
});

test("migration list is deterministic and Sites packages the db directory", async () => {
  assert.deepEqual(d1Migrations.map((item) => item.version), [1, 2, 3, 4, 5]);
  const prepare = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("../scripts/prepare-sites.mjs", import.meta.url), "utf8"));
  assert.match(prepare, /"db"/);
});

const sampleState = { clients: [], vastuCases: [], reportVersions: [], timelineEvents: [], caseDocuments: [], deliveryMilestones: [] };

test("backup preserves revision, hashes canonical state and validates dry-run import", async () => {
  const backup = await createStateBackup(sampleState, 19, "staging", "2026-08-10T00:00:00.000Z");
  assert.equal(backup.stateRevision, 19);
  assert.match(backup.stateSha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(await validateStateBackup(backup), backup);
  assert.deepEqual(backup.exclusions, { r2Bytes: true, secrets: true });
});

test("production backup envelopes remain offline, explicit and hash-verifiable", async () => {
  const backup = await createStateBackup(sampleState, 23, "production", "2026-08-10T01:00:00.000Z");
  assert.equal(backup.sourceEnvironment, "production");
  assert.equal((await validateStateBackup(backup)).stateRevision, 23);
  const script = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("../scripts/state-backup.mjs", import.meta.url), "utf8"));
  assert.match(script, /acknowledge-production-read-only/);
  assert.doesNotMatch(script, /fetch\(|persistState|R2\.put/);
});

test("backup validation rejects tampering, embedded bytes and secrets", async () => {
  const backup = await createStateBackup(sampleState, 0, "local");
  await assert.rejects(() => validateStateBackup({ ...backup, state: { ...backup.state, clients: [{ id: "tampered" }] } }), /hash/);
  await assert.rejects(() => createStateBackup({ ...sampleState, clients: [{ image: "data:image/png;base64,AAAA" }] }, 0, "local"), /embedded bytes/);
  await assert.rejects(() => createStateBackup({ ...sampleState, apiKey: "secret" }, 0, "local"), /secret-bearing/);
});
