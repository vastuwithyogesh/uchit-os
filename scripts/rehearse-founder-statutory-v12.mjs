import { pathToFileURL } from "node:url";
import { createEmptyAppState } from "../lib/store.ts";
import {
  createFounderStatutoryPolicyDraft,
  projectStatutoryReadiness,
  registerStatutoryPaymentTrigger,
  saveFounderBillingProfile
} from "../lib/founder-statutory-documents.ts";
import { runFounderPreStagingRehearsal } from "./rehearse-founder-pre-staging.mjs";

const organisationId = "org-disposable-statutory-v12";
const founder = {
  id: "founder-disposable-statutory-v12",
  fullName: "Synthetic Founder",
  email: "founder@synthetic.invalid",
  role: "SUPER_ADMIN",
  color: "#111111",
  organisationId,
  organisationCapability: "organisation_owner"
};

function syntheticFixture() {
  const state = createEmptyAppState();
  const proposal = {
    id: "proposal-version-disposable-v12",
    proposalId: "proposal-disposable-v12",
    organisationId,
    version: 1,
    clientId: "UC-DISPOSABLE-V12",
    prospectiveProjectId: "project-disposable-v12",
    serviceType: "EXISTING_SPACE",
    status: "ACCEPTED",
    currentStep: 6,
    content: {
      clientProject: {
        clientName: "Synthetic Rehearsal Client",
        clientId: "UC-DISPOSABLE-V12",
        prospectiveProjectId: "project-disposable-v12",
        projectKind: "RESIDENTIAL",
        serviceType: "EXISTING_SPACE",
        proposalDate: "2026-08-12"
      },
      requirements: {
        qualificationResponseVersionId: "qualification-disposable-v12",
        qualificationResponseHash: "qualification-hash-disposable-v12",
        exactAnswerSnapshotHash: "answer-hash-disposable-v12"
      },
      scopeItems: [],
      deliverables: [],
      interactions: {
        includedReviewRounds: 1,
        includedPresentationCalls: 1,
        clarificationPeriodDays: 1,
        expectedResponseTime: "Synthetic rehearsal only",
        additionalInteractionTreatment: "Synthetic rehearsal only"
      },
      timeline: {
        expectedCommencement: "Synthetic rehearsal only",
        estimatedDateRange: "Synthetic rehearsal only",
        milestones: [],
        prerequisites: [],
        clientDependencies: [],
        pauseOrExtensionConditions: [],
        isEstimate: true
      },
      commercial: {
        engagementClassification: "STANDARD_PAID",
        professionalFeePaise: 5_100_000,
        referenceFeePaise: 5_100_000,
        gstReferenceBasisPoints: 1800,
        gstAppliedBasisPoints: 1800,
        gstAmountPaise: 918_000,
        totalPayablePaise: 6_018_000,
        agreedAdvancePaise: 1_100_000,
        remainingBalancePaise: 4_918_000,
        advanceExceptionApproved: false,
        paymentMilestones: []
      },
      projectExclusions: [],
      policyBindings: {
        commercialPolicyId: "commercial-policy-disposable-v12",
        templateVersionId: "template-disposable-v12"
      },
      nextSteps: {
        advanceRequired: true,
        balanceAfterAdvanceDeadline: true,
        paymentProofRequiresConfirmation: true,
        reportGatesRemainServerEnforced: true
      }
    },
    contentHash: "proposal-content-hash-disposable-v12",
    createdAt: "2026-08-12T00:00:00.000Z",
    createdByActorUserId: founder.id,
    acceptedAt: "2026-08-12T01:00:00.000Z",
    recordVersion: 1,
    idempotencyKey: "proposal-disposable-v12",
    requestHash: "proposal-request-hash-disposable-v12"
  };
  state.founderProposalVersions.push(proposal);
  state.founderBalanceDeadlines.push({
    id: "balance-deadline-disposable-v12",
    organisationId,
    proposalVersionId: proposal.id,
    clientId: proposal.clientId,
    prospectiveProjectId: proposal.prospectiveProjectId,
    advanceConfirmedAt: "2026-08-12T02:00:00.000Z",
    dueAt: "2026-08-19T02:00:00.000Z",
    status: "DUE",
    remainingAmountPaise: 4_918_000,
    commercialPolicyId: "commercial-policy-disposable-v12",
    commercialPolicyVersion: 1,
    engagementClassification: "STANDARD_PAID",
    recordVersion: 1
  });
  return { state, proposal };
}

function confirmedPayment(proposal, input) {
  return {
    id: `confirmation-${input.suffix}`,
    organisationId,
    proposalVersionId: proposal.id,
    clientId: proposal.clientId,
    prospectiveProjectId: proposal.prospectiveProjectId,
    paymentId: `payment-${input.suffix}`,
    type: input.type,
    amountPaise: input.amountPaise,
    confirmedAt: input.confirmedAt,
    confirmedByActorUserId: founder.id,
    proposalContentHash: proposal.contentHash,
    idempotencyKey: `payment-confirmation-${input.suffix}`,
    requestHash: `payment-request-hash-${input.suffix}`,
    recordVersion: 1
  };
}

function assertSafe(report) {
  if (!report.migration.disposed || report.migration.persistentEnvironmentTouched) throw new Error("The migration rehearsal was not disposable.");
  if (!report.rules.receiptVoucherWithinSixtyMinutes || !report.rules.balanceDeadlineSevenDays || !report.rules.finalInvoiceOnlyAfterFullPayment) throw new Error("A statutory timing rule drifted.");
  if (report.safety.issuedDocumentCount || report.safety.sequenceReservationCount || report.safety.assetVersionCount) throw new Error("The readiness rehearsal crossed an activation boundary.");
  if (report.readiness.status !== "REVIEW_REQUIRED" || report.readiness.missingRequiredBlockers.length !== 3) throw new Error("Statutory readiness did not fail closed on the expected owner/accountant inputs.");
}

export async function runFounderStatutoryV12Rehearsal(options = {}) {
  const migrationLevel = options.migrationLevel ?? 12;
  const contract = options.contract ?? "FE-INVOICE-STATUTORY-CONFIG/v1.1-readiness";
  const migration = await runFounderPreStagingRehearsal(migrationLevel);
  const { state, proposal } = syntheticFixture();

  const documentCountAfterAcceptance = state.founderStatutoryDocuments.length;
  const policyDraft = createFounderStatutoryPolicyDraft({
    state,
    actor: founder,
    founderUserId: founder.id,
    organisationId,
    reason: "Synthetic policy draft only; accountant approval intentionally absent.",
    idempotencyKey: "statutory-policy-draft-disposable-v12",
    now: new Date("2026-08-12T01:30:00.000Z")
  });
  const billingProfile = saveFounderBillingProfile({
    state,
    actor: founder,
    founderUserId: founder.id,
    organisationId,
    clientId: proposal.clientId,
    prospectiveProjectId: proposal.prospectiveProjectId,
    billingLegalName: "Synthetic Rehearsal Client",
    billingAddress: "1 Synthetic Rehearsal Road",
    billingState: "Punjab",
    billingPin: "141001",
    recipientRegisteredForGst: false,
    clientLocationCountry: "India",
    clientLocationState: "Punjab",
    propertyLocation: "Synthetic property location",
    serviceLocation: "Synthetic service location",
    timeZone: "Asia/Kolkata",
    reason: "Synthetic disposable billing profile.",
    idempotencyKey: "billing-profile-disposable-v12",
    expectedPriorRecordVersion: 0,
    now: new Date("2026-08-12T01:40:00.000Z")
  });

  const advance = confirmedPayment(proposal, {
    suffix: "advance-v12",
    type: "ADVANCE",
    amountPaise: 1_100_000,
    confirmedAt: "2026-08-12T02:00:00.000Z"
  });
  state.founderCommercialPaymentConfirmations.push(advance);
  const receipt = registerStatutoryPaymentTrigger({ state, proposalVersionId: proposal.id, confirmation: advance });
  const receiptReplay = registerStatutoryPaymentTrigger({ state, proposalVersionId: proposal.id, confirmation: advance });

  const balance = confirmedPayment(proposal, {
    suffix: "balance-v12",
    type: "BALANCE",
    amountPaise: 4_918_000,
    confirmedAt: "2026-08-13T02:00:00.000Z"
  });
  state.founderCommercialPaymentConfirmations.push(balance);
  const invoice = registerStatutoryPaymentTrigger({ state, proposalVersionId: proposal.id, confirmation: balance });
  const readiness = projectStatutoryReadiness(state, proposal.id, new Date("2026-08-12T02:30:00.000Z"));

  const report = {
    contract,
    scope: "DISPOSABLE_SYNTHETIC_LOCAL_ONLY",
    migration,
    rules: {
      acceptanceAloneCreatesNoDocument: documentCountAfterAcceptance === 0,
      receiptVoucherKind: receipt.kind,
      receiptVoucherDueAt: receipt.dueAt,
      receiptVoucherWithinSixtyMinutes: receipt.dueAt === "2026-08-12T03:00:00.000Z",
      receiptVoucherReplayIsIdempotent: receiptReplay.id === receipt.id && state.founderStatutoryDocuments.filter((item) => item.kind === "RECEIPT_VOUCHER").length === 1,
      balanceDueAt: receipt.balanceDueAt,
      balanceDeadlineSevenDays: receipt.balanceDueAt === "2026-08-19T02:00:00.000Z",
      finalInvoiceKind: invoice.kind,
      finalInvoiceOnlyAfterFullPayment: invoice.kind === "TAX_INVOICE" && invoice.remainingBalancePaise === 0,
      finalInvoiceStatus: invoice.status
    },
    readiness: {
      status: readiness.status,
      missingRequiredBlockers: readiness.blockers,
      accountantPolicyActive: Boolean(readiness.policy),
      billingProfilePrepared: Boolean(readiness.billing),
      privateLogoActive: Boolean(readiness.assets.logo),
      privateSignatureActive: Boolean(readiness.assets.signature)
    },
    ownerPolicy: {
      operationalPlaceOfSupplySelection: policyDraft.operationalPlaceOfSupplySelection,
      receiptVoucherTrigger: policyDraft.receiptVoucherTrigger,
      receiptVoucherSlaMinutes: policyDraft.receiptVoucherSlaMinutes,
      proformaPolicy: policyDraft.proformaPolicy,
      taxInvoiceTrigger: policyDraft.taxInvoiceTrigger,
      refundPolicy: policyDraft.refundPolicy,
      correctionPosture: policyDraft.correctionPosture,
      correctionPolicyApproval: policyDraft.correctionPolicyApproval,
      purchaseSideDebitNotesInScope: policyDraft.purchaseSideDebitNotesInScope,
      opexTrackingScope: policyDraft.opexTrackingScope,
      locationsStoredSeparately: Boolean(billingProfile.billingAddress && billingProfile.clientLocationCountry && billingProfile.propertyLocation && billingProfile.serviceLocation)
    },
    safety: {
      persistentEnvironmentTouched: false,
      deployedMigrationExecuted: false,
      objectStorageTouched: false,
      assetVersionCount: state.mediaAssetVersions.length,
      issuedDocumentCount: state.founderStatutoryDocuments.filter((item) => item.status === "ISSUED").length,
      sequenceReservationCount: state.founderStatutorySequenceReservations.length,
      artifactBytesGenerated: false,
      providerConnected: false,
      deploymentExecuted: false
    },
    nextOwnerInputs: [
      "Versioned accountant approval for client-location place of supply",
      "Versioned accountant approval for service-supply timing and statutory deadline",
      "Versioned accountant approval for correction, credit-note and debit-note policy",
      "Versioned accountant approval for overseas tax treatment",
      "Private active Founder-approved logo asset version",
      "Private active Founder-approved signature asset version"
    ]
  };
  assertSafe(report);
  return report;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const report = await runFounderStatutoryV12Rehearsal();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
