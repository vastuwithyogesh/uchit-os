import test from "node:test";
import assert from "node:assert/strict";
import type { AppUser } from "../lib/domain.ts";
import { createEmptyAppState } from "../lib/store.ts";
import { APPROVED_QUALIFICATION_DEFINITIONS } from "../lib/qualification-form-definitions.ts";
import {
  assignReviewCall,
  createQualificationInvitation,
  registerMediaAssetVersion,
  respondToBooking,
  saveQualificationResponse,
  setupZoomMeeting,
  transitionMediaAssetVersion
} from "../lib/founder-engagement.ts";
import { confirmFounderCommercialPayment, createFounderProposalDraft } from "../lib/founder-commercial.ts";

const organisationId = "org-disposable-boundary";
const founder: AppUser = { id: "yogesh-configured-owner", fullName: "Yogesh Hora", email: "owner@example.test", role: "SUPER_ADMIN", color: "#111111", organisationId, organisationCapability: "organisation_owner" };
const nonOwner: AppUser = { ...founder, id: "not-configured-owner" };

function stateFixture() {
  const state = createEmptyAppState();
  state.clients.push({ id: "UC-DISPOSABLE-1", organisationId, displayName: "Synthetic Lead", email: "synthetic@example.test", phone: "+919000000000", city: "Synthetic City", source: "TEST", assignedSetterId: founder.id, stage: "QUALIFIED", pipelineStage: "QUALIFIED", recordVersion: 1 });
  state.optInLeads.push({ id: "lead-disposable-1", organisationId, identityKey: "email:synthetic@example.test", uniqueClientId: "UC-DISPOSABLE-1", convertedClientId: "UC-DISPOSABLE-1", fullName: "Synthetic Lead", email: "synthetic@example.test", phone: "+919000000000", city: "Synthetic City", serviceInterest: "EXISTING_SPACE", source: "TEST", score: 0, message: "", status: "QUALIFIED", importedAt: "2026-08-12T00:00:00.000Z", firstSeenAt: "2026-08-12T00:00:00.000Z", lastSeenAt: "2026-08-12T00:00:00.000Z", submissionCount: 1, duplicateCount: 0, isReturningLead: false, recordVersion: 1 });
  return state;
}

function activateSyntheticQualificationContract(state: ReturnType<typeof stateFixture>) {
  const definition = APPROVED_QUALIFICATION_DEFINITIONS.RESIDENTIAL;
  const registered = registerMediaAssetVersion({ state, actor: founder, founderUserId: founder.id, organisationId, assetKey: definition.sourceAssetVersionId, privateObjectKey: "rehearsal/disposable/org-disposable-boundary/qualification/residential-v3", reason: "Synthetic metadata-only rehearsal; no PDF bytes stored.", idempotencyKey: "boundary-media-register-0001", expectedRecordVersion: 0 });
  transitionMediaAssetVersion({ state, actor: founder, founderUserId: founder.id, organisationId, versionId: registered.version.id, target: "FOUNDER_APPROVED", expectedRecordVersion: 1, reason: "Synthetic contract activation for disposable runtime test." });
  transitionMediaAssetVersion({ state, actor: founder, founderUserId: founder.id, organisationId, versionId: registered.version.id, target: "ACTIVE", expectedRecordVersion: 2, reason: "Synthetic contract activation for disposable runtime test." });
}

test("longest safe CRM-to-booking path stops before unapproved commercial template and case gates", async () => {
  const state = stateFixture();
  activateSyntheticQualificationContract(state);
  const invitation = await createQualificationInvitation({ state, actor: founder, founderUserId: founder.id, organisationId, leadId: "lead-disposable-1", clientId: "UC-DISPOSABLE-1", kind: "RESIDENTIAL", selectedServices: ["RESIDENTIAL"], idempotencyKey: "boundary-invite-0001", expectedRecordVersion: 1 });
  const definition = state.qualificationFormDefinitions[0];
  const answers = Object.fromEntries(definition.questions.map((question) => [question.id, question.kind === "CONSENT" ? true : question.choices ? question.choices[0] : "Synthetic approved-question response"]));
  const response = saveQualificationResponse({ state, invitationId: invitation.invitation.id, answers, selectedServices: ["RESIDENTIAL"], submit: true, expectedRecordVersion: 1 });
  assert.equal(state.prospectiveProjects.length, 1);
  assert.equal(state.vastuCases.length, 0);

  const booking = assignReviewCall({ state, actor: founder, founderUserId: founder.id, organisationId, responseVersionId: response.id, startsAt: "2026-08-25T10:00:00Z", timeZone: "Asia/Kolkata", confirmationGrantId: "synthetic-booking-grant", idempotencyKey: "boundary-booking-0001", expectedRecordVersion: 1, now: new Date("2026-08-12T00:00:00Z") });
  respondToBooking({ state, bookingId: booking.id, action: "CONFIRM_THIS_TIME", now: new Date("2026-08-20T00:00:00Z") });
  let connectorCalls = 0;
  await setupZoomMeeting({ state, bookingId: booking.id, idempotencyKey: "boundary-zoom-0001", connector: { createUniqueMeeting: async () => { connectorCalls += 1; return { providerMeetingId: "synthetic-provider-id", privateJoinMetadataCiphertext: "encrypted-synthetic-metadata" }; } } });
  await setupZoomMeeting({ state, bookingId: booking.id, idempotencyKey: "boundary-zoom-0001", connector: { createUniqueMeeting: async () => { connectorCalls += 1; return { providerMeetingId: "must-not-run", privateJoinMetadataCiphertext: "must-not-run" }; } } });
  assert.equal(connectorCalls, 1);

  state.prospectiveProjects[0].serviceType = "EXISTING_SPACE";
  assert.throws(() => createFounderProposalDraft({ state, actor: founder, founderUserId: founder.id, organisationId, clientId: "UC-DISPOSABLE-1", prospectiveProjectId: state.prospectiveProjects[0].id, classification: "STANDARD_PAID", professionalFeePaise: 5_100_000, appliedGstBasisPoints: 1_800, agreedAdvancePaise: 1_100_000, idempotencyKey: "boundary-proposal-0001", expectedProjectVersion: 1 }), /Activate the exact approved brochure/i);
  assert.equal(state.founderProposalVersions.length, 0);
  assert.equal(state.founderProposalTemplates.length, 0);
  assert.equal(state.founderCommercialLegalPolicies.length, 0);
  assert.equal(state.founderCommercialPaymentConfirmations.length, 0);
  assert.equal(state.founderCommercialInvoices.length, 0);
  assert.equal(state.vastuCases.length, 0);
});

test("direct commercial bypass, foreign owner and private provider leakage fail closed", async () => {
  const state = stateFixture();
  activateSyntheticQualificationContract(state);
  await assert.rejects(createQualificationInvitation({ state, actor: nonOwner, founderUserId: founder.id, organisationId, leadId: "lead-disposable-1", clientId: "UC-DISPOSABLE-1", kind: "RESIDENTIAL", selectedServices: ["RESIDENTIAL"], idempotencyKey: "boundary-foreign-invite", expectedRecordVersion: 1 }), /configured Founder owner/i);
  assert.throws(() => confirmFounderCommercialPayment({ state, actor: founder, founderUserId: founder.id, organisationId, proposalVersionId: "missing-proposal", paymentId: "payment-bypass", type: "ADVANCE", amountPaise: 1_100_000, idempotencyKey: "boundary-payment-bypass", expectedProposalRecordVersion: 1 }), /exact proposal acceptance is required/i);
  const serialized = JSON.stringify(state);
  assert.equal(serialized.includes("https://zoom"), false);
  assert.equal(serialized.includes("token="), false);
  assert.equal(state.vastuCases.length, 0);
  assert.equal(state.payments.length, 0);
  assert.equal(state.reportVersions.length, 0);
});
