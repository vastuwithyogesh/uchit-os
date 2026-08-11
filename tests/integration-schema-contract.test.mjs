import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [schema, migrations, domain, inboundRoute] = await Promise.all([
  readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
  readFile(new URL("../db/migrations.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/domain.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/optin-leads/events/route.ts", import.meta.url), "utf8")
]);

test("v9 declares a dormant, organisation-scoped integration ledger", () => {
  for (const table of ["external_sources", "external_client_links", "integration_events", "integration_outbox", "integration_conflicts", "integration_cursors"]) {
    assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
    assert.match(migrations, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(migrations, /version: 9/);
  assert.match(migrations, /ALTER TABLE optin_leads ADD COLUMN organisation_id TEXT/);
  assert.match(migrations, /ALTER TABLE inbound_optin_events ADD COLUMN external_source_id TEXT/);
  assert.match(migrations, /ALTER TABLE audit_events ADD COLUMN integration_event_id TEXT/);
});

test("integration schema preserves replay, scope, conflict and delivery controls", () => {
  assert.match(schema, /UNIQUE \(external_source_id,event_id\)/);
  assert.match(schema, /UNIQUE \(organisation_id,idempotency_key\)/);
  assert.match(schema, /UNIQUE \(external_source_id,source_record_type,source_record_id\)/);
  assert.match(schema, /organisation_id TEXT NOT NULL/);
  assert.match(schema, /status TEXT NOT NULL CHECK \(status IN \('REVIEW_REQUIRED','ACCEPT_CANONICAL','ACCEPT_INCOMING','RESOLVED'\)\)/);
  assert.match(schema, /status TEXT NOT NULL CHECK \(status IN \('PENDING','SENT','FAILED','DEAD_LETTER'\)\)/);
  assert.doesNotMatch(schema, /CREATE TABLE IF NOT EXISTS integration_events[\s\S]*?payload TEXT NOT NULL/);
});

test("domain contracts are additive and existing provider-neutral inbound route remains dormant-compatible", () => {
  for (const name of ["ExternalSourceRecord", "ExternalClientLinkRecord", "IntegrationEventRecord", "IntegrationOutboxRecord", "IntegrationConflictRecord", "IntegrationCursorRecord"]) {
    assert.match(domain, new RegExp(`interface ${name}`));
  }
  for (const field of ["externalSourceId", "sourceRecordType", "sourceRecordId", "externalClientCode", "syncStatus", "lastSyncedAt"]) assert.match(domain, new RegExp(field));
  assert.match(inboundRoute, /OPTIN_WEBHOOK_SECRET/);
  assert.match(inboundRoute, /ingestInboundOptinEvent/);
});
