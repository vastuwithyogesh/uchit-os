import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { approveAouDisplayCopy, assertAouDirectionGroups, AOU_SHEET_RANGE, AOU_SHEET_RANGE_HASH, AOU_WORKBOOK_CONTENT_HASH, getAouReadiness, initializeCanonicalAouSource, saveAouDisplayDraft, selectAouSnapshotForVerdicts } from "../lib/aou-methodology.ts";
import { source } from "./helpers/source-contracts.mjs";

const canonical = JSON.parse(fs.readFileSync(new URL("../data/aou-master.v1.json", import.meta.url), "utf8"));

test("canonical AOU source is exact, versioned and complete", () => {
  assert.equal(canonical.sheet, "aou");
  assert.equal(canonical.range, "A1:I6");
  assert.equal(canonical.workbookContentHash, AOU_WORKBOOK_CONTENT_HASH);
  assert.equal(canonical.rangeHash, AOU_SHEET_RANGE_HASH);
  assert.equal(AOU_SHEET_RANGE, "aou!A1:I6");
  assert.deepEqual(canonical.rows.map((row) => row.element), ["Earth", "Water", "Fire", "Air", "Space"]);
  assert.equal(assertAouDirectionGroups(), true);
});

test("AOU stays separate from Utility and requires exact approved source binding", () => {
  const body = source("lib/aou-methodology.ts");
  assert.match(body, /BLOCKED_METHOD_INPUT/);
  assert.match(body, /sourceWorkbookHash/);
  assert.match(body, /sourceRangeHash/);
  assert.match(body, /selectedRows/);
  assert.match(body, /appendixRows/);
  assert.doesNotMatch(body, /remedy|recommendation|priority|sequence/i);
  const state = { aouMethodologyVersions: [], aouReferenceRows: [] };
  assert.equal(getAouReadiness(state, "org").ready, false);
  assert.equal(getAouReadiness(state, "org").status, "BLOCKED_METHOD_INPUT");
});

test("explicit AOU groups are the only direction expansion and reject semantic guessing", () => {
  const groups = canonical.explicitDirectionGroups;
  assert.deepEqual(groups.Water, ["NNW", "N", "NNE", "NE"]);
  assert.deepEqual(groups.Air, ["ENE", "E", "ESE"]);
  assert.deepEqual(groups.Fire, ["SE", "SSE", "S"]);
  assert.deepEqual(groups.Earth, ["SSW", "SW"]);
  assert.deepEqual(groups.Space, ["WSW", "W", "WNW", "NW"]);
  assert.equal(new Set(Object.values(groups).flat()).size, 16);
  assert.match(source("lib/aou-methodology.ts"), /unmapped|unambiguously|No direction normalization/i);
});

const founder = { id: "founder-1", fullName: "Founder", email: "founder@example.test", role: "SUPER_ADMIN", color: "#111", organisationId: "org-1", organisationCapability: "organisation_owner" };
const state = () => ({ aouMethodologyVersions: [], aouReferenceRows: [], reportVersions: [], vastuCases: [], dependencyInvalidations: [] });

test("Founder initializes exact raw rows once and display edits never mutate the source layer", () => {
  const appState = state();
  const first = initializeCanonicalAouSource({ state: appState, organisationId: "org-1", actor: founder, expectedRecordVersion: 0, idempotencyKey: "aou-source-stable-key", reason: "Activate the exact approved canonical workbook range." });
  assert.equal(first.replayed, false);
  assert.equal(first.rows.length, 5);
  assert.equal(first.rows[0].sourceCells.Element, "Earth");
  assert.equal(first.rows[0].sourceCellReferences.Element, "aou!A2");
  assert.equal(first.rows[0].sourceCellReferences.Objects, "aou!I2");
  assert.equal(getAouReadiness(appState, "org-1").ready, true);
  const retry = initializeCanonicalAouSource({ state: appState, organisationId: "org-1", actor: founder, expectedRecordVersion: 0, idempotencyKey: "aou-source-stable-key", reason: "Activate the exact approved canonical workbook range." });
  assert.equal(retry.replayed, true);
  assert.equal(appState.aouReferenceRows.length, 5);

  const row = first.rows[0];
  const rawBefore = JSON.stringify(row.sourceCells);
  const draft = saveAouDisplayDraft({ state: appState, organisationId: "org-1", actor: founder, rowId: row.id,
    fields: { attributes: "Stationary, stability, solid, heavy, storage, owners' area." }, cleanupOnlyConfirmed: true,
    meaningChangeConfirmed: false, reason: "Prepare punctuation and grammar cleanup for Founder review.",
    idempotencyKey: "aou-earth-draft-stable", expectedRecordVersion: 1 });
  assert.equal(draft.row.displayCopy.status, "DRAFT");
  assert.equal(JSON.stringify(row.sourceCells), rawBefore);
  assert.equal(saveAouDisplayDraft({ state: appState, organisationId: "org-1", actor: founder, rowId: row.id,
    fields: { attributes: "ignored on replay" }, cleanupOnlyConfirmed: true, meaningChangeConfirmed: false,
    reason: "Prepare punctuation and grammar cleanup for Founder review.", idempotencyKey: "aou-earth-draft-stable", expectedRecordVersion: 1 }).replayed, true);
  assert.equal(JSON.stringify(row.sourceCells), rawBefore);
});

test("only Founder-approved display copy enters a deterministic same-version snapshot", () => {
  const appState = state();
  const { version, rows } = initializeCanonicalAouSource({ state: appState, organisationId: "org-1", actor: founder, expectedRecordVersion: 0, idempotencyKey: "aou-source-selection-key", reason: "Activate the exact approved canonical workbook range." });
  const earth = rows.find((row) => row.element === "Earth");
  const sourceSnapshot = selectAouSnapshotForVerdicts({ state: appState, organisationId: "org-1", actor: founder, methodologyVersionId: version.id, verdictContexts: [{ element: "Earth", directionSet: ["SSW", "SW"] }] });
  assert.equal(sourceSnapshot.selectedRows[0].copyLayer, "SOURCE");
  assert.equal(sourceSnapshot.selectedRows[0].displayCopyStatus, "DRAFT");
  assert.equal(sourceSnapshot.appendixRows.length, 5);
  assert.equal(sourceSnapshot.methodologyVersionId, version.id);
  assert.equal(sourceSnapshot.sourceVersion, "uchit-aou/v1");

  saveAouDisplayDraft({ state: appState, organisationId: "org-1", actor: founder, rowId: earth.id,
    fields: { attributes: "Stationary, stability, solid, heavy, storage, owners' area." }, cleanupOnlyConfirmed: true,
    meaningChangeConfirmed: false, reason: "Prepare punctuation and grammar cleanup for Founder review.", idempotencyKey: "aou-earth-draft-approve", expectedRecordVersion: 1 });
  const approved = approveAouDisplayCopy({ state: appState, organisationId: "org-1", actor: founder, rowId: earth.id,
    reason: "Founder confirms this display copy changes presentation only.", idempotencyKey: "aou-earth-approval-key", expectedRecordVersion: 2 });
  assert.equal(approved.row.displayCopy.status, "APPROVED");
  assert.equal(approved.row.displayCopy.approvalReason, "Founder confirms this display copy changes presentation only.");
  assert.equal(approveAouDisplayCopy({ state: appState, organisationId: "org-1", actor: founder, rowId: earth.id,
    reason: "Founder confirms this display copy changes presentation only.", idempotencyKey: "aou-earth-approval-key", expectedRecordVersion: 2 }).replayed, true);
  const displaySnapshot = selectAouSnapshotForVerdicts({ state: appState, organisationId: "org-1", actor: founder, methodologyVersionId: version.id, verdictContexts: [{ element: "Earth", directionSet: ["SSW"] }] });
  assert.equal(displaySnapshot.selectedRows[0].copyLayer, "APPROVED_DISPLAY");
  assert.equal(displaySnapshot.selectedRows[0].attributes, "Stationary, stability, solid, heavy, storage, owners' area.");
  assert.equal(displaySnapshot.appendixRows.find((row) => row.element === "Earth").copyLayer, "APPROVED_DISPLAY");
  assert.notEqual(displaySnapshot.snapshotHash, sourceSnapshot.snapshotHash);
});

test("AOU fails closed on tampering, ambiguity, semantic-change declaration and wrong actor scope", () => {
  const appState = state();
  const { version, rows } = initializeCanonicalAouSource({ state: appState, organisationId: "org-1", actor: founder, expectedRecordVersion: 0, idempotencyKey: "aou-source-negative-key", reason: "Activate the exact approved canonical workbook range." });
  const earth = rows.find((row) => row.element === "Earth");
  assert.throws(() => saveAouDisplayDraft({ state: appState, organisationId: "org-1", actor: founder, rowId: earth.id,
    fields: { attributes: "Meaning changed" }, cleanupOnlyConfirmed: true, meaningChangeConfirmed: true,
    reason: "This is intentionally classified as a semantic change.", idempotencyKey: "aou-semantic-change", expectedRecordVersion: 1 }), /new AOU methodology version/);
  assert.throws(() => selectAouSnapshotForVerdicts({ state: appState, organisationId: "org-1", actor: founder, methodologyVersionId: version.id, verdictContexts: [{ element: "Earth", directionSet: ["N"] }] }), /missing or ambiguous/);
  assert.throws(() => saveAouDisplayDraft({ state: appState, organisationId: "org-1", actor: { ...founder, role: "ADMIN" }, rowId: earth.id,
    fields: { attributes: "Copy" }, cleanupOnlyConfirmed: true, meaningChangeConfirmed: false,
    reason: "Attempt from a non-Founder actor must fail closed.", idempotencyKey: "aou-wrong-role-key", expectedRecordVersion: 1 }), /Founder organisation owner/);
  earth.sourceCells.Attributes = "tampered";
  assert.equal(getAouReadiness(appState, "org-1").status, "BLOCKED_METHOD_INPUT");
});

test("approved copy invalidates only dependent drafts and preserves released report bytes and hashes", () => {
  const appState = state();
  const { version, rows } = initializeCanonicalAouSource({ state: appState, organisationId: "org-1", actor: founder, expectedRecordVersion: 0, idempotencyKey: "aou-source-invalidation-key", reason: "Activate the exact approved canonical workbook range." });
  const earth = rows.find((row) => row.element === "Earth");
  const snapshot = selectAouSnapshotForVerdicts({ state: appState, organisationId: "org-1", actor: founder, methodologyVersionId: version.id, verdictContexts: [{ element: "Earth", directionSet: ["SW"] }] });
  appState.vastuCases.push({ id: "case-1", organisationId: "org-1", projectId: "project-1" });
  const artifact = { aouReferenceSnapshot: snapshot, contentHash: "frozen-report-hash", immutable: true };
  appState.reportVersions.push({ id: "draft-report", organisationId: "org-1", caseId: "case-1", floorId: "floor-1", status: "DRAFT", artifact: structuredClone(artifact) },
    { id: "released-report", organisationId: "org-1", caseId: "case-1", floorId: "floor-1", status: "RELEASED", artifact: structuredClone(artifact) });
  const releasedBefore = JSON.stringify(appState.reportVersions[1]);
  saveAouDisplayDraft({ state: appState, organisationId: "org-1", actor: founder, rowId: earth.id,
    fields: { attributes: "Stationary, stability, solid, heavy, storage, owners' area." }, cleanupOnlyConfirmed: true,
    meaningChangeConfirmed: false, reason: "Prepare punctuation and grammar cleanup for Founder review.", idempotencyKey: "aou-invalidation-draft", expectedRecordVersion: 1 });
  approveAouDisplayCopy({ state: appState, organisationId: "org-1", actor: founder, rowId: earth.id,
    reason: "Founder confirms this display copy changes presentation only.", idempotencyKey: "aou-invalidation-approve", expectedRecordVersion: 2 });
  assert.deepEqual(appState.dependencyInvalidations.map((item) => item.targetId), ["draft-report"]);
  assert.equal(JSON.stringify(appState.reportVersions[1]), releasedBefore);
});

test("AOU actions preserve concurrency, audit and safe review UI contracts", () => {
  const route = source("app/api/actions/route.ts");
  const ui = source("components/aou-methodology-console.tsx");
  assert.match(route, /aou-source-initialize/);
  assert.match(route, /aou-display-draft/);
  assert.match(route, /aou-display-approve/);
  assert.match(route, /expectedRecordVersion/);
  assert.match(route, /expectedRevision/);
  assert.match(route, /appendImmutableAuditEvent/);
  assert.match(ui, /Raw source beside proposed display copy/);
  assert.match(ui, /cleanup only and does not change meaning/);
  assert.match(ui, /Export Founder review JSON/);
  assert.doesNotMatch(ui, /client portal|client delivery/i);
});
