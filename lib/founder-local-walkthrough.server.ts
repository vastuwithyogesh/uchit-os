import type { AppUser } from "./domain.ts";
import type { OrganisationMembership, OrganisationRecord } from "./foundation.ts";
import { createEmptyAppState, type AppState } from "./store.ts";
import { registerMediaAssetVersion, transitionMediaAssetVersion } from "./founder-engagement.ts";
import {
  activateFounderApprovedLegalSections,
  approveFounderProposal,
  autosaveFounderProposalStep,
  createFounderComplimentaryCaseHandoff,
  createFounderProposalDraft,
  createFounderProspectiveCase,
  generateFounderProposalArtifact,
  InMemoryCommercialArtifactStore,
  respondToFounderProposal,
  reviewFounderProposal,
  sendFounderProposal
} from "./founder-commercial.ts";
import { activateLocalEntranceZoneCatalogV1 } from "./entrance-zone-catalog-v1.ts";

const TEST_TIME = "2026-08-13T12:00:00.000Z";
const CLIENT_ID = "UC-TEST-ONLY-CONTINUOUS";
const LEAD_ID = "lead-test-only-continuous";
const CASE_INTENT_KEY = "walkthrough-case-intent-0001";
const RESPONSE_ID = `founder-case-intent:${CASE_INTENT_KEY}`;

/**
 * Builds a disposable owner walkthrough through the same protected domain services
 * used by the application. It is imported only by the loopback-only seed route.
 */
export async function buildContinuousFounderWalkthrough(input: {
  organisation: OrganisationRecord;
  membership: OrganisationMembership;
  actor: AppUser;
}) {
  const organisationId = input.organisation.id;
  const actor: AppUser = {
    ...input.actor,
    organisationId,
    organisationCapability: "organisation_owner"
  };
  const owner = { actor, founderUserId: actor.id, organisationId };
  const state = createEmptyAppState();
  activateLocalEntranceZoneCatalogV1({ state, organisationId, actorUserId: actor.id, activatedAt: TEST_TIME });
  state.clients.push({
    id: CLIENT_ID,
    organisationId,
    displayName: "TEST_ONLY Continuous Audit Client",
    email: "continuous-audit@example.invalid",
    phone: "+919000000001",
    city: "Bengaluru",
    source: "TEST_ONLY_LOCAL_WALKTHROUGH",
    assignedSetterId: actor.id,
    stage: "QUALIFIED",
    pipelineStage: "PROPOSAL_SCOPE",
    recordVersion: 1
  });
  state.optInLeads.push({
    id: LEAD_ID,
    organisationId,
    identityKey: "email:continuous-audit@example.invalid",
    uniqueClientId: CLIENT_ID,
    convertedClientId: CLIENT_ID,
    fullName: "TEST_ONLY Continuous Audit Client",
    email: "continuous-audit@example.invalid",
    phone: "+919000000001",
    city: "Bengaluru",
    country: "India",
    timeZone: "Asia/Kolkata",
    serviceInterest: "EXISTING_SPACE",
    source: "TEST_ONLY_LOCAL_WALKTHROUGH",
    score: 100,
    message: "TEST_ONLY local functional audit.",
    status: "QUALIFIED",
    importedAt: TEST_TIME,
    firstSeenAt: TEST_TIME,
    lastSeenAt: TEST_TIME,
    submissionCount: 1,
    duplicateCount: 0,
    isReturningLead: false,
    recordVersion: 1
  });

  const opened = createFounderProspectiveCase({
    state,
    ...owner,
    clientId: CLIENT_ID,
    serviceType: "EXISTING_SPACE",
    propertyType: "Residential",
    displayName: "TEST_ONLY Continuous Audit Residence",
    propertyLocation: "TEST_ONLY 1 Audit Lane, Bengaluru",
    floorCount: 1,
    importantNotes: "TEST_ONLY Founder manual rehearsal",
    confirmPossibleDuplicate: false,
    idempotencyKey: CASE_INTENT_KEY,
    expectedClientRecordVersion: 1
  });
  state.qualificationResponseVersions.push({
    id: RESPONSE_ID,
    organisationId,
    invitationId: "invite-test-only-continuous",
    clientId: CLIENT_ID,
    formDefinitionId: "form-test-only-continuous-v1",
    version: 1,
    status: "SUBMITTED",
    answers: {
      concern: "Verify one complete local Founder workflow.",
      desiredOutcome: "A traceable one-floor protected report boundary.",
      propertyStatus: "Existing occupied residence"
    },
    answersHash: "sha256:test-only-continuous-qualification",
    selectedServices: ["RESIDENTIAL"],
    secondaryInterestSelected: false,
    sourceQuestionIds: ["concern", "desiredOutcome"],
    savedAt: TEST_TIME,
    submittedAt: TEST_TIME,
    recordVersion: 1
  });

  const brochure = registerMediaAssetVersion({
    state,
    ...owner,
    assetKey: "BROCHURE_EXISTING_SPACE_V2",
    privateObjectKey: `${organisationId}/walkthrough/brochure-existing-space-v2`,
    reason: "TEST_ONLY exact approved brochure metadata for the disposable walkthrough.",
    idempotencyKey: "walkthrough-brochure-register-0001",
    expectedRecordVersion: 0
  });
  transitionMediaAssetVersion({ state, ...owner, versionId: brochure.version.id, target: "FOUNDER_APPROVED", expectedRecordVersion: 1, reason: "TEST_ONLY disposable Founder approval." });
  transitionMediaAssetVersion({ state, ...owner, versionId: brochure.version.id, target: "ACTIVE", expectedRecordVersion: 2, reason: "TEST_ONLY disposable activation." });
  activateFounderApprovedLegalSections({ state, ...owner, reason: "Owner-approved exact P5, P13 and P14 versions for the disposable walkthrough.", idempotencyKey: "walkthrough-approved-legal-0001" });

  const proposal = createFounderProposalDraft({
    state,
    ...owner,
    clientId: CLIENT_ID,
    prospectiveProjectId: opened.project.id,
    classification: "INTERNAL_COMPLIMENTARY",
    professionalFeePaise: 0,
    appliedGstBasisPoints: 0,
    agreedAdvancePaise: 0,
    classificationReason: "TEST_ONLY Founder manual rehearsal",
    idempotencyKey: "walkthrough-proposal-create-0001",
    expectedProjectVersion: 1,
    now: new Date(TEST_TIME)
  });
  autosaveFounderProposalStep({ state, ...owner, proposalVersionId: proposal.id, step: 2, patch: { refinedSummary: "TEST_ONLY one-floor existing-space audit." }, idempotencyKey: "walkthrough-proposal-step2-0001", expectedRecordVersion: 1 });
  autosaveFounderProposalStep({ state, ...owner, proposalVersionId: proposal.id, step: 4, patch: { interactions: { includedReviewRounds: 1, includedPresentationCalls: 1, clarificationPeriodDays: 1, expectedResponseTime: "TEST_ONLY one working day", additionalInteractionTreatment: "Requires a separately approved successor version." } }, idempotencyKey: "walkthrough-proposal-step4-0001", expectedRecordVersion: 2 });
  autosaveFounderProposalStep({ state, ...owner, proposalVersionId: proposal.id, step: 5, patch: { timeline: { expectedCommencement: "After accepted complimentary clearance", estimatedDateRange: "TEST_ONLY estimated local rehearsal", milestones: ["Evidence readiness", "Stage A"], prerequisites: ["Accepted proposal", "Approved complimentary exception"], clientDependencies: ["Current one-floor plan"], pauseOrExtensionConditions: ["Missing or changed evidence"], isEstimate: true } }, idempotencyKey: "walkthrough-proposal-step5-0001", expectedRecordVersion: 3 });
  autosaveFounderProposalStep({ state, ...owner, proposalVersionId: proposal.id, step: 6, patch: { validityEndsAt: "2026-12-31T23:59:59.000Z" }, idempotencyKey: "walkthrough-proposal-step6-0001", expectedRecordVersion: 4 });
  reviewFounderProposal({ state, ...owner, proposalVersionId: proposal.id, reason: "TEST_ONLY distinct Founder review.", idempotencyKey: "walkthrough-proposal-review-0001", expectedRecordVersion: 5 });
  approveFounderProposal({ state, ...owner, proposalVersionId: proposal.id, reason: "TEST_ONLY distinct Founder approval.", idempotencyKey: "walkthrough-proposal-approve-0001", expectedRecordVersion: 6 });
  const store = new InMemoryCommercialArtifactStore();
  await generateFounderProposalArtifact({ state, ...owner, proposalVersionId: proposal.id, store, idempotencyKey: "walkthrough-proposal-artifact-0001", expectedRecordVersion: 7 });
  const sent = await sendFounderProposal({ state, ...owner, proposalVersionId: proposal.id, idempotencyKey: "walkthrough-proposal-send-0001", expectedRecordVersion: 7 });
  await respondToFounderProposal({ state, token: sent.token, response: "ACCEPTED", fullName: "TEST_ONLY Continuous Audit Client", acceptanceChecked: true, typedConfirmation: "TEST_ONLY Continuous Audit Client", idempotencyKey: "walkthrough-proposal-accept-0001" });
  const caseRecord = createFounderComplimentaryCaseHandoff({ state, ...owner, proposalVersionId: proposal.id, idempotencyKey: "walkthrough-case-handoff-0001", expectedRecordVersion: 9 });
  const floor = state.floorWorkspaces.find((item) => item.caseId === caseRecord.id)!;
  return { state, actor, clientId: CLIENT_ID, prospectiveProjectId: opened.project.id, proposalVersionId: proposal.id, caseId: caseRecord.id, floorId: floor.id };
}
