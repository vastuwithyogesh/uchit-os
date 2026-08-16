import test from "node:test";
import assert from "node:assert/strict";
import type { AppUser, FounderProposalVersionRecord } from "../lib/domain.ts";
import { createEmptyAppState } from "../lib/store.ts";
import { FounderCommercialError, createFounderPaidCaseHandoff } from "../lib/founder-commercial.ts";

const organisationId = "org-test-only-paid-handoff";
const founder: AppUser = { id: "TEST_ONLY_paid_owner", fullName: "TEST_ONLY Founder", email: "owner@example.invalid", role: "SUPER_ADMIN", color: "#111", organisationId, organisationCapability: "organisation_owner" };
const at = "2026-08-16T00:00:00.000Z";

function proposal(): FounderProposalVersionRecord {
  const content = {
    clientProject: { clientName: "TEST_ONLY Client", clientId: "client-paid", prospectiveProjectId: "project-paid", projectKind: "RESIDENTIAL" as const, serviceType: "EXISTING_SPACE" as const, propertyType: "Residential", propertyLocation: "TEST_ONLY City", knownFloorCount: 1, primaryRequirement: "TEST_ONLY", proposalDate: at },
    requirements: { qualificationResponseVersionId: "qualification-paid", qualificationResponseHash: "qualification-hash", exactAnswerSnapshotHash: "answers-hash" },
    scopeItems: [], deliverables: [], interactions: { includedReviewRounds: 1, includedPresentationCalls: 1, clarificationPeriodDays: 1, expectedResponseTime: "TEST_ONLY", additionalInteractionTreatment: "TEST_ONLY" },
    timeline: { expectedCommencement: "After acceptance", estimatedDateRange: "TEST_ONLY", milestones: ["TEST_ONLY"], prerequisites: ["TEST_ONLY"], clientDependencies: ["TEST_ONLY"], pauseOrExtensionConditions: ["TEST_ONLY"], isEstimate: true as const },
    commercial: { engagementClassification: "STANDARD_PAID" as const, professionalFeePaise: 500_000, referenceFeePaise: 500_000, gstReferenceBasisPoints: 1_800, gstAppliedBasisPoints: 1_800, gstAmountPaise: 90_000, totalPayablePaise: 590_000, agreedAdvancePaise: 100_000, remainingBalancePaise: 590_000, advanceExceptionApproved: false, paymentMilestones: [] },
    projectExclusions: [], policyBindings: { commercialPolicyId: "policy-paid" }, nextSteps: { advanceRequired: true as const, balanceAfterAdvanceDeadline: true as const, paymentProofRequiresConfirmation: true as const, reportGatesRemainServerEnforced: true as const }
  };
  return { id: "proposal-paid", proposalId: "proposal-root", version: 1, organisationId, clientId: "client-paid", prospectiveProjectId: "project-paid", serviceType: "EXISTING_SPACE", status: "ACCEPTED", currentStep: 6, content, contentHash: "proposal-hash", createdAt: at, createdByActorUserId: founder.id, acceptedAt: at, recordVersion: 2, idempotencyKey: "proposal-create", requestHash: "proposal-request" };
}

function base() {
  const state = createEmptyAppState();
  const paidProposal = proposal();
  state.clients.push({ id: "client-paid", organisationId, displayName: "TEST_ONLY Client", city: "TEST_ONLY City", source: "TEST_ONLY", assignedSetterId: founder.id, email: "client@example.invalid", phone: "+910000000000", stage: "QUALIFIED", pipelineStage: "PROPOSAL_SCOPE", recordVersion: 1 });
  state.prospectiveProjects.push({ id: "project-paid", organisationId, clientId: "client-paid", leadId: "lead-paid", responseVersionId: "qualification-paid", kind: "RESIDENTIAL", status: "COMMERCIAL_PENDING", serviceType: "EXISTING_SPACE", propertyType: "Residential", propertyLocation: "TEST_ONLY City", displayName: "TEST_ONLY Property", floorCount: 1, createdAt: at, recordVersion: 1 });
  state.founderProposalVersions.push(paidProposal);
  state.founderProposalResponses.push({ id: "response-paid", organisationId, proposalVersionId: paidProposal.id, proposalContentHash: paidProposal.contentHash, artifactHashSha256: "artifact-hash", clientId: paidProposal.clientId, prospectiveProjectId: paidProposal.prospectiveProjectId, response: "ACCEPTED", fullName: "TEST_ONLY Client", acceptanceChecked: true, respondedAt: at, idempotencyKey: "response-paid", requestHash: "response-request", recordVersion: 1 });
  state.founderProposalArtifacts.push({ id: "artifact-paid", organisationId, proposalVersionId: paidProposal.id, proposalContentHash: paidProposal.contentHash, clientProjectionHash: "projection-hash", artifactHashSha256: "artifact-hash", privateObjectKey: "TEST_ONLY/artifact.pdf", mimeType: "application/pdf", sizeBytes: 1, pageCount: 1, rendererVersion: "TEST_ONLY", generatedAt: at, idempotencyKey: "artifact-paid", recordVersion: 1 });
  return { state, paidProposal };
}

function expectStatus(status: number, fn: () => unknown) { assert.throws(fn, (error: unknown) => error instanceof FounderCommercialError && error.statusCode === status); }

test("paid handoff requires confirmed payment and preserves exact provenance", () => {
  const { state, paidProposal } = base();
  expectStatus(409, () => createFounderPaidCaseHandoff({ state, actor: founder, founderUserId: founder.id, organisationId, proposalVersionId: paidProposal.id, idempotencyKey: "paid-handoff-no-payment", expectedRecordVersion: 2 }));
  state.founderCommercialPaymentConfirmations.push({ id: "payment-paid", organisationId, proposalVersionId: paidProposal.id, clientId: paidProposal.clientId, prospectiveProjectId: paidProposal.prospectiveProjectId, paymentId: "receipt-paid", type: "ADVANCE", amountPaise: 100_000, confirmedAt: at, confirmedByActorUserId: founder.id, proposalContentHash: paidProposal.contentHash, idempotencyKey: "payment-paid", requestHash: "payment-request", recordVersion: 1 });
  const created = createFounderPaidCaseHandoff({ state, actor: founder, founderUserId: founder.id, organisationId, proposalVersionId: paidProposal.id, idempotencyKey: "paid-handoff-created", expectedRecordVersion: 2, now: new Date(at) });
  assert.equal(state.vastuCases.length, 1); assert.equal(state.projects.length, 1); assert.equal(state.floorWorkspaces.length, 1); assert.equal(state.prospectiveProjects[0].caseId, created.id); assert.equal(state.prospectiveProjects[0].status, "CONVERTED");
  const audit = state.founderCommercialAuditEvents.find((item) => item.eventType === "PAID_CASE_HANDOFF_CREATED");
  assert.equal(audit?.proposalVersionId, paidProposal.id); assert.equal(audit?.prospectiveProjectId, "project-paid"); assert.match(state.timelineEvents[0].details, /confirmed advance payment-paid/);
  const replay = createFounderPaidCaseHandoff({ state, actor: founder, founderUserId: founder.id, organisationId, proposalVersionId: paidProposal.id, idempotencyKey: "paid-handoff-retry", expectedRecordVersion: 2 });
  assert.equal(replay.id, created.id); assert.equal(state.vastuCases.length, 1);
});

test("paid handoff rejects excess, below-agreed and cross-organisation payment state", () => {
  const excess = base(); excess.state.founderCommercialPaymentConfirmations.push({ id: "payment-excess", organisationId, proposalVersionId: excess.paidProposal.id, clientId: excess.paidProposal.clientId, prospectiveProjectId: excess.paidProposal.prospectiveProjectId, paymentId: "receipt-excess", type: "ADVANCE", amountPaise: 590_001, confirmedAt: at, confirmedByActorUserId: founder.id, proposalContentHash: excess.paidProposal.contentHash, idempotencyKey: "payment-excess", requestHash: "payment-excess", recordVersion: 1 }); expectStatus(409, () => createFounderPaidCaseHandoff({ state: excess.state, actor: founder, founderUserId: founder.id, organisationId, proposalVersionId: excess.paidProposal.id, idempotencyKey: "paid-excess", expectedRecordVersion: 2 }));
  const below = base(); below.state.founderCommercialPaymentConfirmations.push({ id: "payment-below", organisationId, proposalVersionId: below.paidProposal.id, clientId: below.paidProposal.clientId, prospectiveProjectId: below.paidProposal.prospectiveProjectId, paymentId: "receipt-below", type: "ADVANCE", amountPaise: 99_999, confirmedAt: at, confirmedByActorUserId: founder.id, proposalContentHash: below.paidProposal.contentHash, idempotencyKey: "payment-below", requestHash: "payment-below", recordVersion: 1 }); expectStatus(409, () => createFounderPaidCaseHandoff({ state: below.state, actor: founder, founderUserId: founder.id, organisationId, proposalVersionId: below.paidProposal.id, idempotencyKey: "paid-below", expectedRecordVersion: 2 }));
  const foreign = base(); foreign.state.founderCommercialPaymentConfirmations.push({ id: "payment-foreign", organisationId: "foreign-org", proposalVersionId: foreign.paidProposal.id, clientId: foreign.paidProposal.clientId, prospectiveProjectId: foreign.paidProposal.prospectiveProjectId, paymentId: "receipt-foreign", type: "ADVANCE", amountPaise: 100_000, confirmedAt: at, confirmedByActorUserId: founder.id, proposalContentHash: foreign.paidProposal.contentHash, idempotencyKey: "payment-foreign", requestHash: "payment-foreign", recordVersion: 1 }); expectStatus(409, () => createFounderPaidCaseHandoff({ state: foreign.state, actor: founder, founderUserId: founder.id, organisationId, proposalVersionId: foreign.paidProposal.id, idempotencyKey: "paid-foreign", expectedRecordVersion: 2 }));
});
