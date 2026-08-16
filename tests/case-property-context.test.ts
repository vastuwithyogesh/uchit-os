import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyAppState } from "../lib/store.ts";
import { resolveEffectivePropertyContext, saveCasePropertyContext, CasePropertyContextError, CasePropertyContextConflictError } from "../lib/case-property-context.ts";

const context = (propertyType: string) => ({ propertyType, cityCountry: "Ludhiana" });

function fixture() {
  const state = createEmptyAppState();
  state.clients.push({ id: "client-1", permanentClientId: "UC-1", fullName: "Client", email: "c@example.com", phone: "+919000000000", status: "ACTIVE", stage: "NEW", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as never);
  state.vastuCases.push({ id: "case-a", clientId: "client-1", caseNumber: "UV-A", proposalId: "p-a", status: "DRAFT", reportStatus: "NOT_STARTED", orientationLocked: false, balanceApproved: false, fullPaymentApproved: false } as never);
  state.vastuCases.push({ id: "case-b", clientId: "client-1", caseNumber: "UV-B", proposalId: "p-b", status: "DRAFT", reportStatus: "NOT_STARTED", orientationLocked: false, balanceApproved: false, fullPaymentApproved: false } as never);
  state.vastuCases.push({ id: "case-x", clientId: "client-2", caseNumber: "UV-X", proposalId: "p-x", status: "DRAFT", reportStatus: "NOT_STARTED", orientationLocked: false, balanceApproved: false, fullPaymentApproved: false } as never);
  return state;
}

function singleCaseFixture() {
  const state = fixture();
  state.vastuCases = state.vastuCases.filter((candidate) => candidate.id === "case-a");
  return state;
}

test("single case fallback remains valid", () => {
  const state = singleCaseFixture();
  state.clientIntakeProfiles.push({
    clientId: "client-1",
    version: 1,
    idempotencyKey: "legacy",
    propertyContext: context("legacy"),
    consent: { version: "uchit-intake/v1" },
    created: {} as never,
    updated: {} as never,
  });

  const result = resolveEffectivePropertyContext({ state, caseId: "case-a" });

  assert.equal(result.provenance, "LEGACY_CLIENT_FALLBACK");
  assert.equal(result.propertyContext?.propertyType, "legacy");
});

test("multiple cases are ambiguous when only client-global legacy context exists", () => {
  const state = fixture();
  state.clientIntakeProfiles.push({
    clientId: "client-1",
    version: 1,
    idempotencyKey: "legacy",
    propertyContext: context("legacy"),
    consent: { version: "uchit-intake/v1" },
    created: {} as never,
    updated: {} as never,
  });

  const first = resolveEffectivePropertyContext({ state, caseId: "case-a" });
  const second = resolveEffectivePropertyContext({ state, caseId: "case-b" });

  assert.equal(first.provenance, "AMBIGUOUS_LEGACY_CONTEXT");
  assert.equal(second.provenance, "AMBIGUOUS_LEGACY_CONTEXT");
  assert.equal(first.propertyContext, undefined);
  assert.equal(second.propertyContext, undefined);
});

test("case scoped context resolves and does not bleed into another case", () => {
  const state = fixture();
  state.clientIntakeProfiles.push({
    clientId: "client-1",
    version: 1,
    idempotencyKey: "legacy",
    propertyContext: context("legacy"),
    consent: { version: "uchit-intake/v1" },
    created: {} as never,
    updated: {} as never,
  });

  saveCasePropertyContext({ state, clientId: "client-1", caseId: "case-a", propertyContext: context("scoped-a"), actorId: "y", idempotencyKey: "scoped-a" });

  const first = resolveEffectivePropertyContext({ state, caseId: "case-a" });
  const second = resolveEffectivePropertyContext({ state, caseId: "case-b" });

  assert.equal(first.provenance, "CASE_SCOPED");
  assert.equal(first.propertyContext?.propertyType, "scoped-a");
  assert.equal(second.provenance, "AMBIGUOUS_LEGACY_CONTEXT");
});

test("both cases independently scoped stay isolated", () => {
  const state = fixture();
  saveCasePropertyContext({ state, clientId: "client-1", caseId: "case-a", propertyContext: context("residential"), actorId: "y", idempotencyKey: "a" });
  saveCasePropertyContext({ state, clientId: "client-1", caseId: "case-b", propertyContext: context("factory"), actorId: "y", idempotencyKey: "b" });

  assert.equal(resolveEffectivePropertyContext({ state, caseId: "case-a" }).propertyContext?.propertyType, "residential");
  assert.equal(resolveEffectivePropertyContext({ state, caseId: "case-b" }).propertyContext?.propertyType, "factory");
  assert.equal(resolveEffectivePropertyContext({ state, caseId: "case-a" }).provenance, "CASE_SCOPED");
  assert.equal(resolveEffectivePropertyContext({ state, caseId: "case-b" }).provenance, "CASE_SCOPED");
});

test("legacy ambiguous resolution performs no reads-side mutation", () => {
  const state = fixture();
  state.clientIntakeProfiles.push({
    clientId: "client-1",
    version: 1,
    idempotencyKey: "legacy",
    propertyContext: context("legacy"),
    consent: { version: "uchit-intake/v1" },
    created: {} as never,
    updated: {} as never,
  });

  const before = state.casePropertyContexts.length;
  const first = resolveEffectivePropertyContext({ state, caseId: "case-a" });
  const second = resolveEffectivePropertyContext({ state, caseId: "case-b" });

  assert.equal(first.provenance, "AMBIGUOUS_LEGACY_CONTEXT");
  assert.equal(second.provenance, "AMBIGUOUS_LEGACY_CONTEXT");
  assert.equal(state.casePropertyContexts.length, before);
  assert.equal(first.record, undefined);
  assert.equal(second.record, undefined);
});

test("case-scoped property context rejects cross-client and wrong project ownership", () => {
  const state = fixture();
  assert.throws(() => saveCasePropertyContext({ state, clientId: "client-2", caseId: "case-a", propertyContext: context("factory"), actorId: "y", idempotencyKey: "x" }), CasePropertyContextError);
  state.projects.push({ id: "project-x", clientId: "client-2", activeCaseId: "case-x", propertyName: "x", status: "IN_PROGRESS", createdAt: new Date().toISOString() } as never);
  assert.throws(() => saveCasePropertyContext({ state, clientId: "client-1", caseId: "case-a", projectId: "project-x", propertyContext: context("factory"), actorId: "y", idempotencyKey: "x2" }), CasePropertyContextError);
});

test("case-scoped property context rejects stale updates and supports idempotent replay", () => {
  const state = fixture();
  const first = saveCasePropertyContext({ state, clientId: "client-1", caseId: "case-a", propertyContext: context("one"), actorId: "y", idempotencyKey: "same" });
  assert.equal(saveCasePropertyContext({ state, clientId: "client-1", caseId: "case-a", propertyContext: context("one"), actorId: "y", idempotencyKey: "same" }), first);
  saveCasePropertyContext({ state, clientId: "client-1", caseId: "case-a", propertyContext: context("two"), actorId: "y", idempotencyKey: "two", expectedVersion: 1 });
  assert.throws(() => saveCasePropertyContext({ state, clientId: "client-1", caseId: "case-a", propertyContext: context("three"), actorId: "y", idempotencyKey: "three", expectedVersion: 1 }), CasePropertyContextConflictError);
});
