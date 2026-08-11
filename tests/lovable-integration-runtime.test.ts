import test from "node:test";
import assert from "node:assert/strict";
import { parseLovableIntegrationEvent, type LovableIntegrationEvent } from "../lib/lovable-integration-contract.ts";
import { reconcileExternalIdentity } from "../lib/identity-reconciliation.ts";
import { assertLovableEnvironmentBinding, integrationEnvironmentReadiness } from "../lib/lovable-wrapper.server.ts";
import { buildCanonicalLeadProjection, buildOutboxRecord, safeReconcileProjection, assertOutboxTransition } from "../lib/integration-outbox.ts";

const uuid = "11111111-1111-4111-8111-111111111111";
const baseEvent = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: "uchit-lovable/v1", eventId: uuid, sourceSystem: "LOVABLE", sourceEnvironment: "STAGING",
  sourceRecordType: "APPLICATION", sourceRecordId: "app-1", eventType: "LEAD_UPSERT", occurredAt: "2026-08-12T08:00:00.000Z",
  actor: { kind: "SOURCE_SYSTEM" }, payload: { fullName: "Synthetic Lead", email: "lead@example.com", status: "new" }, ...overrides
});

test("valid Lovable event is strict, normalized and source-bound", () => {
  const parsed = parseLovableIntegrationEvent(baseEvent(), Date.parse("2026-08-12T08:01:00.000Z"));
  assert.equal(parsed.sourceEnvironment, "STAGING");
  assert.equal((parsed.payload as { fullName?: string }).fullName, "Synthetic Lead");
  assert.throws(() => parseLovableIntegrationEvent({ ...baseEvent(), payload: { fullName: "Synthetic Lead", email: "lead@example.com", dob: "2000-01-01" } }, Date.parse("2026-08-12T08:01:00.000Z")), /unsupported field/i);
  assert.throws(() => parseLovableIntegrationEvent({ ...baseEvent(), sourceRecordType: "LEAD_ACTIVITY" }, Date.parse("2026-08-12T08:01:00.000Z")), /does not match/i);
  assert.throws(() => parseLovableIntegrationEvent({ ...baseEvent(), ownerId: "attacker" }, Date.parse("2026-08-12T08:01:00.000Z")), /unsupported field/i);
});

test("identity reconciliation is organisation-scoped and ambiguous matches fail closed", () => {
  const clients = [
    { id: "c1", organisationId: "org-a", displayName: "One", email: "lead@example.com", phone: "+919876543210" },
    { id: "c2", organisationId: "org-a", displayName: "Two", email: "other@example.com", phone: "+919876543211" },
    { id: "foreign", organisationId: "org-b", displayName: "Foreign", email: "lead@example.com", phone: "+919876543210" }
  ];
  assert.equal(reconcileExternalIdentity({ organisationId: "org-a", email: "LEAD@example.com", clients }).status, "EXACT_MATCH");
  assert.equal(reconcileExternalIdentity({ organisationId: "org-a", email: "missing@example.com", clients }).status, "NEW_CLIENT");
  assert.equal(reconcileExternalIdentity({ organisationId: "org-a", email: "lead@example.com", phone: "+919876543211", clients }).status, "REVIEW_REQUIRED");
  assert.equal(reconcileExternalIdentity({ organisationId: "org-a", email: "lead@example.com", clients: clients.slice(2) }).status, "NEW_CLIENT");
});

test("outbox and canonical projections expose only safe deterministic fields", () => {
  const projection = buildCanonicalLeadProjection({ organisationId: "org-a", clientId: "c1", pipelineStage: "CONTACTED", recordVersion: 4, globalRevision: 8, changedAt: "2026-08-12T08:00:00Z", externalSourceId: "src-staging" });
  assert.equal("email" in projection, false);
  assert.equal(projection.recordVersion, 4);
  const outbox = buildOutboxRecord({ id: "o1", organisationId: "org-a", externalSourceId: "src-staging", targetSystem: "LOVABLE", entityType: "CLIENT", entityId: "c1", eventType: "CANONICAL_PROJECTION", canonicalRevision: 8, payloadHash: "hash", now: "2026-08-12T08:00:00Z" });
  assert.equal(outbox.status, "PENDING");
  assertOutboxTransition("PENDING", "SENT");
  assert.throws(() => assertOutboxTransition("SENT", "PENDING"), /Invalid integration outbox transition/);
  const reconcile = safeReconcileProjection({ organisationId: "org-a", entityType: "CLIENT", entityId: "c1", globalRevision: 8 });
  assert.deepEqual(Object.keys(reconcile).sort(), ["entityId", "entityType", "globalRevision", "organisationId", "recordVersion", "syncStatus"]);
});

test("environment binding and readiness are fail-closed", () => {
  const config = { enabled: true, activated: false, environment: "STAGING" as const, sourceKey: "lovable-staging", secret: "not-used", db: {} as never };
  assert.equal(integrationEnvironmentReadiness(config).ready, false);
  assert.doesNotThrow(() => assertLovableEnvironmentBinding({ sourceEnvironment: "STAGING" }, config, "lovable-staging"));
  assert.throws(() => assertLovableEnvironmentBinding({ sourceEnvironment: "PREVIEW" }, config), /environment binding mismatch/i);
});

test("canonical event shape remains free of client-owned decisions", () => {
  const event = parseLovableIntegrationEvent(baseEvent(), Date.parse("2026-08-12T08:01:00.000Z")) as LovableIntegrationEvent;
  assert.equal("qualificationDecision" in event.payload, false);
  assert.equal("payment" in event.payload, false);
  assert.equal("caseId" in event.payload, false);
});
