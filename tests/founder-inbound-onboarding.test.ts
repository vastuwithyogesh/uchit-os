import test from "node:test";
import assert from "node:assert/strict";
import type { AppUser } from "../lib/domain.ts";
import { createEmptyAppState } from "../lib/store.ts";
import { createFounderInboundOnboarding, FounderCommercialError } from "../lib/founder-commercial.ts";

const organisationId = "org-inbound-test";
const founder: AppUser = { id: "owner-inbound", fullName: "Yogesh Hora", email: "owner@test.invalid", role: "SUPER_ADMIN", color: "#111", organisationId, organisationCapability: "organisation_owner" };

function fixture() {
  const state = createEmptyAppState();
  state.clients.push({ id: "client-inbound", organisationId, displayName: "Fictional Inbound Client", city: "Test City", source: "TEST_ONLY", assignedSetterId: founder.id, email: "fictional@test.invalid", phone: "+910000000000", stage: "CONVERTED", pipelineStage: "WON", recordVersion: 1 });
  state.prospectiveProjects.push({ id: "project-inbound", organisationId, clientId: "client-inbound", leadId: "lead-inbound", kind: "RESIDENTIAL", status: "REVIEW_PENDING", serviceType: "EXISTING_SPACE", displayName: "Fictional Test Residence", propertyType: "Residential", propertyLocation: "1 Test Crescent, Test City", floorCount: 1, importantNotes: "Test-only scope", createdAt: "2026-08-17T00:00:00.000Z", recordVersion: 1 });
  state.founderProposalTemplates.push({ id: "template-inbound", organisationId, serviceType: "EXISTING_SPACE", version: 1, name: "Test template", kind: "DEFAULT", status: "ACTIVE", scopeItems: [], deliverables: [], contentHash: "template-hash", reason: "Test-only", actorUserId: founder.id, createdAt: "2026-08-17T00:00:00.000Z", idempotencyKey: "template-inbound", requestHash: "template-request", recordVersion: 1 });
  return state;
}

function args(state: ReturnType<typeof fixture>, extra: Record<string, unknown> = {}) {
  return { state, actor: founder, founderUserId: founder.id, organisationId, clientId: "client-inbound", prospectiveProjectId: "project-inbound", classification: "STANDARD_PAID" as const, professionalFeePaise: 5_100_000, appliedGstBasisPoints: 1_800, agreedAdvancePaise: 1_100_000, advanceReceivedPaise: 1_100_000, paymentId: "TEST-ADVANCE-001", paymentMode: "BANK_TRANSFER", idempotencyKey: "inbound-onboarding-001", expectedProjectVersion: 1, ...extra };
}

test("inbound Founder onboarding starts from scope without qualification, acceptance, proof, or full balance", () => {
  const state = fixture();
  const result = createFounderInboundOnboarding(args(state));
  assert.equal(result.proposal.status, "FOUNDER_AGREED");
  assert.equal(result.proposal.content.requirements.qualificationResponseVersionId, undefined);
  assert.equal(result.proposal.content.nextSteps.paymentProofRequiresConfirmation, false);
  assert.equal(result.advance?.amountPaise, 1_100_000);
  assert.equal(result.caseRecord.status, "CASE_CREATED");
  assert.equal(state.vastuCases.length, 1); assert.equal(state.projects.length, 1); assert.equal(state.floorWorkspaces.length, 1);
  const replay = createFounderInboundOnboarding(args(state));
  assert.equal(replay.replayed, true);
  assert.equal(state.founderProposalVersions.length, 1); assert.equal(state.founderCommercialPaymentConfirmations.length, 1); assert.equal(state.vastuCases.length, 1); assert.equal(state.projects.length, 1); assert.equal(state.floorWorkspaces.length, 1);
});

test("paid inbound onboarding rejects an unrecorded advance before mutating state", () => {
  const state = fixture();
  assert.throws(() => createFounderInboundOnboarding(args(state, { advanceReceivedPaise: 0, idempotencyKey: "inbound-onboarding-002" })), (error: unknown) => error instanceof FounderCommercialError && error.statusCode === 409);
  assert.equal(state.founderProposalVersions.length, 0); assert.equal(state.founderCommercialPaymentConfirmations.length, 0); assert.equal(state.vastuCases.length, 0);
});

test("internal complimentary inbound onboarding starts without a fake payment", () => {
  const state = fixture();
  const result = createFounderInboundOnboarding(args(state, { classification: "INTERNAL_COMPLIMENTARY", professionalFeePaise: 0, appliedGstBasisPoints: 0, agreedAdvancePaise: 0, advanceReceivedPaise: 0, paymentId: undefined, paymentMode: undefined, classificationReason: "Test-only internal complimentary engagement.", idempotencyKey: "inbound-onboarding-003" }));
  assert.equal(result.advance, undefined); assert.equal(result.proposal.content.commercial.totalPayablePaise, 0); assert.equal(state.founderCommercialPaymentConfirmations.length, 0); assert.equal(state.vastuCases.length, 1);
});

test("inbound onboarding preserves organisation and CAS controls", () => {
  const state = fixture();
  assert.throws(() => createFounderInboundOnboarding(args(state, { organisationId: "wrong-org", idempotencyKey: "inbound-onboarding-004" })), /configured Founder SUPER_ADMIN owner/i);
  assert.throws(() => createFounderInboundOnboarding(args(state, { expectedProjectVersion: 99, idempotencyKey: "inbound-onboarding-005" })), (error: unknown) => error instanceof FounderCommercialError && error.statusCode === 409);
});
