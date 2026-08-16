import test from "node:test";
import assert from "node:assert/strict";
import type { AppUser, FounderLegalPolicyKind, MediaAssetVersionRecord } from "../lib/domain.ts";
import { createEmptyAppState } from "../lib/store.ts";
import {
  activateFounderLegalPolicy,
  activateFounderProposalTemplate,
  applyFounderBalanceDeadlineException,
  approveFounderProposal,
  autosaveFounderProposalStep,
  calculateGstPaise,
  classifyFounderProspectiveProjectService,
  confirmFounderCommercialPayment,
  approveFounderLegalPolicy,
  createFounderLegalPolicy,
  createFounderCanonicalLegalPolicyVersion,
  FOUNDER_CANCELLATION_REFUND_DELAY_V2_COPY,
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
import { activateDocumentTemplate, bootstrapLegacyBranding, createDocumentTemplateVersion } from "../lib/document-branding.ts";

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
      : kind === "CANCELLATION_REFUND_DELAY" ? { refundPolicy: "NO_REFUNDS" as const }
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

test("canonical P5 P13 and P14 materialise once, remain unapproved, and require owner CAS approval", () => {
  const state = base();
  const p5 = createFounderCanonicalLegalPolicyVersion({ ...ownerArgs(state), kind: "PROFESSIONAL_BOUNDARIES", reason: "Materialise canonical P5 for owner review.", idempotencyKey: "canonical-p5-0001" });
  const p13 = createFounderCanonicalLegalPolicyVersion({ ...ownerArgs(state), kind: "ACCEPTANCE_DECLARATION", reason: "Materialise canonical P13 for owner review.", idempotencyKey: "canonical-p13-0001" });
  const p14 = createFounderCanonicalLegalPolicyVersion({ ...ownerArgs(state), kind: "CANCELLATION_REFUND_DELAY", reason: "Materialise canonical P14 for owner review.", idempotencyKey: "canonical-p14-0001" });
  assert.deepEqual([p5.status, p13.status, p14.status], ["DRAFT", "DRAFT", "DRAFT"]);
  assert.equal(createFounderCanonicalLegalPolicyVersion({ ...ownerArgs(state), kind: "PROFESSIONAL_BOUNDARIES", reason: "Replay canonical P5.", idempotencyKey: "canonical-p5-0002" }).id, p5.id);
  assert.equal(state.founderCommercialLegalPolicies.length, 3);
  assert.throws(() => approveFounderLegalPolicy({ ...ownerArgs(state), actor: nonOwner, policyId: p5.id, reason: "Denied.", idempotencyKey: "canonical-p5-deny", expectedRecordVersion: 1 }), /configured Founder SUPER_ADMIN owner/i);
  const approved = approveFounderLegalPolicy({ ...ownerArgs(state), policyId: p5.id, reason: "Owner reviewed exact canonical P5.", idempotencyKey: "canonical-p5-approve", expectedRecordVersion: 1 });
  assert.equal(approved.status, "FOUNDER_APPROVED");
  assert.throws(() => approveFounderLegalPolicy({ ...ownerArgs(state), policyId: p5.id, reason: "Stale replay.", idempotencyKey: "canonical-p5-stale", expectedRecordVersion: 1 }), /legal policy changed/i);
});

test("owner-approved P14 successor preserves v1 and activates only the exact v2 source", () => {
  const state = base();
  const v1 = createFounderLegalPolicy({ ...ownerArgs(state), kind: "CANCELLATION_REFUND_DELAY", title: "Historical P14", exactText: "Historical P14 wording.", configuration: { refundPolicy: "NO_REFUNDS" }, reason: "Historical test policy.", idempotencyKey: "p14-v1-history" });
  const v2 = createFounderCanonicalLegalPolicyVersion({ ...ownerArgs(state), kind: "CANCELLATION_REFUND_DELAY", reason: "Owner-approved P14 successor.", idempotencyKey: "p14-v2-successor" });
  assert.equal(v1.version, 1); assert.equal(v1.status, "DRAFT"); assert.equal(v2.version, 2); assert.equal(v2.status, "DRAFT"); assert.equal(v2.exactText, FOUNDER_CANCELLATION_REFUND_DELAY_V2_COPY);
  assert.throws(() => createFounderCanonicalLegalPolicyVersion({ ...ownerArgs(state), kind: "CANCELLATION_REFUND_DELAY", reason: "Changed replay body.", idempotencyKey: "p14-v2-successor" }), /different canonical legal policy content/i);
  assert.throws(() => approveFounderLegalPolicy({ ...ownerArgs(state), actor: nonOwner, policyId: v2.id, reason: "Denied.", idempotencyKey: "p14-v2-non-owner-approve", expectedRecordVersion: 1 }), /configured Founder SUPER_ADMIN owner/i);
  assert.throws(() => activateFounderLegalPolicy({ ...ownerArgs(state), actor: nonOwner, policyId: v2.id, reason: "Denied.", idempotencyKey: "p14-v2-non-owner-activate", expectedRecordVersion: 1 }), /configured Founder SUPER_ADMIN owner/i);
  assert.throws(() => activateFounderLegalPolicy({ ...ownerArgs(state), organisationId: "foreign-org", policyId: v2.id, reason: "Cross-org.", idempotencyKey: "p14-v2-cross-org", expectedRecordVersion: 1 }), /configured Founder SUPER_ADMIN owner/i);
  const approved = approveFounderLegalPolicy({ ...ownerArgs(state), policyId: v2.id, reason: "Owner approved exact P14 v2.", idempotencyKey: "p14-v2-approve", expectedRecordVersion: 1 });
  const active = activateFounderLegalPolicy({ ...ownerArgs(state), policyId: approved.id, reason: "Owner activated exact P14 v2.", idempotencyKey: "p14-v2-activate", expectedRecordVersion: 2 });
  assert.equal(active.status, "ACTIVE"); assert.equal(state.founderCommercialLegalPolicies.filter((item) => item.kind === "CANCELLATION_REFUND_DELAY" && item.status === "ACTIVE").length, 1);
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

test("new Founder proposal artifacts physically compose frozen prefix body suffix while replay preserves historical bytes", async () => {
  const state = base(); activateTemplate(state);
  activateLegal(state, "PROFESSIONAL_BOUNDARIES", 1); activateLegal(state, "ACCEPTANCE_DECLARATION", 2); activateLegal(state, "CANCELLATION_REFUND_DELAY", 3);
  const proposal = completeDraft(state, createDraft(state));
  reviewFounderProposal({ ...ownerArgs(state), proposalVersionId: proposal.id, reason: "Synthetic distinct Founder review.", idempotencyKey: "template-review-0001", expectedRecordVersion: 5, now: at("2026-08-13T00:00:00Z") });
  approveFounderProposal({ ...ownerArgs(state), proposalVersionId: proposal.id, reason: "Synthetic distinct Founder approval.", idempotencyKey: "template-approve-0001", expectedRecordVersion: 6, now: at("2026-08-13T00:05:00Z") });
  const prefix = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGPcEqXBwMDAxAAGAA8+ATocNFacAAAAAElFTkSuQmCC", "base64"));
  const suffix = Uint8Array.from(Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAEf/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABAf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=", "base64"));
  const checksum = async (bytes: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.slice().buffer))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const media = async (id: string, bytes: Uint8Array, mimeType: "image/png" | "image/jpeg"): Promise<MediaAssetVersionRecord> => ({ id, assetId: `asset-${id}`, version: 1, filename: id,
    privateObjectKey: `media/${id}`, mimeType, sizeBytes: bytes.length, checksumSha256: await checksum(bytes), pageCount: 1, status: "FOUNDER_APPROVED", clientSendable: false,
    uploadedByActorUserId: founder.id, uploadedAt: "2026-08-13T00:00:00.000Z", approvedByActorUserId: founder.id, approvedAt: "2026-08-13T00:00:00.000Z",
    reason: "Synthetic frozen Founder template page.", registrationHash: `registration-${id}`, organisationId, recordVersion: 1 });
  const prefixVersion = await media("founder-prefix-v1", prefix, "image/png"); const suffixVersion = await media("founder-suffix-v1", suffix, "image/jpeg");
  state.mediaAssetVersions.push(prefixVersion, suffixVersion);
  bootstrapLegacyBranding({ state, actor: founder, idempotencyKey: "template-branding-bootstrap-0001", expectedRecordVersion: 0, reason: "Synthetic exact-equivalent central bootstrap.", now: at("2026-08-13T00:05:30Z") });
  const active = state.documentTemplates.find((item) => item.family === "FOUNDER_COMMERCIAL_PROPOSAL" && item.status === "ACTIVE")!;
  const draft = createDocumentTemplateVersion({ state, actor: founder, family: "FOUNDER_COMMERCIAL_PROPOSAL", sourceTemplateId: active.id,
    template: { prefixPages: [{ internalTitle: "Founder opening", media: { assetId: prefixVersion.assetId, assetVersionId: prefixVersion.id } }], suffixPages: [{ internalTitle: "Founder closing", media: { assetId: suffixVersion.assetId, assetVersionId: suffixVersion.id } }] },
    reason: "Synthetic physical Founder template page fixture.", idempotencyKey: "template-pages-draft-0001", expectedRecordVersion: active.recordVersion, now: at("2026-08-13T00:05:40Z") });
  activateDocumentTemplate({ state, actor: founder, templateId: draft.id, reason: "Synthetic physical Founder template activation.", idempotencyKey: "template-pages-active-0001", expectedRecordVersion: draft.recordVersion, now: at("2026-08-13T00:05:50Z") });
  const store = new InMemoryCommercialArtifactStore(); store.objects.set(prefixVersion.privateObjectKey, prefix); store.objects.set(suffixVersion.privateObjectKey, suffix);
  const artifact = await generateFounderProposalArtifact({ ...ownerArgs(state), proposalVersionId: proposal.id, store, idempotencyKey: "template-artifact-0001", expectedRecordVersion: 7, now: at("2026-08-13T00:06:00Z") });
  const bytes = store.objects.get(artifact.privateObjectKey)!; const text = new TextDecoder("latin1").decode(bytes);
  assert.equal(artifact.pageCount, 3); assert.match(artifact.rendererVersion, /template-pages\/v1$/); assert.match(text, /PREFIX \/ founder-prefix-v1/); assert.match(text, /SUFFIX \/ founder-suffix-v1/);
  store.objects.delete(prefixVersion.privateObjectKey); store.objects.delete(suffixVersion.privateObjectKey);
  const replay = await generateFounderProposalArtifact({ ...ownerArgs(state), proposalVersionId: proposal.id, store, idempotencyKey: "template-artifact-replay-0001", expectedRecordVersion: 7 });
  assert.equal(replay.artifactHashSha256, artifact.artifactHashSha256); assert.deepEqual(store.objects.get(artifact.privateObjectKey), bytes);
});
test("existing prospective service classification updates in place with CAS and exact replay", async () => {
  const state = base();
  state.prospectiveProjects[0].serviceType = undefined;
  state.prospectiveProjects[0].status = "QUALIFICATION_SUBMITTED";
  const args = { ...ownerArgs(state), prospectiveProjectId: "prospect-project-1", serviceType: "EXISTING_SPACE" as const, clientId: "UC-SYNTH-1", leadId: "lead-synth-1", responseVersionId: "qual-response-1", expectedRecordVersion: 1, idempotencyKey: "service-classify-0001", now: at("2026-08-12T02:00:00Z") };
  const result = classifyFounderProspectiveProjectService(args);
  assert.equal(result.project.id, "prospect-project-1");
  assert.equal(result.project.serviceType, "EXISTING_SPACE");
  assert.equal(result.project.recordVersion, 2);
  assert.equal(state.prospectiveProjects.length, 1);
  const replay = classifyFounderProspectiveProjectService(args);
  assert.equal(replay.replayed, true);
  assert.equal(replay.project.recordVersion, 2);
  await expectStatus(409, () => classifyFounderProspectiveProjectService({ ...args, serviceType: "NEW_CONSTRUCTION", idempotencyKey: "service-classify-0001" }));
  await expectStatus(409, () => classifyFounderProspectiveProjectService({ ...args, idempotencyKey: "service-classify-0002", expectedRecordVersion: 1 }));
  await expectStatus(409, () => classifyFounderProspectiveProjectService({ ...args, idempotencyKey: "service-classify-0003", expectedRecordVersion: 2, serviceType: "NEW_CONSTRUCTION" }));
});

test("existing prospective classification fails closed for tenant, context and qualification mismatches", async () => {
  const state = base(); state.prospectiveProjects[0].serviceType = undefined; state.prospectiveProjects[0].status = "QUALIFICATION_SUBMITTED";
  const args = { ...ownerArgs(state), prospectiveProjectId: "prospect-project-1", serviceType: "EXISTING_SPACE" as const, expectedRecordVersion: 1, idempotencyKey: "service-classify-tenant-1" };
  await expectStatus(403, () => classifyFounderProspectiveProjectService({ ...args, organisationId: "foreign-org" }));
  await expectStatus(409, () => classifyFounderProspectiveProjectService({ ...args, clientId: "wrong-client", idempotencyKey: "service-classify-context-1" }));
  await expectStatus(409, () => classifyFounderProspectiveProjectService({ ...args, leadId: "wrong-lead", idempotencyKey: "service-classify-context-2" }));
  state.qualificationResponseVersions[0].status = "DRAFT" as never;
  await expectStatus(409, () => classifyFounderProspectiveProjectService({ ...args, idempotencyKey: "service-classify-qualification-1" }));
});
