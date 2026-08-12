import test from "node:test";
import assert from "node:assert/strict";
import type { AppUser, FounderLegalPolicyKind } from "../lib/domain.ts";
import { createEmptyAppState } from "../lib/store.ts";
import {
  activateFounderLegalPolicy,
  activateFounderProposalTemplate,
  applyFounderBalanceDeadlineException,
  approveFounderProposal,
  autosaveFounderProposalStep,
  calculateGstPaise,
  confirmFounderCommercialPayment,
  createFounderLegalPolicy,
  createFounderProposalDraft,
  createFounderProposalTemplate,
  FounderCommercialError,
  generateFounderProposalArtifact,
  getFounderCommercialPublicSummary,
  getFounderProposalBlockers,
  InMemoryCommercialArtifactStore,
  issueFounderAdvanceInvoice,
  projectFounderBalanceDeadline,
  projectFounderInvoiceStatus,
  projectFounderProposalForClient,
  publishFounderCommercialPolicy,
  respondToFounderProposal,
  reviewFounderProposal,
  sendFounderProposal
} from "../lib/founder-commercial.ts";
import { projectStatutoryReadiness } from "../lib/founder-statutory-documents.ts";

const organisationId = "org-synthetic-commercial";
const founder: AppUser = { id: "owner-yogesh", fullName: "Yogesh Hora", email: "owner@example.test", role: "SUPER_ADMIN", color: "#111111", organisationId, organisationCapability: "organisation_owner" };
const nonOwner: AppUser = { ...founder, id: "other-admin" };
const at = (value: string) => new Date(value);

function base() {
  const state = createEmptyAppState();
  state.clients.push({ id: "UC-SYNTH-1", organisationId, displayName: "Synthetic Resident", city: "Synthetic City", source: "TEST", assignedSetterId: founder.id, email: "resident@example.test", phone: "+919000000000", stage: "QUALIFIED", pipelineStage: "PROPOSAL_SCOPE", recordVersion: 1 });
  state.qualificationResponseVersions.push({ id: "qual-response-1", organisationId, invitationId: "invite-1", clientId: "UC-SYNTH-1", formDefinitionId: "form-test-v1", version: 1, status: "SUBMITTED", answers: { concern: "Synthetic planning review", desiredOutcome: "Synthetic clarity" }, answersHash: "sha256:test-qualification", selectedServices: ["RESIDENTIAL"], secondaryInterestSelected: false, sourceQuestionIds: ["concern", "desiredOutcome"], savedAt: "2026-08-12T00:00:00.000Z", submittedAt: "2026-08-12T00:00:00.000Z", recordVersion: 1 });
  state.prospectiveProjects.push({ id: "prospect-project-1", organisationId, clientId: "UC-SYNTH-1", leadId: "lead-synth-1", responseVersionId: "qual-response-1", kind: "RESIDENTIAL", status: "COMMERCIAL_PENDING", serviceType: "EXISTING_SPACE", createdAt: "2026-08-12T00:00:00.000Z", recordVersion: 1 });
  return state;
}

function ownerArgs(state: ReturnType<typeof base>) { return { state, actor: founder, founderUserId: founder.id, organisationId }; }
function expectStatus(statusCode: number, action: () => unknown | Promise<unknown>) { return assert.rejects(Promise.resolve().then(action), (error: unknown) => error instanceof FounderCommercialError && error.statusCode === statusCode); }

function activateTemplate(state: ReturnType<typeof base>) {
  const scopeItems = [{ id: "scope-1", order: 1, title: "Synthetic existing-space consultation scope", status: "INCLUDED" as const, prospectiveProjectId: "template", floorIds: ["floor-ground"] }];
  const deliverables = [{ id: "deliverable-1", order: 1, name: "Synthetic one-floor Stage A report", status: "INCLUDED" as const, prospectiveProjectId: "template", floorIds: ["floor-ground"], deliveryFormat: "Protected PDF", expectedStage: "After all release gates", description: "Synthetic test deliverable", clientDependency: "Approved floor plan and evidence" }];
  const template = createFounderProposalTemplate({ ...ownerArgs(state), serviceType: "EXISTING_SPACE", name: "Synthetic Existing Space v1", kind: "DEFAULT", scopeItems, deliverables, reason: "Synthetic approved configuration fixture.", idempotencyKey: "template-create-0001" });
  return activateFounderProposalTemplate({ ...ownerArgs(state), templateId: template.id, reason: "Synthetic activation for runtime contract tests.", idempotencyKey: "template-active-0001", expectedRecordVersion: 1 });
}

function activateLegal(state: ReturnType<typeof base>, kind: FounderLegalPolicyKind, index: number) {
  const configuration = kind === "ACCEPTANCE_DECLARATION" ? { acceptanceCheckboxLabel: "TEST ONLY: I accept this exact synthetic proposal.", typedConfirmationPhrase: "TEST ACCEPT" }
    : kind === "INVOICE_STATUTORY_CONFIG" ? { invoicePrefix: "TEST-INV-", startingSequence: 100, jurisdictionLabel: "TEST JURISDICTION", requiredFields: ["invoiceNumber", "amountReceived"] }
      : undefined;
  const policy = createFounderLegalPolicy({ ...ownerArgs(state), kind, title: `TEST ONLY ${kind}`, exactText: `TEST ONLY — owner-supplied ${kind} fixture; never client production copy.`, configuration, reason: "Synthetic test-only policy configuration.", idempotencyKey: `legal-create-${index}0001` });
  return activateFounderLegalPolicy({ ...ownerArgs(state), policyId: policy.id, reason: "Synthetic test-only activation.", idempotencyKey: `legal-active-${index}0001`, expectedRecordVersion: 1 });
}

function createDraft(state: ReturnType<typeof base>, input: Partial<Parameters<typeof createFounderProposalDraft>[0]> = {}) {
  return createFounderProposalDraft({ ...ownerArgs(state), clientId: "UC-SYNTH-1", prospectiveProjectId: "prospect-project-1", classification: "STANDARD_PAID", professionalFeePaise: 5_100_000, appliedGstBasisPoints: 1_800, agreedAdvancePaise: 1_100_000, idempotencyKey: "proposal-draft-0001", expectedProjectVersion: 1, now: at("2026-08-12T01:00:00Z"), ...input });
}

function completeDraft(state: ReturnType<typeof base>, proposal: ReturnType<typeof createDraft>) {
  autosaveFounderProposalStep({ ...ownerArgs(state), proposalVersionId: proposal.id, step: 2, patch: { refinedSummary: "Synthetic Founder-refined summary kept separate from exact answers." }, idempotencyKey: "proposal-save-step2", expectedRecordVersion: 1 });
  autosaveFounderProposalStep({ ...ownerArgs(state), proposalVersionId: proposal.id, step: 4, patch: { interactions: { includedReviewRounds: 2, includedPresentationCalls: 1, clarificationPeriodDays: 7, expectedResponseTime: "Two working days", additionalInteractionTreatment: "Requires a separately approved successor commercial version." } }, idempotencyKey: "proposal-save-step4", expectedRecordVersion: 2 });
  autosaveFounderProposalStep({ ...ownerArgs(state), proposalVersionId: proposal.id, step: 5, patch: { timeline: { expectedCommencement: "After acceptance and commercial clearance", estimatedDateRange: "Estimated synthetic range", milestones: ["Evidence readiness", "Stage A"], prerequisites: ["Accepted proposal", "Confirmed advance or approved exception"], clientDependencies: ["Current floor plan"], pauseOrExtensionConditions: ["Missing or changed evidence"], isEstimate: true } }, idempotencyKey: "proposal-save-step5", expectedRecordVersion: 3 });
  autosaveFounderProposalStep({ ...ownerArgs(state), proposalVersionId: proposal.id, step: 6, patch: { validityEndsAt: "2026-09-01T00:00:00Z" }, idempotencyKey: "proposal-save-step6", expectedRecordVersion: 4 });
  return proposal;
}

test("exact paise GST math and configurable policy avoid floating-point drift", () => {
  assert.equal(calculateGstPaise(5_100_000, 1_800), 918_000);
  assert.equal(calculateGstPaise(101, 1_800), 18);
  const state = base();
  const initial = publishFounderCommercialPolicy({ ...ownerArgs(state), referenceFeePaise: 5_100_001, referenceAdvancePaise: 1_100_001, defaultGstBasisPoints: 1_750, reason: "Synthetic policy deviation test.", idempotencyKey: "policy-publish-0001", expectedActiveVersion: 1 });
  assert.equal(initial.version, 2); assert.equal(initial.balanceDeadlineDays, 7); assert.equal(initial.advanceInvoiceSlaMinutes, 60);
});

test("draft creation enforces classification, private reasons, exact qualification lineage and one-floor deliverables", () => {
  const state = base(); activateTemplate(state);
  assert.throws(() => createDraft(state, { professionalFeePaise: 4_900_000, idempotencyKey: "proposal-deviation-1" }), /fee deviation reason/i);
  assert.throws(() => createDraft(state, { agreedAdvancePaise: 0, idempotencyKey: "proposal-lowadvance-1" }), /non-standard classification/i);
  const discounted = createDraft(state, { classification: "SPECIAL_DISCOUNTED", professionalFeePaise: 4_900_000, agreedAdvancePaise: 0, feeDeviationReason: "Synthetic Founder-approved exception.", classificationReason: "Synthetic special engagement.", advanceExceptionReason: "Synthetic zero-advance exception.", idempotencyKey: "proposal-discounted-1" });
  assert.equal(discounted.content.commercial.advanceExceptionApproved, true);
  assert.equal(discounted.content.requirements.qualificationResponseVersionId, "qual-response-1");
  assert.deepEqual(discounted.content.deliverables[0].floorIds, ["floor-ground"]);
  const second = base(); activateTemplate(second);
  const complimentary = createDraft(second, { classification: "INTERNAL_COMPLIMENTARY", professionalFeePaise: 0, appliedGstBasisPoints: 0, agreedAdvancePaise: 0, classificationReason: "Synthetic internal complimentary engagement.", idempotencyKey: "proposal-free-0001" });
  assert.equal(complimentary.content.commercial.totalPayablePaise, 0);
  assert.equal(second.founderBalanceDeadlines[0].status, "WAIVED");
});

test("P5 P13 and P14 remain fail-closed and advisory draft text is never auto-seeded", async () => {
  const state = base(); activateTemplate(state); const proposal = completeDraft(state, createDraft(state));
  const blockers = getFounderProposalBlockers(state, proposal, at("2026-08-13T00:00:00Z"));
  assert.deepEqual(blockers.filter((item) => item.code.endsWith("OWNER_LEGAL")).map((item) => item.code).sort(), ["P13_OWNER_LEGAL", "P14_OWNER_LEGAL", "P5_OWNER_LEGAL"]);
  await expectStatus(409, () => reviewFounderProposal({ ...ownerArgs(state), proposalVersionId: proposal.id, reason: "Attempt while legal policy missing.", idempotencyKey: "proposal-review-0001", expectedRecordVersion: 5, now: at("2026-08-13T00:00:00Z") }));
  assert.equal(state.founderProposalApprovals.length, 0);
  assert.equal(JSON.stringify(state).includes("force-majeure"), false);
});

test("review approval artifact send acceptance payment invoice and deadlines remain exact and immutable", async () => {
  const state = base(); activateTemplate(state);
  activateLegal(state, "PROFESSIONAL_BOUNDARIES", 1); activateLegal(state, "ACCEPTANCE_DECLARATION", 2); activateLegal(state, "CANCELLATION_REFUND_DELAY", 3); activateLegal(state, "INVOICE_STATUTORY_CONFIG", 4);
  const proposal = completeDraft(state, createDraft(state));
  reviewFounderProposal({ ...ownerArgs(state), proposalVersionId: proposal.id, reason: "Synthetic distinct Founder review.", idempotencyKey: "proposal-review-0001", expectedRecordVersion: 5, now: at("2026-08-13T00:00:00Z") });
  approveFounderProposal({ ...ownerArgs(state), proposalVersionId: proposal.id, reason: "Synthetic distinct Founder approval.", idempotencyKey: "proposal-approve-0001", expectedRecordVersion: 6, now: at("2026-08-13T00:05:00Z") });
  assert.equal(state.founderProposalApprovals.length, 2);
  const store = new InMemoryCommercialArtifactStore(); const artifact = await generateFounderProposalArtifact({ ...ownerArgs(state), proposalVersionId: proposal.id, store, idempotencyKey: "proposal-artifact-0001", expectedRecordVersion: 7, now: at("2026-08-13T00:06:00Z") });
  const artifactReplay = await generateFounderProposalArtifact({ ...ownerArgs(state), proposalVersionId: proposal.id, store, idempotencyKey: "proposal-artifact-other", expectedRecordVersion: 7 });
  assert.equal(artifactReplay.artifactHashSha256, artifact.artifactHashSha256); assert.equal(store.objects.size, 1);
  const sent = await sendFounderProposal({ ...ownerArgs(state), proposalVersionId: proposal.id, idempotencyKey: "proposal-send-0001", expectedRecordVersion: 7, now: at("2026-08-13T00:10:00Z") });
  const response = await respondToFounderProposal({ state, token: sent.token, response: "ACCEPTED", fullName: "Synthetic Resident", acceptanceChecked: true, typedConfirmation: "TEST ACCEPT", idempotencyKey: "proposal-response-0001", now: at("2026-08-13T00:20:00Z") });
  assert.equal(response.artifactHashSha256, artifact.artifactHashSha256); assert.equal(state.vastuCases.length, 0); assert.equal(state.payments.length, 0); assert.equal(state.founderCommercialInvoices.length, 0);
  const confirmedAt = at("2026-08-13T01:00:00Z");
  confirmFounderCommercialPayment({ ...ownerArgs(state), proposalVersionId: proposal.id, paymentId: "pay-synth-advance", type: "ADVANCE", amountPaise: 1_100_000, idempotencyKey: "payment-confirm-0001", expectedProposalRecordVersion: 9, now: confirmedAt });
  const deadline = state.founderBalanceDeadlines[0]; const receipt = state.founderStatutoryDocuments[0];
  assert.equal(deadline.dueAt, "2026-08-20T01:00:00.000Z"); assert.equal(receipt.kind, "RECEIPT_VOUCHER"); assert.equal(receipt.dueAt, "2026-08-13T02:00:00.000Z"); assert.equal(receipt.status, "REVIEW_REQUIRED");
  await expectStatus(409, () => issueFounderAdvanceInvoice({ ...ownerArgs(state), proposalVersionId: proposal.id, store, idempotencyKey: "invoice-issue-0001", expectedRecordVersion: 1, now: at("2026-08-13T01:01:00Z") }));
  assert.equal(store.objects.size, 1);
  assert.equal(projectFounderBalanceDeadline(state, proposal.id, at("2026-08-20T00:59:59.999Z")).status, "DUE");
  assert.equal(projectFounderBalanceDeadline(state, proposal.id, at("2026-08-20T01:00:00.000Z")).status, "OVERDUE");
  assert.equal(state.founderCommercialAuditEvents.filter((item) => item.eventType === "BALANCE_OVERDUE").length, 1);
  assert.equal(projectFounderBalanceDeadline(state, proposal.id, at("2026-08-21T00:00:00Z")).status, "OVERDUE");
});

test("invoice SLA and issuance fail closed without statutory configuration while confirmed payment survives", async () => {
  const state = base(); activateTemplate(state); activateLegal(state, "PROFESSIONAL_BOUNDARIES", 1); activateLegal(state, "ACCEPTANCE_DECLARATION", 2); activateLegal(state, "CANCELLATION_REFUND_DELAY", 3);
  const proposal = completeDraft(state, createDraft(state)); reviewFounderProposal({ ...ownerArgs(state), proposalVersionId: proposal.id, reason: "Synthetic review.", idempotencyKey: "proposal-review-0001", expectedRecordVersion: 5 }); approveFounderProposal({ ...ownerArgs(state), proposalVersionId: proposal.id, reason: "Synthetic approval.", idempotencyKey: "proposal-approve-0001", expectedRecordVersion: 6 });
  const store = new InMemoryCommercialArtifactStore(); await generateFounderProposalArtifact({ ...ownerArgs(state), proposalVersionId: proposal.id, store, idempotencyKey: "proposal-artifact-0001", expectedRecordVersion: 7 }); const sent = await sendFounderProposal({ ...ownerArgs(state), proposalVersionId: proposal.id, idempotencyKey: "proposal-send-0001", expectedRecordVersion: 7, now: at("2026-08-13T00:00:00Z") }); await respondToFounderProposal({ state, token: sent.token, response: "ACCEPTED", fullName: "Synthetic Resident", acceptanceChecked: true, typedConfirmation: "TEST ACCEPT", idempotencyKey: "proposal-response-0001" });
  confirmFounderCommercialPayment({ ...ownerArgs(state), proposalVersionId: proposal.id, paymentId: "pay-synth", type: "ADVANCE", amountPaise: 1_100_000, idempotencyKey: "payment-confirm-0001", expectedProposalRecordVersion: 9, now: at("2026-08-13T01:00:00Z") });
  assert.equal(state.founderStatutoryDocuments[0].status, "REVIEW_REQUIRED"); assert.equal(state.founderCommercialPaymentConfirmations.length, 1);
  assert.equal(projectStatutoryReadiness(state, proposal.id, at("2026-08-13T01:59:59.999Z")).documents[0].status, "REVIEW_REQUIRED");
  assert.equal(projectStatutoryReadiness(state, proposal.id, at("2026-08-13T02:00:00.000Z")).documents[0].status, "OVERDUE");
  await expectStatus(409, () => issueFounderAdvanceInvoice({ ...ownerArgs(state), proposalVersionId: proposal.id, store, idempotencyKey: "invoice-retry-0001", expectedRecordVersion: 1, now: at("2026-08-13T02:00:00Z") }));
  assert.equal(state.founderCommercialPaymentConfirmations.length, 1); assert.equal(store.objects.size, 1);
});

test("deadline exception is owner-only, CAS protected, private and never weakens gates", async () => {
  const state = base(); activateTemplate(state); const proposal = createDraft(state);
  const deadline = state.founderBalanceDeadlines[0];
  await expectStatus(403, () => applyFounderBalanceDeadlineException({ state, actor: nonOwner, founderUserId: founder.id, organisationId, proposalVersionId: proposal.id, action: "WAIVE", reason: "Private synthetic exception.", engagementClassification: "STANDARD_PAID", idempotencyKey: "deadline-waive-0001", expectedRecordVersion: 1 }));
  assert.throws(() => applyFounderBalanceDeadlineException({ ...ownerArgs(state), proposalVersionId: proposal.id, action: "EXTEND", newDueAt: "2026-09-01T00:00:00Z", reason: "Private synthetic exception.", engagementClassification: "STANDARD_PAID", idempotencyKey: "deadline-extend-0001", expectedRecordVersion: 0 }), /changed/i);
  deadline.advanceConfirmedAt = "2026-08-13T01:00:00Z"; deadline.dueAt = "2026-08-20T01:00:00Z"; deadline.status = "DUE";
  applyFounderBalanceDeadlineException({ ...ownerArgs(state), proposalVersionId: proposal.id, action: "EXTEND", newDueAt: "2026-08-25T01:00:00Z", reason: "Private synthetic owner exception.", engagementClassification: "STANDARD_PAID", idempotencyKey: "deadline-extend-0002", expectedRecordVersion: 1 });
  assert.equal(deadline.status, "EXTENDED"); assert.equal(deadline.dueAt, "2026-08-25T01:00:00.000Z");
  assert.equal(JSON.stringify(getFounderCommercialPublicSummary(state, proposal.id)).includes("Private synthetic"), false);
  assert.equal(state.vastuCases.length, 0); assert.equal(state.reportVersions.length, 0);
});

test("tenant isolation, stale CAS and changed-body idempotency replay fail closed", async () => {
  const state = base(); activateTemplate(state);
  assert.throws(() => createDraft(state, { organisationId: "foreign-org", idempotencyKey: "proposal-foreign-1" }), /configured Founder SUPER_ADMIN owner/i);
  const proposal = createDraft(state);
  assert.throws(() => autosaveFounderProposalStep({ ...ownerArgs(state), proposalVersionId: proposal.id, step: 2, patch: { refinedSummary: "First" }, idempotencyKey: "proposal-same-key", expectedRecordVersion: 0 }), /changed/i);
  autosaveFounderProposalStep({ ...ownerArgs(state), proposalVersionId: proposal.id, step: 2, patch: { refinedSummary: "First" }, idempotencyKey: "proposal-same-key", expectedRecordVersion: 1 });
  assert.throws(() => autosaveFounderProposalStep({ ...ownerArgs(state), proposalVersionId: proposal.id, step: 2, patch: { refinedSummary: "Changed" }, idempotencyKey: "proposal-same-key", expectedRecordVersion: 2 }), /different proposal changes/i);
  const projectionAttempt = () => projectFounderProposalForClient(state, proposal);
  assert.throws(projectionAttempt, /legal-policy snapshot/i);
});
