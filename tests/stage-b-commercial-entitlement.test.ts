import assert from "node:assert/strict";
import test from "node:test";
import { resolveCommercialEntitlementForStageB } from "../lib/stage-b-commercial-entitlement.ts";
import { createEmptyAppState } from "../lib/store.ts";

const org = "org-commercial-test";
const client = "client-commercial-test";
const caseId = "case-commercial-test";
const projectId = "project-commercial-test";
const proposalId = "proposal-commercial-test";
const prospectiveProjectId = "prospective-commercial-test";

function fixture(classification: "INTERNAL_COMPLIMENTARY" | "STANDARD_PAID" = "STANDARD_PAID") {
  const state = createEmptyAppState();
  state.vastuCases.push({ id: caseId, organisationId: org, clientId: client, projectId, proposalId, caseNumber: "UV-COMMERCIAL", status: "ACTIVE", reportStatus: "DRAFT", orientationLocked: false, balanceApproved: false, fullPaymentApproved: false } as any);
  state.projects.push({ id: projectId, organisationId: org, clientId: client, activeCaseId: caseId, propertyName: "Test property", status: "IN_PROGRESS", createdAt: "2026-01-01T00:00:00.000Z" } as any);
  state.prospectiveProjects.push({ id: prospectiveProjectId, organisationId: org, clientId: client, leadId: "lead", responseVersionId: "response", kind: "RESIDENTIAL", status: "CONVERTED", serviceType: "EXISTING_SPACE", caseId, createdAt: "2026-01-01T00:00:00.000Z", recordVersion: 1 } as any);
  const commercial = classification === "INTERNAL_COMPLIMENTARY"
    ? { engagementClassification: classification, professionalFeePaise: 0, referenceFeePaise: 100, gstReferenceBasisPoints: 1800, gstAppliedBasisPoints: 0, gstAmountPaise: 0, totalPayablePaise: 0, agreedAdvancePaise: 0, remainingBalancePaise: 0, advanceExceptionApproved: true, classificationReason: "Founder acceptance test", paymentMilestones: [] }
    : { engagementClassification: classification, professionalFeePaise: 100, referenceFeePaise: 100, gstReferenceBasisPoints: 0, gstAppliedBasisPoints: 0, gstAmountPaise: 0, totalPayablePaise: 100, agreedAdvancePaise: 50, remainingBalancePaise: 50, advanceExceptionApproved: false, paymentMilestones: [] };
  state.founderProposalVersions.push({ id: proposalId, proposalId: "parent", organisationId: org, clientId: client, prospectiveProjectId, serviceType: "EXISTING_SPACE", status: "ACCEPTED", currentStep: 6, content: { commercial } , contentHash: "hash", createdAt: "2026-01-01T00:00:00.000Z", createdByActorUserId: "owner", recordVersion: 1, idempotencyKey: "proposal", requestHash: "request" } as any);
  return state;
}

test("accepted complimentary zero value is eligible without payment state", () => {
  const state = fixture("INTERNAL_COMPLIMENTARY");
  const result = resolveCommercialEntitlementForStageB({ state, caseId, projectId, requireFounderContract: true });
  assert.equal(result.eligible, true);
  assert.equal(result.kind, "COMPLIMENTARY_ACCEPTED_ZERO_VALUE");
  assert.equal(state.payments.length, 0);
});

test("unaccepted complimentary is blocked", () => {
  const state = fixture("INTERNAL_COMPLIMENTARY");
  state.founderProposalVersions[0].status = "DRAFT";
  assert.equal(resolveCommercialEntitlementForStageB({ state, caseId, projectId, requireFounderContract: true }).eligible, false);
});

test("paid unpaid and partially approved cases are blocked", () => {
  const state = fixture();
  assert.equal(resolveCommercialEntitlementForStageB({ state, caseId, projectId, requireFounderContract: true }).eligible, false);
  (state.vastuCases[0] as any).fullPaymentApproved = true;
  assert.equal(resolveCommercialEntitlementForStageB({ state, caseId, projectId, requireFounderContract: true }).eligible, false);
});

test("paid fully approved case is eligible", () => {
  const state = fixture();
  (state.vastuCases[0] as any).fullPaymentApproved = true;
  (state.vastuCases[0] as any).balanceApproved = true;
  assert.equal(resolveCommercialEntitlementForStageB({ state, caseId, projectId, requireFounderContract: true }).eligible, true);
});

test("missing, foreign, and wrong-scope contracts fail closed", () => {
  const missing = fixture();
  missing.founderProposalVersions.length = 0;
  assert.equal(resolveCommercialEntitlementForStageB({ state: missing, caseId, projectId, requireFounderContract: true }).eligible, false);
  const foreign = fixture();
  (foreign.founderProposalVersions[0] as any).organisationId = "foreign-org";
  assert.equal(resolveCommercialEntitlementForStageB({ state: foreign, caseId, projectId, requireFounderContract: true }).eligible, false);
  const wrongScope = fixture();
  (wrongScope.prospectiveProjects[0] as any).caseId = "other-case";
  assert.equal(resolveCommercialEntitlementForStageB({ state: wrongScope, caseId, projectId, requireFounderContract: true }).eligible, false);
});
