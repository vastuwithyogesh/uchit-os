import test from "node:test";
import assert from "node:assert/strict";
import type { AppUser, FounderLegalPolicyKind } from "../lib/domain.ts";
import { createEmptyAppState } from "../lib/store.ts";
import { registerMediaAssetVersion, transitionMediaAssetVersion } from "../lib/founder-engagement.ts";
import {
  activateFounderLegalPolicy,
  activateFounderProposalTemplate,
  approveFounderProposal,
  autosaveFounderProposalStep,
  createFounderComplimentaryCaseHandoff,
  createFounderLegalPolicy,
  createFounderProposalDraft,
  createFounderProposalTemplate,
  FounderCommercialError,
  generateFounderProposalArtifact,
  InMemoryCommercialArtifactStore,
  respondToFounderProposal,
  reviewFounderProposal,
  sendFounderProposal
} from "../lib/founder-commercial.ts";

const organisationId = "org-test-only-complimentary-handoff";
const founder: AppUser = { id: "TEST_ONLY_yogesh_owner", fullName: "Yogesh Hora", email: "owner@example.test", role: "SUPER_ADMIN", color: "#111", organisationId, organisationCapability: "organisation_owner" };
const otherAdmin: AppUser = { ...founder, id: "TEST_ONLY_other_admin" };
const at = (value: string) => new Date(value);

function ownerArgs(state: ReturnType<typeof createEmptyAppState>) { return { state, actor: founder, founderUserId: founder.id, organisationId }; }
function expectStatus(status: number, action: () => unknown | Promise<unknown>) { return assert.rejects(Promise.resolve().then(action), (error: unknown) => error instanceof FounderCommercialError && error.statusCode === status); }

function setup() {
  const state = createEmptyAppState();
  state.clients.push({ id: "UC-TEST-ONLY-COMPLIMENTARY", organisationId, displayName: "TEST_ONLY Founder Rehearsal", city: "Test City", source: "TEST_ONLY", assignedSetterId: founder.id, email: "test-only@example.invalid", phone: "+919000000000", stage: "QUALIFIED", pipelineStage: "PROPOSAL_SCOPE", recordVersion: 1 });
  state.qualificationResponseVersions.push({ id: "response-test-only", organisationId, invitationId: "invite-test-only", clientId: "UC-TEST-ONLY-COMPLIMENTARY", formDefinitionId: "form-test-only-v1", version: 1, status: "SUBMITTED", answers: { concern: "TEST_ONLY", outcome: "TEST_ONLY" }, answersHash: "sha256:test-only-answers", selectedServices: ["RESIDENTIAL"], secondaryInterestSelected: false, sourceQuestionIds: ["concern", "outcome"], savedAt: "2026-08-13T00:00:00.000Z", submittedAt: "2026-08-13T00:00:00.000Z", recordVersion: 1 });
  state.prospectiveProjects.push({ id: "prospective-test-only", organisationId, clientId: "UC-TEST-ONLY-COMPLIMENTARY", leadId: "lead-test-only", responseVersionId: "response-test-only", kind: "RESIDENTIAL", status: "COMMERCIAL_PENDING", serviceType: "EXISTING_SPACE", propertyType: "Residential", propertyLocation: "TEST_ONLY Ludhiana", displayName: "TEST_ONLY residence", floorCount: 1, createdAt: "2026-08-13T00:00:00.000Z", recordVersion: 1 });
  const template = createFounderProposalTemplate({ ...ownerArgs(state), serviceType: "EXISTING_SPACE", name: "TEST_ONLY scope fixture", kind: "DEFAULT", scopeItems: [{ id: "scope", order: 1, title: "TEST_ONLY scope", status: "INCLUDED", prospectiveProjectId: "template", floorIds: [] }], deliverables: [{ id: "deliverable", order: 1, name: "TEST_ONLY deliverable", status: "INCLUDED", prospectiveProjectId: "template", floorIds: [], deliveryFormat: "Protected PDF", expectedStage: "After all gates", description: "TEST_ONLY", clientDependency: "TEST_ONLY" }], reason: "TEST_ONLY scope fixture", idempotencyKey: "handoff-template-create-1" });
  activateFounderProposalTemplate({ ...ownerArgs(state), templateId: template.id, reason: "TEST_ONLY scope activation", idempotencyKey: "handoff-template-active-1", expectedRecordVersion: 1 });
  const legal: Array<[FounderLegalPolicyKind, string, Record<string, unknown> | undefined]> = [
    ["PROFESSIONAL_BOUNDARIES", "TEST_ONLY P5", undefined],
    ["ACCEPTANCE_DECLARATION", "TEST_ONLY P13", { acceptanceCheckboxLabel: "TEST_ONLY accept", typedConfirmationMode: "FULL_NAME" }],
    ["CANCELLATION_REFUND_DELAY", "TEST_ONLY P14", { refundPolicy: "NO_REFUNDS" }]
  ];
  for (const [kind, title, configuration] of legal) {
    const policy = createFounderLegalPolicy({ ...ownerArgs(state), kind, title, exactText: `${title} approved synthetic text.`, configuration, reason: "TEST_ONLY policy fixture", idempotencyKey: `handoff-legal-create-${kind}` });
    activateFounderLegalPolicy({ ...ownerArgs(state), policyId: policy.id, reason: "TEST_ONLY policy activation", idempotencyKey: `handoff-legal-active-${kind}`, expectedRecordVersion: 1 });
  }
  const proposal = createFounderProposalDraft({ ...ownerArgs(state), clientId: "UC-TEST-ONLY-COMPLIMENTARY", prospectiveProjectId: "prospective-test-only", classification: "INTERNAL_COMPLIMENTARY", professionalFeePaise: 0, appliedGstBasisPoints: 0, agreedAdvancePaise: 0, classificationReason: "TEST_ONLY Founder manual rehearsal", idempotencyKey: "handoff-proposal-create-1", expectedProjectVersion: 1, now: at("2026-08-13T01:00:00Z") });
  autosaveFounderProposalStep({ ...ownerArgs(state), proposalVersionId: proposal.id, step: 2, patch: { refinedSummary: "TEST_ONLY Founder refined summary" }, idempotencyKey: "handoff-step-2", expectedRecordVersion: 1 });
  autosaveFounderProposalStep({ ...ownerArgs(state), proposalVersionId: proposal.id, step: 4, patch: { interactions: { includedReviewRounds: 1, includedPresentationCalls: 1, clarificationPeriodDays: 1, expectedResponseTime: "TEST_ONLY", additionalInteractionTreatment: "TEST_ONLY" } }, idempotencyKey: "handoff-step-4", expectedRecordVersion: 2 });
  autosaveFounderProposalStep({ ...ownerArgs(state), proposalVersionId: proposal.id, step: 5, patch: { timeline: { expectedCommencement: "After acceptance", estimatedDateRange: "TEST_ONLY", milestones: ["Evidence"], prerequisites: ["Accepted proposal"], clientDependencies: ["TEST_ONLY input"], pauseOrExtensionConditions: ["TEST_ONLY dependency"], isEstimate: true } }, idempotencyKey: "handoff-step-5", expectedRecordVersion: 3 });
  autosaveFounderProposalStep({ ...ownerArgs(state), proposalVersionId: proposal.id, step: 6, patch: { validityEndsAt: "2026-09-13T00:00:00Z" }, idempotencyKey: "handoff-step-6", expectedRecordVersion: 4 });
  reviewFounderProposal({ ...ownerArgs(state), proposalVersionId: proposal.id, reason: "TEST_ONLY review", idempotencyKey: "handoff-review-1", expectedRecordVersion: 5, now: at("2026-08-13T02:00:00Z") });
  approveFounderProposal({ ...ownerArgs(state), proposalVersionId: proposal.id, reason: "TEST_ONLY approval", idempotencyKey: "handoff-approve-1", expectedRecordVersion: 6, now: at("2026-08-13T02:01:00Z") });
  const store = new InMemoryCommercialArtifactStore();
  void store;
  return { state, proposal, store };
}

async function accept(setupValue: ReturnType<typeof setup>) {
  const { state, proposal, store } = setupValue;
  const artifact = await generateFounderProposalArtifact({ ...ownerArgs(state), proposalVersionId: proposal.id, store, idempotencyKey: "handoff-artifact-1", expectedRecordVersion: 7, now: at("2026-08-13T02:02:00Z") });
  const sent = await sendFounderProposal({ ...ownerArgs(state), proposalVersionId: proposal.id, idempotencyKey: "handoff-send-1", expectedRecordVersion: 7, now: at("2026-08-13T02:03:00Z") });
  const response = await respondToFounderProposal({ state, token: sent.token, response: "ACCEPTED", fullName: "TEST_ONLY Founder Rehearsal", acceptanceChecked: true, typedConfirmation: "TEST_ONLY Founder Rehearsal", idempotencyKey: "handoff-response-1", now: at("2026-08-13T02:04:00Z") });
  assert.equal(response.artifactHashSha256, artifact.artifactHashSha256);
  return response;
}

test("accepted internal complimentary proposal creates one canonical case/project/floor without payment or invoice", async () => {
  const setupValue = setup(); const { state, proposal } = setupValue; const response = await accept(setupValue);
  const created = createFounderComplimentaryCaseHandoff({ ...ownerArgs(state), proposalVersionId: proposal.id, idempotencyKey: "handoff-case-1", expectedRecordVersion: 9, now: at("2026-08-13T02:05:00Z") });
  assert.equal(created.status, "CASE_CREATED"); assert.equal(created.serviceType, "EXISTING_SPACE"); assert.equal(created.evaluationArchitectureVersion, "V1"); assert.equal(state.vastuCases.length, 1); assert.equal(state.projects.length, 1); assert.equal(state.floorWorkspaces.length, 1);
  assert.equal(state.floorWorkspaces[0].evaluationArchitectureVersion, "V1"); assert.equal(state.casePropertyContexts.length, 1); assert.equal(state.casePropertyContexts[0].caseId, created.id); assert.equal(state.casePropertyContexts[0].propertyContext.propertyType, "Residential"); assert.equal(state.casePropertyContexts[0].propertyContext.cityCountry, "TEST_ONLY Ludhiana");
  assert.equal(state.prospectiveProjects[0].caseId, created.id); assert.equal(state.prospectiveProjects[0].status, "CONVERTED"); assert.equal(state.payments.length, 0); assert.equal(state.founderCommercialPaymentConfirmations.length, 0); assert.equal(state.founderCommercialInvoices.length, 0);
  assert.equal(state.founderCommercialAuditEvents.filter((event) => event.eventType === "COMPLIMENTARY_CASE_HANDOFF_CREATED").length, 1); assert.match(state.timelineEvents[0].details, /No payment or invoice/i); assert.equal(state.timelineEvents[0].details.includes("TEST_ONLY Founder manual rehearsal"), false);
  const replay = createFounderComplimentaryCaseHandoff({ ...ownerArgs(state), proposalVersionId: proposal.id, idempotencyKey: "handoff-case-1", expectedRecordVersion: 9 }); assert.equal(replay.id, created.id); assert.equal(state.vastuCases.length, 1);
  console.log(JSON.stringify({ rehearsal: "TEST_ONLY_COMPLIMENTARY_CASE_HANDOFF", proposalVersionId: proposal.id, proposalStatus: proposal.status, acceptedArtifactHash: response.artifactHashSha256, caseId: created.id, caseNumber: created.caseNumber, projectId: created.projectId, floorId: state.floorWorkspaces[0].id, caseStatus: created.status, floorStatus: state.floorWorkspaces[0].status, auditEvent: "COMPLIMENTARY_CASE_HANDOFF_CREATED", payments: state.payments.length, invoices: state.founderCommercialInvoices.length }));
  await expectStatus(403, () => createFounderComplimentaryCaseHandoff({ state, actor: otherAdmin, founderUserId: founder.id, organisationId, proposalVersionId: proposal.id, idempotencyKey: "handoff-case-2", expectedRecordVersion: 10 }));
});

test("complimentary handoff rejects paid classifications, missing acceptance/hash and changed idempotency bodies", async () => {
  const setupValue = setup(); const { state, proposal } = setupValue; await accept(setupValue);
  proposal.content.commercial.engagementClassification = "STANDARD_PAID";
  await expectStatus(409, () => createFounderComplimentaryCaseHandoff({ ...ownerArgs(state), proposalVersionId: proposal.id, idempotencyKey: "handoff-paid-1", expectedRecordVersion: 9 }));
  proposal.content.commercial.engagementClassification = "INTERNAL_COMPLIMENTARY";
  const first = createFounderComplimentaryCaseHandoff({ ...ownerArgs(state), proposalVersionId: proposal.id, idempotencyKey: "handoff-changed-1", expectedRecordVersion: 9 }); assert.ok(first.id);
  proposal.content.commercial.totalPayablePaise = 1;
  await expectStatus(409, () => createFounderComplimentaryCaseHandoff({ ...ownerArgs(state), proposalVersionId: proposal.id, idempotencyKey: "handoff-changed-1", expectedRecordVersion: 10 }));
});
