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
    if (/CREATE TABLE IF NOT EXISTS optin_leads/i.test(sql)) { this.tables.add("optin_leads"); this.columns.set("optin_leads", new Set(["id", "identity_key", "unique_client_id", "payload", "imported_at", "last_seen_at"])); }
    if (/CREATE TABLE IF NOT EXISTS inbound_optin_events/i.test(sql)) { this.tables.add("inbound_optin_events"); this.columns.set("inbound_optin_events", new Set(["event_id", "occurred_at", "source", "payload_hash", "identity_hash", "received_at", "outcome", "submission_count"])); }
    if (/CREATE TABLE IF NOT EXISTS organisations/i.test(sql)) this.tables.add("organisations");
    if (/CREATE TABLE IF NOT EXISTS organisation_memberships/i.test(sql)) this.tables.add("organisation_memberships");
    if (/CREATE TABLE IF NOT EXISTS workflow_policies/i.test(sql)) this.tables.add("workflow_policies");
    if (/CREATE TABLE IF NOT EXISTS approval_policies/i.test(sql)) this.tables.add("approval_policies");
    if (/CREATE TABLE IF NOT EXISTS audit_events/i.test(sql)) this.tables.add("audit_events");
    if (/CREATE TABLE IF NOT EXISTS audit_events/i.test(sql)) this.columns.set("audit_events", new Set(["id", "organisation_id", "actor_user_id", "actor_display_name", "action", "entity_type", "entity_id", "case_id", "project_id", "floor_id", "before_hash", "after_hash", "reason", "request_id", "idempotency_key", "occurred_at", "previous_audit_hash", "event_hash"]));
    if (/CREATE TABLE IF NOT EXISTS user_access_requests/i.test(sql)) this.tables.add("user_access_requests");
    if (/CREATE TABLE IF NOT EXISTS ownership_transfer_requests/i.test(sql)) this.tables.add("ownership_transfer_requests");
    if (/CREATE TABLE IF NOT EXISTS final_pdf_artifacts/i.test(sql)) this.tables.add("final_pdf_artifacts");
    if (/CREATE TABLE IF NOT EXISTS final_pdf_artifact_events/i.test(sql)) this.tables.add("final_pdf_artifact_events");
    if (/CREATE TABLE IF NOT EXISTS external_sources/i.test(sql)) this.tables.add("external_sources");
    if (/CREATE TABLE IF NOT EXISTS external_client_links/i.test(sql)) this.tables.add("external_client_links");
    if (/CREATE TABLE IF NOT EXISTS integration_events/i.test(sql)) this.tables.add("integration_events");
    if (/CREATE TABLE IF NOT EXISTS integration_outbox/i.test(sql)) this.tables.add("integration_outbox");
    if (/CREATE TABLE IF NOT EXISTS integration_conflicts/i.test(sql)) this.tables.add("integration_conflicts");
    if (/CREATE TABLE IF NOT EXISTS integration_cursors/i.test(sql)) this.tables.add("integration_cursors");
    for (const table of ["lead_profile_versions", "media_assets", "media_asset_versions", "secure_access_grants", "communication_preparations", "qualification_form_definitions", "qualification_invitations", "qualification_response_versions", "prospective_projects", "founder_review_bookings", "zoom_meeting_bindings", "founder_reminder_tasks", "founder_commercial_policy_versions", "founder_commercial_legal_policies", "founder_proposal_template_versions", "founder_proposal_versions", "founder_proposal_approvals", "founder_proposal_artifacts", "founder_proposal_grants", "founder_proposal_responses", "founder_commercial_payment_confirmations", "founder_balance_deadlines", "founder_commercial_invoices", "founder_commercial_audit_events", "founder_statutory_policy_versions", "founder_billing_profile_versions", "founder_statutory_sequence_reservations", "founder_statutory_documents"]) {
      if (new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`, "i").test(sql)) this.tables.add(table);
    }
    if (/ALTER TABLE case_file_assets ADD COLUMN organisation_id/i.test(sql)) this.columns.get("case_file_assets").add("organisation_id");
    if (/CREATE TABLE IF NOT EXISTS founder_commercial_policy_versions/i.test(sql)) this.columns.set("founder_commercial_policy_versions", new Set(["id"]));
    if (/CREATE TABLE IF NOT EXISTS founder_statutory_policy_versions/i.test(sql)) this.columns.set("founder_statutory_policy_versions", new Set(["id"]));
    if (/CREATE TABLE IF NOT EXISTS founder_billing_profile_versions/i.test(sql)) this.columns.set("founder_billing_profile_versions", new Set(["id"]));
    if (/CREATE TABLE IF NOT EXISTS zoom_meeting_bindings/i.test(sql)) this.columns.set("zoom_meeting_bindings", new Set(["id"]));
    const addColumn = sql.match(/ALTER TABLE (optin_leads|inbound_optin_events|audit_events|founder_commercial_policy_versions|founder_statutory_policy_versions|founder_billing_profile_versions|zoom_meeting_bindings) ADD COLUMN (\w+)/i);
    if (addColumn) this.columns.get(addColumn[1])?.add(addColumn[2]);
    const index = sql.match(/CREATE INDEX IF NOT EXISTS (\w+)/i); if (index) this.indexes.add(index[1]);
    if (/INSERT OR IGNORE INTO schema_migrations/i.test(sql)) this.applied.add(Number(values[0]));
    return { meta: { changes: 1 }, success: true };
  }
  async all(sql) {
    if (/SELECT version FROM schema_migrations/i.test(sql)) return { results: [...this.applied].sort((a, b) => a - b).map((version) => ({ version })), meta: {} };
    if (/PRAGMA table_info\(app_state_snapshot\)/i.test(sql)) return { results: [...(this.columns.get("app_state_snapshot") ?? [])].map((name) => ({ name })), meta: {} };
    if (/PRAGMA table_info\(case_file_assets\)/i.test(sql)) return { results: [...(this.columns.get("case_file_assets") ?? [])].map((name) => ({ name })), meta: {} };
    return { results: [], meta: {} };
  }
}

test("v1 through v16 migrate an empty database and repeat without drift", async () => {
  const db = new FakeD1();
  await migrateD1(db);
  assert.deepEqual([...db.applied], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  assert.ok(db.tables.has("app_state_snapshot"));
  assert.ok(db.tables.has("case_file_assets"));
  assert.ok(db.tables.has("staff_role_assignments"));
  assert.ok(db.tables.has("staff_role_assignment_audit"));
  assert.ok(db.tables.has("optin_leads"));
  assert.ok(db.tables.has("inbound_optin_events"));
  for (const table of ["organisations", "organisation_memberships", "workflow_policies", "approval_policies", "audit_events", "user_access_requests", "ownership_transfer_requests", "final_pdf_artifacts", "final_pdf_artifact_events", "external_sources", "external_client_links", "integration_events", "integration_outbox", "integration_conflicts", "integration_cursors"]) assert.ok(db.tables.has(table));
  for (const table of ["lead_profile_versions", "media_assets", "media_asset_versions", "secure_access_grants", "communication_preparations", "qualification_form_definitions", "qualification_invitations", "qualification_response_versions", "prospective_projects", "founder_review_bookings", "zoom_meeting_bindings", "founder_reminder_tasks", "founder_commercial_policy_versions", "founder_commercial_legal_policies", "founder_proposal_template_versions", "founder_proposal_versions", "founder_proposal_approvals", "founder_proposal_artifacts", "founder_proposal_grants", "founder_proposal_responses", "founder_commercial_payment_confirmations", "founder_balance_deadlines", "founder_commercial_invoices", "founder_commercial_audit_events", "founder_statutory_policy_versions", "founder_billing_profile_versions", "founder_statutory_sequence_reservations", "founder_statutory_documents"]) assert.ok(db.tables.has(table));
  assert.ok(db.columns.get("app_state_snapshot").has("revision"));
  assert.ok(db.columns.get("case_file_assets").has("organisation_id"));
  for (const column of ["organisation_id", "external_source_id", "source_record_type", "source_record_id", "external_client_code", "sync_status", "last_synced_at", "source_event_id", "record_version"]) assert.ok(db.columns.get("optin_leads").has(column));
  for (const column of ["organisation_id", "external_source_id", "source_record_type", "source_record_id", "external_client_code", "sync_status", "last_synced_at", "record_version"]) assert.ok(db.columns.get("inbound_optin_events").has(column));
  for (const column of ["source_system", "source_record_type", "source_record_id", "integration_event_id"]) assert.ok(db.columns.get("audit_events").has(column));
  for (const column of ["operational_place_of_supply_selection", "receipt_voucher_trigger", "receipt_voucher_sla_minutes", "proforma_policy", "tax_invoice_trigger", "refund_policy", "correction_posture", "purchase_side_debit_notes_in_scope", "opex_tracking_scope", "accountant_approved_service_types_json"]) assert.ok(db.columns.get("founder_statutory_policy_versions").has(column));
  for (const column of ["active_place_of_supply_policy", "place_of_supply_display", "outside_india_billing_label", "tax_treatment"]) assert.ok(db.columns.get("founder_statutory_policy_versions").has(column));
  assert.ok(db.columns.get("founder_commercial_policy_versions").has("refund_policy"));
  assert.ok(db.columns.get("founder_billing_profile_versions").has("service_location"));
  for (const column of ["host_user_email", "oauth_connection_type", "scope_snapshot_json"]) assert.ok(db.columns.get("zoom_meeting_bindings").has(column));
  for (const index of ["idx_case_file_assets_floor", "idx_case_file_assets_scope", "idx_case_file_assets_org_scope", "idx_inbound_optin_events_identity", "idx_inbound_optin_events_received", "idx_inbound_optin_events_external", "idx_optin_leads_external_link", "idx_staff_role_audit_target_time", "idx_audit_org_time", "idx_audit_entity", "idx_audit_integration_source", "idx_access_requests_target_state", "idx_final_pdf_scope", "idx_final_pdf_events_scope", "idx_external_sources_org_status", "idx_external_client_links_org_client", "idx_external_client_links_external_code", "idx_integration_events_org_time", "idx_integration_events_record", "idx_integration_outbox_pending", "idx_integration_conflicts_open"]) assert.ok(db.indexes.has(index));
  const before = JSON.stringify({ applied: [...db.applied], tables: [...db.tables], indexes: [...db.indexes], revision: db.revision });
  await migrateD1(db);
  assert.equal(JSON.stringify({ applied: [...db.applied], tables: [...db.tables], indexes: [...db.indexes], revision: db.revision }), before);
});

test("production-like v2 schema adopts migration markers without changing revision", async () => {
  const db = new FakeD1({ revisionColumn: true, revision: 37, applied: [1] });
  await migrateD1(db);
  assert.equal(db.revision, 37);
  assert.deepEqual([...db.applied], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  assert.ok(db.tables.has("case_file_assets"));
});

test("migration list is deterministic and Sites packages the db directory", async () => {
  assert.deepEqual(d1Migrations.map((item) => item.version), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
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
