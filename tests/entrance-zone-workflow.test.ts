import test from "node:test";
import assert from "node:assert/strict";
import { setAppState } from "../lib/store.ts";
import { activateLocalEntranceZoneCatalogV1 } from "../lib/entrance-zone-catalog-v1.ts";
import { confirmEntranceZones, finalizeEntranceZoneSuccessor, currentEntranceZones, EntranceZoneWorkflowError } from "../lib/entrance-zone-workflow.ts";
import type { EntranceZoneVersionRecord } from "../lib/domain.ts";
import type { AppState } from "../lib/store.ts";
import { createEmptyAppState } from "../lib/store.ts";

const owner = {
  id: "founder", fullName: "Founder", email: "founder@example.test",
  role: "SUPER_ADMIN" as const, color: "#000000", organisationId: "org", organisationCapability: "organisation_owner" as const
};

function createBaselineState({ floorB = false }: { floorB?: boolean } = {}) {
  const value = createEmptyAppState();
  value.clients.push({ id: "client", displayName: "TEST ONLY", city: "Test", source: "TEST", assignedSetterId: "founder", email: "test@example.invalid", phone: "+910000000000", stage: "QUALIFIED", recordVersion: 1, organisationId: "org" });
  value.vastuCases.push({ id: "case", caseNumber: "TEST-CASE", clientId: "client", projectId: "project", proposalId: "proposal", serviceType: "EXISTING_SPACE", status: "ORIENTATION_LOCKED", reportStatus: "DRAFT", orientationLocked: true, balanceApproved: true, fullPaymentApproved: true, organisationId: "org", recordVersion: 0 });
  value.projects.push({ id: "project", clientId: "client", activeCaseId: "case", propertyName: "TEST PROPERTY", status: "IN_PROGRESS", createdAt: "2026-01-01T00:00:00.000Z", organisationId: "org" });
  value.floorWorkspaces.push({ id: "floor-a", projectId: "project", caseId: "case", floorLabel: "Ground", status: "LOCKED", locked: true, evidenceUploads: [], organisationId: "org" });
  if (floorB) value.floorWorkspaces.push({ id: "floor-b", projectId: "project", caseId: "case", floorLabel: "First", status: "LOCKED", locked: true, evidenceUploads: [], organisationId: "org" });
  value.planVersions.push({ id: "plan-a", projectId: "project", caseId: "case", floorId: "floor-a", versionLabel: "Plan A", status: "CURRENT", protectedFileRef: "safe-plan", idempotencyKey: "plan-key-a", createdAt: "2026-01-01T00:00:00.000Z", organisationId: "org" });
  value.spatialEvidenceVersions.push({ id: "evidence-a", projectId: "project", caseId: "case", floorId: "floor-a", planVersionId: "plan-a", kind: "HAND_MARKED_PLAN", classification: "MARKED_32D_CHAKRA_V1", has32SectorChakra: true, protectedFileRef: "safe-32d", fullColour: true, status: "CURRENT", idempotencyKey: "evidence-key-a", createdAt: "2026-01-01T00:00:00.000Z", organisationId: "org" });
  if (floorB) value.planVersions.push({ id: "plan-b", projectId: "project", caseId: "case", floorId: "floor-b", versionLabel: "Plan B", status: "CURRENT", protectedFileRef: "safe-plan-b", idempotencyKey: "plan-key-b", createdAt: "2026-01-02T00:00:00.000Z", organisationId: "org" });
  if (floorB) value.spatialEvidenceVersions.push({ id: "evidence-b", projectId: "project", caseId: "case", floorId: "floor-b", planVersionId: "plan-b", kind: "HAND_MARKED_PLAN", classification: "MARKED_32D_CHAKRA_V1", has32SectorChakra: true, protectedFileRef: "safe-32d-b", fullColour: true, status: "CURRENT", idempotencyKey: "evidence-key-b", createdAt: "2026-01-02T00:00:00.000Z", organisationId: "org" });
  activateLocalEntranceZoneCatalogV1({ state: value, organisationId: "org", actorUserId: "founder", activatedAt: "2026-01-01T00:00:00.000Z" });
  return value;
}

function addLegacyCurrentEntrance(value: AppState, scope: "PROPERTY_MAIN_GATE" | "FLOOR_PRIMARY_ENTRANCE", floorId?: string) {
  const record: EntranceZoneVersionRecord = {
    id: `legacy-${scope.toLowerCase()}-${floorId ?? "property"}`,
    organisationId: "org", projectId: "project", caseId: "case", scope, floorId, planVersionId: "PROPERTY_SCOPED",
    marked32DEvidenceVersionId: "PROPERTY_SCOPED", methodologyVersionId: "legacy-method", methodologyContentHash: "sha256:aa", catalogVersionId: "legacy-catalog",
    catalogContentHash: "sha256:bb", zoneCode: "N1", zoneNameSnapshot: "North", classificationSnapshot: "OK-OK", ownerInterpretationHash: "sha256:00",
    status: "CURRENT", reason: "Legacy baseline", confirmedAt: "2026-01-01T00:00:00.000Z", confirmedByActorUserId: "founder",
    idempotencyKey: "legacy-key", requestHash: "sha256:legacy",
    updatedByActorUserId: "founder", createdByActorUserId: "founder"
  };
  value.entranceZoneVersions.unshift(record);
}

function makeFinalRecord(value: AppState, scope: "PROPERTY_MAIN_GATE" | "FLOOR_PRIMARY_ENTRANCE", floorId: string | undefined, zoneCode: string) {
  const entry: EntranceZoneVersionRecord = {
    id: `seed-final-${scope === "PROPERTY_MAIN_GATE" ? "main" : floorId}`,
    organisationId: "org", projectId: "project", caseId: "case",
    scope, floorId: floorId, planVersionId: "PROPERTY_SCOPED", marked32DEvidenceVersionId: "PROPERTY_SCOPED",
    methodologyVersionId: "legacy-method", methodologyContentHash: "sha256:aa",
    catalogVersionId: "legacy-catalog", catalogContentHash: "sha256:bb", zoneCode,
    zoneNameSnapshot: "Seed", classificationSnapshot: "OK-OK", ownerInterpretationHash: "sha256:00",
    status: "FINALIZED", confirmedAt: "2026-01-01T00:00:00.000Z", confirmedByActorUserId: "founder",
    idempotencyKey: "seed-key", requestHash: `seed-${scope}-${zoneCode}`,
    createdByActorUserId: "founder", updatedByActorUserId: "founder"
  };
  value.entranceZoneVersions.unshift(entry);
  return entry;
}

test("A. Main successor draft keeps finalized predecessor authoritative", () => {
  const value = createBaselineState();
  setAppState(value);
  const predecessor = makeFinalRecord(value, "PROPERTY_MAIN_GATE", undefined, "N1");
  const next = confirmEntranceZones({ caseId: "case", propertyMainGateZoneCode: "N3", reason: "update property entrance after review", idempotencyKey: "main-successor-a", expectedRecordVersion: 0, actor: owner, floorId: "floor-a", planVersionId: "plan-a", marked32EvidenceVersionId: "evidence-a" });
  assert.equal(next.propertyMainGate?.status, "DRAFT");
  assert.equal(next.propertyMainGate?.supersedesVersionId, predecessor.id);
  const { propertyMainGate } = currentEntranceZones(value, "case");
  assert.equal(propertyMainGate?.id, predecessor.id);
  assert.equal(propertyMainGate?.status, "FINALIZED");
});

test("B. Floor successor draft keeps finalized floor predecessor authoritative", () => {
  const value = createBaselineState();
  setAppState(value);
  const predecessor = makeFinalRecord(value, "FLOOR_PRIMARY_ENTRANCE", "floor-a", "E1");
  const next = confirmEntranceZones({ caseId: "case", floorId: "floor-a", planVersionId: "plan-a", marked32EvidenceVersionId: "evidence-a", floorGateZoneCode: "E2", reason: "update floor entrance classification", idempotencyKey: "floor-successor-b", expectedRecordVersion: 0, actor: owner });
  assert.equal(next.floorGate?.status, "DRAFT");
  assert.equal(next.floorGate?.supersedesVersionId, predecessor.id);
  const { floorGate } = currentEntranceZones(value, "case", "floor-a");
  assert.equal(floorGate?.id, predecessor.id);
  assert.equal(floorGate?.status, "FINALIZED");
});

test("C. Main successor successfully promoted; predecessor finalised then superseded", () => {
  const value = createBaselineState();
  setAppState(value);
  makeFinalRecord(value, "PROPERTY_MAIN_GATE", undefined, "N1");
  const next = confirmEntranceZones({ caseId: "case", propertyMainGateZoneCode: "N2", reason: "finalize main entrance", idempotencyKey: "main-successor-c", expectedRecordVersion: 0, actor: owner });
  const draft = next.propertyMainGate!;
  const r = finalizeEntranceZoneSuccessor({ caseId: "case", draftId: draft.id, idempotencyKey: "main-final-c", expectedRecordVersion: value.vastuCases[0].recordVersion, actor: owner });
  const { propertyMainGate } = currentEntranceZones(value, "case");
  assert.equal(propertyMainGate?.id, draft.id);
  assert.equal(propertyMainGate?.status, "FINALIZED");
  const predecessor = value.entranceZoneVersions.find((entry) => entry.id === draft.supersedesVersionId);
  assert.equal(predecessor?.status, "SUPERSEDED");
  assert.equal(r.replayed, false);
});

test("D. Floor successor successfully promoted; predecessor finalised then superseded", () => {
  const value = createBaselineState();
  setAppState(value);
  makeFinalRecord(value, "FLOOR_PRIMARY_ENTRANCE", "floor-a", "E1");
  const next = confirmEntranceZones({ caseId: "case", floorId: "floor-a", planVersionId: "plan-a", marked32EvidenceVersionId: "evidence-a", floorGateZoneCode: "E2", reason: "finalize floor entrance", idempotencyKey: "floor-successor-d", expectedRecordVersion: 0, actor: owner });
  const draft = next.floorGate!;
  const r = finalizeEntranceZoneSuccessor({ caseId: "case", draftId: draft.id, idempotencyKey: "floor-final-d", expectedRecordVersion: value.vastuCases[0].recordVersion, actor: owner });
  const { floorGate } = currentEntranceZones(value, "case", "floor-a");
  assert.equal(floorGate?.id, draft.id);
  assert.equal(floorGate?.status, "FINALIZED");
  const predecessor = value.entranceZoneVersions.find((entry) => entry.id === draft.supersedesVersionId);
  assert.equal(predecessor?.status, "SUPERSEDED");
  assert.equal(r.replayed, false);
});

test("E. Failed finalization leaves authority unchanged", () => {
  const value = createBaselineState();
  setAppState(value);
  const predecessor = makeFinalRecord(value, "PROPERTY_MAIN_GATE", undefined, "N1");
  const next = confirmEntranceZones({ caseId: "case", propertyMainGateZoneCode: "N2", reason: "failure path should keep existing authority when finalize request is invalid", idempotencyKey: "main-successor-e", expectedRecordVersion: 0, actor: owner });
  const draft = next.propertyMainGate!;
  assert.throws(() => finalizeEntranceZoneSuccessor({ caseId: "case", draftId: draft.id, idempotencyKey: "main-final-e", expectedRecordVersion: 999, actor: owner }), (error) => error instanceof EntranceZoneWorkflowError && error.statusCode === 409);
  assert.equal(draft.status, "DRAFT");
  const { propertyMainGate } = currentEntranceZones(value, "case");
  assert.equal(propertyMainGate?.id, predecessor.id);
  assert.equal(propertyMainGate?.status, "FINALIZED");
});

test("F. Stale expected record version blocks promotion", () => {
  const value = createBaselineState();
  setAppState(value);
  makeFinalRecord(value, "PROPERTY_MAIN_GATE", undefined, "N1");
  const next = confirmEntranceZones({ caseId: "case", propertyMainGateZoneCode: "N2", reason: "stale guard test needs strong rationale longer than twenty characters", idempotencyKey: "main-successor-f", expectedRecordVersion: 0, actor: owner });
  assert.throws(() => finalizeEntranceZoneSuccessor({ caseId: "case", draftId: next.propertyMainGate!.id, idempotencyKey: "main-final-f", expectedRecordVersion: 0, actor: owner }), (error) => error instanceof EntranceZoneWorkflowError && error.statusCode === 409);
  assert.equal(next.propertyMainGate?.status, "DRAFT");
  const { propertyMainGate } = currentEntranceZones(value, "case");
  assert.equal(propertyMainGate?.id, value.entranceZoneVersions.find((item) => item.status === "FINALIZED")?.id);
});

test("G. Finalization idempotent replay does not duplicate promotion", () => {
  const value = createBaselineState();
  setAppState(value);
  makeFinalRecord(value, "PROPERTY_MAIN_GATE", undefined, "N1");
  const next = confirmEntranceZones({ caseId: "case", propertyMainGateZoneCode: "N3", reason: "idempotent scenario requires a longer explanation for change reason", idempotencyKey: "main-successor-g", expectedRecordVersion: 0, actor: owner });
  const draft = next.propertyMainGate!;
  const first = finalizeEntranceZoneSuccessor({ caseId: "case", draftId: draft.id, idempotencyKey: "main-final-g", expectedRecordVersion: value.vastuCases[0].recordVersion, actor: owner });
  const second = finalizeEntranceZoneSuccessor({ caseId: "case", draftId: draft.id, idempotencyKey: "main-final-g", expectedRecordVersion: value.vastuCases[0].recordVersion, actor: owner });
  assert.equal(first.replayed, false);
  assert.equal(second.replayed, true);
  const finals = value.entranceZoneVersions.filter((item) => item.scope === "PROPERTY_MAIN_GATE" && item.status === "FINALIZED");
  assert.equal(finals.length, 1);
  assert.equal(finals[0]!.id, draft.id);
});

test("H. Main and floor successors do not cross-effect each other", () => {
  const value = createBaselineState({ floorB: true });
  setAppState(value);
  const mainSeed = makeFinalRecord(value, "PROPERTY_MAIN_GATE", undefined, "N1");
  const floorSeed = makeFinalRecord(value, "FLOOR_PRIMARY_ENTRANCE", "floor-a", "E1");
  const mainDraft = confirmEntranceZones({ caseId: "case", propertyMainGateZoneCode: "N2", reason: "cross-scope isolation", idempotencyKey: "main-successor-h1", expectedRecordVersion: 0, actor: owner });
  finalizeEntranceZoneSuccessor({ caseId: "case", draftId: mainDraft.propertyMainGate!.id, idempotencyKey: "main-final-h1", expectedRecordVersion: value.vastuCases[0].recordVersion, actor: owner });
  assert.equal(floorSeed.status, "FINALIZED");
  assert.equal(currentEntranceZones(value, "case", "floor-a").floorGate?.id, floorSeed.id);
  const floorDraft = confirmEntranceZones({ caseId: "case", floorId: "floor-a", planVersionId: "plan-a", marked32EvidenceVersionId: "evidence-a", floorGateZoneCode: "E3", reason: "cross-scope isolation floor", idempotencyKey: "floor-successor-h2", expectedRecordVersion: value.vastuCases[0].recordVersion, actor: owner });
  finalizeEntranceZoneSuccessor({ caseId: "case", draftId: floorDraft.floorGate!.id, idempotencyKey: "floor-final-h2", expectedRecordVersion: value.vastuCases[0].recordVersion, actor: owner });
  assert.equal(mainSeed.status, "SUPERSEDED");
  assert.equal(currentEntranceZones(value, "case").propertyMainGate?.id, mainDraft.propertyMainGate!.id);
  assert.equal(currentEntranceZones(value, "case", "floor-a").floorGate?.id, floorDraft.floorGate!.id);
});

test("I. Floor successor does not affect other floor", () => {
  const value = createBaselineState({ floorB: true });
  setAppState(value);
  const floorASeed = makeFinalRecord(value, "FLOOR_PRIMARY_ENTRANCE", "floor-a", "E1");
  const floorBSeed = makeFinalRecord(value, "FLOOR_PRIMARY_ENTRANCE", "floor-b", "E3");
  const draftA = confirmEntranceZones({ caseId: "case", floorId: "floor-a", planVersionId: "plan-a", marked32EvidenceVersionId: "evidence-a", floorGateZoneCode: "E2", reason: "floor A isolation requires explicit long rationale for the change decision", idempotencyKey: "floor-successor-i", expectedRecordVersion: 0, actor: owner });
  finalizeEntranceZoneSuccessor({ caseId: "case", draftId: draftA.floorGate!.id, idempotencyKey: "floor-final-i", expectedRecordVersion: value.vastuCases[0].recordVersion, actor: owner });
  assert.equal(floorASeed.status, "SUPERSEDED");
  assert.equal(floorBSeed.status, "FINALIZED");
  assert.equal(currentEntranceZones(value, "case", "floor-b").floorGate?.id, floorBSeed.id);
});

test("J. Competing active draft for same entrance scope is rejected", () => {
  const value = createBaselineState();
  setAppState(value);
  makeFinalRecord(value, "PROPERTY_MAIN_GATE", undefined, "N1");
  confirmEntranceZones({ caseId: "case", propertyMainGateZoneCode: "N2", reason: "first draft open to establish active draft guarding this same scope", idempotencyKey: "main-successor-j1", expectedRecordVersion: 0, actor: owner });
  assert.throws(() => confirmEntranceZones({ caseId: "case", propertyMainGateZoneCode: "N3", reason: "second draft rejected due to existing active draft same scope", idempotencyKey: "main-successor-j2", expectedRecordVersion: 1, actor: owner }), (error) => error instanceof EntranceZoneWorkflowError && error.statusCode === 409);
});

test("K. Legacy CURRENT successor promotion", () => {
  const value = createBaselineState();
  setAppState(value);
  addLegacyCurrentEntrance(value, "PROPERTY_MAIN_GATE");
  const successor = confirmEntranceZones({ caseId: "case", propertyMainGateZoneCode: "N2", reason: "legacy replacement requires a sufficiently long explanation string", idempotencyKey: "main-successor-k1", expectedRecordVersion: 0, actor: owner });
  const legacy = value.entranceZoneVersions.find((entry) => entry.status === "CURRENT")!;
  assert.equal(currentEntranceZones(value, "case").propertyMainGate?.id, legacy.id);
  finalizeEntranceZoneSuccessor({ caseId: "case", draftId: successor.propertyMainGate!.id, idempotencyKey: "main-final-k2", expectedRecordVersion: value.vastuCases[0].recordVersion, actor: owner });
  const promoted = currentEntranceZones(value, "case").propertyMainGate;
  assert.equal(promoted?.id, successor.propertyMainGate!.id);
  assert.equal(promoted?.status, "FINALIZED");
  assert.equal(legacy.status, "SUPERSEDED");
});

test("L. Draft creation does not create invalidation events", () => {
  const value = createBaselineState();
  setAppState(value);
  const existingInvalidationCount = value.dependencyInvalidations.length;
  const draft = confirmEntranceZones({ caseId: "case", propertyMainGateZoneCode: "N2", reason: "draft invalidation guard", idempotencyKey: "main-successor-l", expectedRecordVersion: 0, actor: owner });
  assert.equal(value.dependencyInvalidations.length, existingInvalidationCount);
  assert.equal(value.dependencyInvalidations.filter((item) => item.sourceVersionId === draft.propertyMainGate?.id).length, 0);
});
