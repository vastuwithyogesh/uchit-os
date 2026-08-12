import test from "node:test";
import assert from "node:assert/strict";
import type { AppUser } from "../lib/domain.ts";
import { createEmptyAppState } from "../lib/store.ts";
import { activateFounderApprovedLegalSections, activateFounderNoRefundPolicy, FOUNDER_ACCEPTANCE_CHECKBOX_COPY, FOUNDER_ACCEPTANCE_DECLARATION_COPY, FOUNDER_NO_REFUND_POLICY_COPY, FOUNDER_PROFESSIONAL_BOUNDARIES_COPY, FounderCommercialError, recordFounderCommercialPolicyEvent } from "../lib/founder-commercial.ts";

const organisationId = "org-no-refund-synthetic";
const founder: AppUser = { id: "yogesh-owner", fullName: "Yogesh Hora", email: "owner@example.test", role: "SUPER_ADMIN", color: "#111111", organisationId, organisationCapability: "organisation_owner" };
const stateWithProject = () => { const state = createEmptyAppState(); state.prospectiveProjects.push({ id: "project-1", organisationId, clientId: "UC-SYNTH-1", leadId: "lead-1", responseVersionId: "response-1", kind: "RESIDENTIAL", status: "COMMERCIAL_PENDING", serviceType: "EXISTING_SPACE", createdAt: "2026-08-12T00:00:00.000Z", recordVersion: 1 }); return state; };
const args = (state: ReturnType<typeof stateWithProject>) => ({ state, actor: founder, founderUserId: founder.id, organisationId });

test("exact Founder no-refund copy activates as an immutable version and changed replay fails", () => {
  const state = stateWithProject();
  const policy = activateFounderNoRefundPolicy({ ...args(state), reason: "Owner approved P14 v1.2.", idempotencyKey: "no-refund-policy-0001", expectedActiveRecordVersion: 0 });
  assert.equal(policy.status, "ACTIVE"); assert.equal(policy.exactText, FOUNDER_NO_REFUND_POLICY_COPY);
  assert.deepEqual(policy.configuration, { refundPolicy: "NO_REFUNDS", creditPolicy: "NO_CREDITS_VOUCHERS_OR_FEE_OFFSETS", correctionPolicyApproval: "REVIEW_REQUIRED_ACCOUNTANT" });
  assert.equal(activateFounderNoRefundPolicy({ ...args(state), reason: "Owner approved P14 v1.2.", idempotencyKey: "no-refund-policy-0001", expectedActiveRecordVersion: 0 }).id, policy.id);
  assert.throws(() => activateFounderNoRefundPolicy({ ...args(state), reason: "Different body.", idempotencyKey: "no-refund-policy-0001", expectedActiveRecordVersion: 1 }), (error: unknown) => error instanceof FounderCommercialError && error.statusCode === 409);
  const successor = activateFounderNoRefundPolicy({ ...args(state), reason: "Reactivated exact approved copy as a successor version.", idempotencyKey: "no-refund-policy-0002", expectedActiveRecordVersion: 1 });
  assert.equal(successor.version, 2); assert.equal(policy.status, "SUPERSEDED"); assert.equal(policy.exactText, FOUNDER_NO_REFUND_POLICY_COPY);
});

test("only configured Yogesh owner may activate or append policy events", () => {
  const state = stateWithProject(); const other = { ...founder, id: "other-admin" };
  assert.throws(() => activateFounderNoRefundPolicy({ state, actor: other, founderUserId: founder.id, organisationId, reason: "Denied.", idempotencyKey: "no-refund-denied-1", expectedActiveRecordVersion: 0 }), /configured Founder/i);
  assert.throws(() => recordFounderCommercialPolicyEvent({ state, actor: other, founderUserId: founder.id, organisationId, clientId: "UC-SYNTH-1", prospectiveProjectId: "project-1", eventType: "CLIENT_CANCELLATION_REQUESTED", reason: "Denied.", idempotencyKey: "policy-event-denied", expectedProjectRecordVersion: 1 }), /configured Founder/i);
});

test("cancellation and delay records are append-only and never mutate project or payment state", () => {
  const state = stateWithProject(); const before = structuredClone(state.prospectiveProjects[0]);
  const cancellation = recordFounderCommercialPolicyEvent({ ...args(state), clientId: "UC-SYNTH-1", prospectiveProjectId: "project-1", eventType: "CLIENT_CANCELLATION_REQUESTED", reason: "Synthetic request recorded without entitlement.", idempotencyKey: "policy-event-cancel-1", expectedProjectRecordVersion: 1 });
  const delay = recordFounderCommercialPolicyEvent({ ...args(state), clientId: "UC-SYNTH-1", prospectiveProjectId: "project-1", eventType: "CLIENT_DEPENDENCY_DELAY_RECORDED", reason: "Synthetic client dependency.", revisedEstimate: "Synthetic revised estimate.", idempotencyKey: "policy-event-delay-01", expectedProjectRecordVersion: 1 });
  const reschedule = recordFounderCommercialPolicyEvent({ ...args(state), clientId: "UC-SYNTH-1", prospectiveProjectId: "project-1", eventType: "UCHIT_RESCHEDULE_RECORDED", reason: "Synthetic operational reschedule.", replacementDateOrSlot: "Synthetic replacement slot.", idempotencyKey: "policy-event-reschedule", expectedProjectRecordVersion: 1 });
  assert.deepEqual(state.prospectiveProjects[0], before); assert.equal(state.payments.length, 0); assert.equal(state.founderCommercialPaymentConfirmations.length, 0);
  for (const event of [cancellation, delay, reschedule]) { assert.equal(event.noRefundOrCreditEntitlement, true); assert.equal(event.paymentHistoryPreserved, true); assert.equal(event.recordVersion, 1); }
  assert.equal(state.founderCommercialPolicyEvents.length, 3);
  assert.throws(() => recordFounderCommercialPolicyEvent({ ...args(state), clientId: "UC-SYNTH-1", prospectiveProjectId: "project-1", eventType: "CLIENT_DEPENDENCY_DELAY_RECORDED", reason: "Missing estimate.", idempotencyKey: "policy-event-invalid1", expectedProjectRecordVersion: 1 }), /revised estimated schedule/i);
  assert.throws(() => recordFounderCommercialPolicyEvent({ ...args(state), clientId: "UC-SYNTH-1", prospectiveProjectId: "project-1", eventType: "CLIENT_CANCELLATION_REQUESTED", reason: "Stale.", idempotencyKey: "policy-event-stale01", expectedProjectRecordVersion: 2 }), (error: unknown) => error instanceof FounderCommercialError && error.statusCode === 409);
});

test("owner-approved P5 P13 and P14 activate exact versioned text without inventing a typed phrase", () => {
  const state = stateWithProject();
  const result = activateFounderApprovedLegalSections({ ...args(state), reason: "Owner approved the reviewed P5/P13 and superseding P14 versions.", idempotencyKey: "approved-legal-sections-01" });
  assert.equal(result.professionalBoundaries.exactText, FOUNDER_PROFESSIONAL_BOUNDARIES_COPY);
  assert.equal(result.acceptanceDeclaration.exactText, FOUNDER_ACCEPTANCE_DECLARATION_COPY);
  assert.equal(result.acceptanceDeclaration.configuration?.acceptanceCheckboxLabel, FOUNDER_ACCEPTANCE_CHECKBOX_COPY);
  assert.equal(result.acceptanceDeclaration.configuration?.typedConfirmationMode, "FULL_NAME");
  assert.equal(result.acceptanceDeclaration.configuration?.typedConfirmationPhrase, undefined);
  assert.equal(result.cancellationRefundDelay.exactText, FOUNDER_NO_REFUND_POLICY_COPY);
  assert.equal(state.founderCommercialLegalPolicies.filter((item) => item.status === "ACTIVE").length, 3);
  assert.equal(state.founderCommercialAuditEvents.length, 5);
});
