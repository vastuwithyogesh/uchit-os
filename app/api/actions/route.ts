import { NextResponse } from "next/server";
import { AuthenticationError, authErrorResponse, isExplicitLocalDemo, isInitialOrganisationOwnerEmail, resolveRequestActor } from "@/lib/auth";
import { loadStateSnapshotFromPersistence, persistStateToDatabase } from "@/lib/persistence";
import { createServerTiming, withServerTiming } from "@/lib/server-timing";
import { getAppState, setAppState, type AppState } from "@/lib/store";
import { appendImmutableAuditEvent, FoundationAccessError, resolveActiveOrganisationContext } from "@/lib/foundation.server";
import { hasOrganisationCapability } from "@/lib/foundation";
import { assertOrganisationRequestScope, stampOrganisationOwnership } from "@/lib/organisation-scope";
import { deterministicContentHash } from "@/lib/evaluation-provenance";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { retireImageDerivative } from "@/lib/image-utility";
import { processImageBatch, processImageDerivative, retryImageDerivative, validateStoredImageVersion } from "@/lib/image-utility.server";
import { activateBrandProfile, activateDocumentTemplate, archiveBrandProfile, archiveDocumentTemplate, bootstrapLegacyBranding,
  createBrandProfileVersion, createDocumentTemplateVersion, updateBrandProfileDraft, updateDocumentTemplateDraft } from "@/lib/document-branding";
import { acknowledgeDocumentDelivery, deliverDocument, markDocumentDeliveryReady, prepareDocumentDelivery } from "@/lib/document-delivery";
import { inspectProtectedPdfForDelivery } from "@/lib/final-pdf.server";
import { findOwnedClient } from "@/lib/client-portal";
import { createPlanVersion, createSpatialEvidenceVersion, lockExactOrientation } from "@/lib/spatial-workflow";
import { confirmEntranceZones } from "@/lib/entrance-zone-workflow";
import { finalizeEntranceZoneSuccessor } from "@/lib/entrance-zone-workflow";
import { createD16UtilityMappingDraft, createD16UtilityMappingSuccessor, finalizeD16UtilityMapping } from "@/lib/d16-utility-mapping";
import { finalizeD8OrientationSnapshotV1 } from "@/lib/d8-orientation-snapshot-v1";
import { resolveEvaluationArchitecture } from "@/lib/evaluation-architecture";
import { normalizeCaseService } from "@/lib/service-framework";
import { resolveCaseFileEvidenceAuthority } from "@/lib/case-file-assets.server";
import { createDirectionalInputDraft, createDirectionalInputSuccessor, finalizeDirectionalInput } from "@/lib/directional-input-v1";
import { finalizeDirectionalEvaluationSnapshot } from "@/lib/directional-evaluation-snapshot-v1";
import { createDirectionalReportCardDraft, finalizeDirectionalReportCard, createDirectionalReportCardSuccessor, presentDirectionalStageA } from "@/lib/directional-report-card-snapshot-v1";
import { createSiteEvaluationEvidenceDraft, createSiteEvaluationEvidenceSuccessor, finalizeSiteEvaluationEvidence } from "@/lib/site-evaluation-evidence-v1";
import { createPostSiteObservationDraft, createPostSiteObservationSuccessor, finalizePostSiteObservation } from "@/lib/post-site-observations-v1";
import { createEnergyBarEvidenceDraft, createEnergyBarEvidenceSuccessor, finalizeEnergyBarEvidence } from "@/lib/energy-bar-evidence-v1";
import { createEnergyBarStateSetDraft, createEnergyBarStateSetSuccessor, finalizeEnergyBarStateSet } from "@/lib/energy-bar-state-v1";
import { createCanonicalElementalEvaluationSnapshot, createElementalEvaluationSuccessor } from "@/lib/elemental-evaluation-integration-v1";
import { approveV1FullBalanceClearance } from "@/lib/v1-full-balance-clearance";
import { createElementalReportSnapshotDraft, finalizeElementalReportSnapshot, createElementalReportSnapshotSuccessor, createV1RemedyHandoff } from "@/lib/elemental-report-snapshot-v1";
import { resolveV1StageAReadiness } from "@/lib/v1-stage-a-readiness";
import { createCombinedEvaluationReportDraft, finalizeCombinedEvaluationReport, createCombinedEvaluationReportSuccessor } from "@/lib/combined-evaluation-report-v1";
import { bindStageBMethodologyAuthority, createMethodologyVersion, publishMethodologyVersion, upsertMethodologyFixture, upsertMethodologyRule } from "@/lib/methodology-registry";
import { approveAouDisplayCopy, initializeCanonicalAouSource, saveAouDisplayDraft } from "@/lib/aou-methodology";
import { requestEvaluationReplacement, transitionFloorRegeneration } from "@/lib/founder-regeneration";
import { approveRevisedLayoutCandidate, createRevisedLayoutCandidate, deleteRemedyPlacement, ensureStageBReservation, finaliseStageBPage, initialiseStageB, resolveEligibleRemedies, selectFinalRevisedLayout, upsertRemedyPlacement, validateStageBIntegrity } from "@/lib/stage-b-remediation";
import { createStageBInputV1, createStageBInputV1Successor, finalizeStageBInputV1 } from "@/lib/stage-b-input-v1";
import { deleteColourFrameComposition, deleteExistingLayoutAnnotation, deleteSectionAPlacement, finaliseSectionAPage, initialiseSectionA, registerSectionAAsset,
  upsertColourFrameComposition, upsertExistingLayoutAnnotation, upsertSectionAPlacement, validateRemediationReportIntegrity, validateSectionAIntegrity } from "@/lib/section-a-remediation";
import { addSectionCExtraPage, deleteSectionCPlacement, finaliseSectionCPage, finaliseSectionCSequence, registerSectionCAsset, renameSectionCExtraPage,
  reorderSectionCExtraPages, retireSectionCExtraPage, upsertSectionCPlacement, validateSectionCIntegrity } from "@/lib/section-c-extras";
import { approveRepositoryImportRows, approveRepositoryRecord, archiveRepositoryRecord, bulkTransitionRepositoryRecords, consumeSectionARepositoryRecord,
  consumeSectionCRepositoryRecord, createCaseUsedRemedy, createRepositoryRecord, mergeCaseUsedIntoMainLibrary, reactivateRepositoryRecord,
  setRepositoryPreferredAsset, stageRepositoryCsvImport, updateRepositoryRecord } from "@/lib/repository-admin";
import { assignReviewCall, cancelReviewCall, createFounderCommunicationContext, createQualificationInvitation, markCommunicationOpened, prepareManualCommunication, rescheduleReviewCall,
  registerMediaAssetVersion, transitionMediaAssetVersion, updateCanonicalLeadProfile, validateApprovedAssetDryRun } from "@/lib/founder-engagement";
import { activateFounderLegalPolicy, activateFounderNoRefundPolicy, activateFounderProposalTemplate, applyFounderBalanceDeadlineException, approveFounderLegalPolicy, approveFounderProposal, autosaveFounderProposalStep,
  confirmFounderCommercialPayment, createFounderCanonicalLegalPolicyVersion, createFounderComplimentaryCaseHandoff, createFounderInboundOnboarding, createFounderPaidCaseHandoff, createFounderProspectiveCase, createFounderLegalPolicy, createFounderProposalDraft, createFounderProposalSuccessor, createFounderProposalTemplate,
  classifyFounderProspectiveProjectService, generateFounderProposalArtifact, issueFounderAdvanceInvoice, publishFounderCommercialPolicy, recordFounderCommercialPolicyEvent, reviewFounderProposal, sendFounderProposal } from "@/lib/founder-commercial";
import { founderCommercialArtifactStore } from "@/lib/founder-commercial.server";
import { activateFounderStatutoryPolicy, createFounderStatutoryPolicyDraft, issueFounderStatutoryDocument, saveFounderBillingProfile } from "@/lib/founder-statutory-documents";
import { approveManualUtilitySheet, checkpointPostSiteFindings, checkpointSiteAnalysis, upsertPostSiteFindings, upsertSiteAnalysis } from "@/lib/site-workflow";
import {
  canApproveCommercialProposal,
  canApproveReport,
  canEditFloorWorkspaces,
  canEvaluateCases,
  canManageTemplates,
  canReadClientSnapshots,
  canReleaseVerdict,
  canTriggerDeliverables,
  canVerifyPayments
} from "@/lib/permissions";
import {
  addFloorEvidence,
  addFloorWorkspace,
  approveCommercialProposal,
  approveReport,
  bookQualificationCall,
  createCommercialProposal,
  createEvaluationSnapshot,
  createUtilityVerdict,
  createWhatsAppTemplate,
  createVastuCase,
  createVastuCaseV1,
  bookReviewCall,
  completeReviewCall,
  configureCaseService,
  approveCaseRectification,
  generatePreviewReport,
  getClientSnapshot,
  markFloorWorkspaceReady,
  prepareFinalReport,
  rankShaktiValues,
  recordShaktiSnapshot,
  recordStageAVerdictPresentation,
  recordLeadQualification,
  recordClientOutreachSend,
  requestCaseRectification,
  upsertAssessmentObservation,
  upsertRecommendation,
  upsertImplementationTask,
  upsertCaseDocument,
  resolveCaseDocumentIssue,
  upsertDeliveryMilestone,
  transitionClientPipeline,
  updateCommercialPolicy,
  upsertClientIntake,
  upsertCasePropertyContextV1,
  upsertClientIntakeProfileV1,
  saveClientIntakeV1,
  updateInboundLeadStatus,
  verifyAdvanceProofAndOpenCase,
  verifyBalanceProof,
  qualifyInboundLead,
  releaseVerdict,
  resetDemoData,
  sendWhatsAppTemplate
  ,
  toggleWhatsAppTemplate
} from "@/lib/workflow-service";

export async function POST(request: Request) {
  const timing = createServerTiming();
  const parseStartedAt = timing.start();
  const body = await request.json().catch(() => ({}));
  timing.end("request-parse", parseStartedAt);
  const action = body.action as string;
  let actor: Awaited<ReturnType<typeof resolveRequestActor>>;
  let foundation: Awaited<ReturnType<typeof resolveActiveOrganisationContext>> | null = null;
  let organisationStateBefore: AppState | undefined;
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
      const concurrencyActions = new Set(["founder-legal-policy-version-create-from-canonical", "founder-legal-policy-approve", "founder-legal-policy-activate", "founder-lead-profile-update", "founder-media-register", "founder-media-transition", "founder-qualification-invite", "founder-communication-context", "founder-communication-prepare", "founder-communication-opened", "founder-booking-assign", "founder-booking-reschedule", "founder-booking-cancel", "founder-project-scope-save", "case-service-configure", "case-rectification-request", "case-rectification-approve", "assessment-observation-upsert", "assessment-recommendation-upsert", "assessment-implementation-upsert", "case-document-upsert", "case-document-issue-resolve", "delivery-milestone-upsert", "site-analysis-upsert", "site-analysis-checkpoint", "post-site-findings-upsert", "post-site-findings-checkpoint", "manual-sheet-approve", "client-pipeline-transition", "commercial-policy-update", "client-intake-upsert", "proposal-create", "proposal-approve", "case-create", "advance-proof-verify", "preview-report", "stage-a-present", "balance-proof-verify", "final-report-prepare", "report-approve", "verdict-release", "utility-evaluate", "utility-verdict", "shakti-rank", "evaluation-replacement-request", "floor-create", "plan-version-create", "spatial-evidence-create", "orientation-version-lock", "opening-mapping-create", "space-mapping-create", "regeneration-transition", "methodology-version-create", "methodology-version-authority-bind", "methodology-rule-upsert", "methodology-fixture-upsert", "methodology-version-publish", "aou-source-initialize", "aou-display-draft", "aou-display-approve"]);
  concurrencyActions.add("case-create-v1");
  concurrencyActions.add("case-property-context-upsert-v1");
  concurrencyActions.add("client-intake-profile-upsert-v1");
  concurrencyActions.add("client-intake-save-v1");
  concurrencyActions.add("floor-ready");
  for (const spatialV1Action of ["d8-orientation-finalize-v1", "d16-mapping-draft-v1", "d16-mapping-finalize-v1", "d16-mapping-successor-v1", "d32-entrance-draft-v1", "d32-entrance-finalize-v1", "d32-entrance-successor-v1"]) concurrencyActions.add(spatialV1Action);
  for (const directionalV1Action of ["directional-input-draft-v1", "directional-input-finalize-v1", "directional-input-successor-v1", "directional-evaluation-finalize-v1", "directional-evaluation-successor-v1"]) concurrencyActions.add(directionalV1Action);
  for (const directionalCardAction of ["directional-report-card-draft-v1", "directional-report-card-finalize-v1", "directional-report-card-successor-v1", "directional-stage-a-present-v1"]) concurrencyActions.add(directionalCardAction);
  for (const v1PostSiteAction of ["site-evaluation-evidence-draft-v1", "site-evaluation-evidence-finalize-v1", "site-evaluation-evidence-successor-v1", "post-site-observation-draft-v1", "post-site-observation-finalize-v1", "post-site-observation-successor-v1", "energy-bar-evidence-draft-v1", "energy-bar-evidence-finalize-v1", "energy-bar-evidence-successor-v1", "energy-bar-state-draft-v1", "energy-bar-state-finalize-v1", "energy-bar-state-successor-v1", "elemental-evaluation-finalize-v1", "elemental-evaluation-successor-v1", "elemental-report-draft-v1", "elemental-report-finalize-v1", "elemental-report-successor-v1", "v1-full-balance-clearance-approve", "evaluation-remedy-handoff-create-v1", "combined-report-draft-v1", "combined-report-finalize-v1", "combined-report-successor-v1"]) concurrencyActions.add(v1PostSiteAction);
  concurrencyActions.add("floor-evidence-add");
  concurrencyActions.add("entrance-zones-confirm");
  for (const stageBAction of ["stage-b-remediation-initialise", "stage-b-final-layout-select", "stage-b-remedy-resolve", "stage-b-remedy-placement-upsert", "stage-b-remedy-placement-delete", "stage-b-page-finalise", "stage-b-integrity-validate", "stage-b-input-v1-draft", "stage-b-input-v1-finalize", "stage-b-input-v1-successor", "stage-b-readiness-v1"]) concurrencyActions.add(stageBAction);
  for (const sectionAAction of ["section-a-initialise", "section-a-asset-register", "section-a-annotation-upsert", "section-a-annotation-delete", "section-a-placement-upsert", "section-a-placement-delete", "section-a-colour-frame-upsert", "section-a-colour-frame-delete", "section-a-page-finalise", "section-a-integrity-validate", "remediation-report-integrity-validate"]) concurrencyActions.add(sectionAAction);
  for (const sectionCAction of ["section-c-extra-page-add", "section-c-extra-page-rename", "section-c-extra-pages-reorder", "section-c-extra-page-retire", "section-c-asset-register", "section-c-placement-upsert", "section-c-placement-delete", "section-c-page-finalise", "section-c-sequence-finalise", "section-c-integrity-validate"]) concurrencyActions.add(sectionCAction);
  for (const repositoryAction of ["repository-record-create", "repository-record-update", "repository-record-approve", "repository-record-archive", "repository-record-reactivate", "repository-preferred-asset-set", "repository-records-bulk-transition", "repository-case-used-create", "repository-case-used-merge", "repository-import-stage", "repository-import-approve", "repository-section-a-consume", "repository-section-c-consume"]) concurrencyActions.add(repositoryAction);
  const imageUtilityActions = new Set(["image-utility-derivative-process", "image-utility-task-retry", "image-utility-batch-process", "image-utility-derivative-retire"]);
  for (const imageAction of imageUtilityActions) concurrencyActions.add(imageAction);
  const brandingActions = new Set(["branding-legacy-bootstrap", "branding-profile-version-create", "branding-profile-draft-update", "branding-profile-activate", "branding-profile-archive", "document-template-version-create", "document-template-draft-update", "document-template-activate", "document-template-archive"]);
  for (const brandingAction of brandingActions) concurrencyActions.add(brandingAction);
  for (const deliveryAction of ["document-delivery-prepare", "document-delivery-mark-ready", "document-delivery-deliver", "document-delivery-acknowledge"]) concurrencyActions.add(deliveryAction);
  for (const founderCommercialAction of ["founder-commercial-policy-publish", "founder-commercial-legal-create", "founder-commercial-legal-activate", "founder-no-refund-policy-activate", "founder-commercial-policy-event-record", "founder-proposal-template-create", "founder-proposal-template-activate", "founder-proposal-draft-create", "founder-inbound-onboarding-create", "founder-proposal-step-save", "founder-proposal-review", "founder-proposal-approve", "founder-proposal-artifact-generate", "founder-proposal-send", "founder-proposal-successor", "founder-commercial-payment-confirm", "founder-complimentary-case-handoff", "founder-paid-case-handoff", "founder-case-intent-create", "founder-prospective-project-service-classify", "founder-balance-deadline-exception", "founder-invoice-issue", "founder-statutory-policy-create", "founder-statutory-policy-activate", "founder-billing-profile-save", "founder-statutory-document-issue"]) concurrencyActions.add(founderCommercialAction);
  let expectedGlobalRevision: number | undefined;
  let rollbackState: AppState | undefined;
  let globalRevisionStale = false;
  let appStatePersisted = false;
  const createdImageObjectKeys: string[] = [];

  function deny(message: string) {
    return NextResponse.json({ ok: false, error: message }, { status: 403 });
  }

  try {
    const authStartedAt = timing.start();
    actor = await resolveRequestActor(request.headers, body.actorRole);
    timing.end("auth", authStartedAt);
    // Explicit loopback demo runs use the same server-derived Founder
    // organisation context as hosted requests. This gives the disposable
    // synthetic owner a real capability binding for local rehearsal actions;
    // non-local requests still require the configured owner or membership.
    const foundationStartedAt = timing.start();
    foundation = await resolveActiveOrganisationContext(actor,
      isInitialOrganisationOwnerEmail(actor.email) || isExplicitLocalDemo(request.headers));
    timing.end("foundation", foundationStartedAt);
    if (foundation) {
      if (foundation.membership.role === "SPECIALIST") {
        return NextResponse.json({ ok: false, error: "Specialist access remains deferred until Team Edition." }, { status: 403 });
      }
      actor = { ...actor, role: foundation.membership.role, organisationId: foundation.organisation.id,
        organisationCapability: foundation.membership.capability };
      assertOrganisationRequestScope(getAppState(), body, foundation.organisation.id);
      organisationStateBefore = structuredClone(getAppState());
    }
    let response: unknown;

    if (concurrencyActions.has(action)) {
      const hasEntityVersion = action === "commercial-policy-update" ? "expectedPolicyVersion" in body : "expectedRecordVersion" in body;
      if (!hasEntityVersion || !("expectedRevision" in body)) {
        return NextResponse.json({ ok: false, error: "The latest case and state versions are required. Refresh and try again." }, { status: 428 });
      }
      const latest = await loadStateSnapshotFromPersistence((name, durationMs) => timing.record(`persistence-${name}`, durationMs));
      rollbackState = structuredClone(latest.state);
      globalRevisionStale = body.expectedRevision !== latest.revision;
      expectedGlobalRevision = latest.revision ?? undefined;
      if (imageUtilityActions.has(action) && globalRevisionStale) {
        setAppState(rollbackState);
        return NextResponse.json({ ok: false, error: "The saved state changed. Refresh and try again." }, { status: 409 });
      }
    }

    const domainStartedAt = timing.start();
    const crmAllowedFields: Record<string, string[]> = {
      "client-pipeline-transition": ["action", "actorRole", "clientId", "pipelineStage", "nextAction", "nextActionDueAt", "correction", "correctionReason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "commercial-policy-update": ["action", "actorRole", "defaultProposalAmountInr", "minimumAdvanceInr", "qualificationCallTargetMinutes", "nextActionDueSoonHours", "defaultReviewCallMinutes", "reason", "idempotencyKey", "expectedPolicyVersion", "expectedRevision"]
      ,"client-intake-upsert": ["action", "actorRole", "clientId", "caseId", "projectId", "contactPreference", "businessContext", "decisionMakerStatus", "otherDecisionMakers", "propertyContext", "needs", "consent", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
      ,"proposal-create": ["action", "actorRole", "clientId", "amountInr", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
      ,"proposal-approve": ["action", "actorRole", "clientId", "proposalId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
      ,"case-create": ["action", "actorRole", "clientId", "proposalId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
      ,"case-create-v1": ["action", "actorRole", "clientId", "proposalId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
      ,"case-property-context-upsert-v1": ["action", "actorRole", "clientId", "caseId", "projectId", "propertyContext", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
      ,"client-intake-profile-upsert-v1": ["action", "actorRole", "clientId", "caseId", "projectId", "contactPreference", "businessContext", "decisionMakerStatus", "otherDecisionMakers", "needs", "consent", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
      ,"client-intake-save-v1": ["action", "actorRole", "clientId", "caseId", "projectId", "propertyContext", "contactPreference", "businessContext", "decisionMakerStatus", "otherDecisionMakers", "needs", "consent", "idempotencyKey", "propertyContextExpectedRecordVersion", "clientExpectedRecordVersion", "expectedRecordVersion", "expectedRevision", "organisationId"]
    };
    if (crmAllowedFields[action]) {
      const allowed = new Set(crmAllowedFields[action]);
      const unknown = Object.keys(body).find((key) => !allowed.has(key));
      if (unknown) return NextResponse.json({ ok: false, error: `Unknown CRM field: ${unknown}.` }, { status: 400 });
    }

    const stageBAllowedFields: Record<string, string[]> = {
      "stage-b-remediation-initialise": ["action", "actorRole", "caseId", "floorId", "reportId", "reportSourceId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "revised-layout-candidate-create": ["action", "actorRole", "remediationId", "purpose", "evidenceRef", "label", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "revised-layout-candidate-approve": ["action", "actorRole", "candidateId", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "stage-b-final-layout-select": ["action", "actorRole", "remediationId", "candidateId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "stage-b-remedy-resolve": ["action", "actorRole", "remediationId", "verdictId", "stageBInputId", "remedialType", "refresh", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "stage-b-input-v1-draft": ["action", "actorRole", "handoffId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "stage-b-input-v1-finalize": ["action", "actorRole", "recordId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "stage-b-input-v1-successor": ["action", "actorRole", "predecessorId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "stage-b-readiness-v1": ["action", "actorRole", "caseId", "floorId", "idempotencyKey", "expectedRecordVersion", "reservationRecordVersion", "expectedRevision"],
      "stage-b-remedy-placement-upsert": ["action", "actorRole", "remediationId", "pageId", "placementId", "eligibilityResolutionId", "baseLayoutVersionId", "placementType", "anchorX", "anchorY", "calloutX", "calloutY", "calloutWidth", "calloutHeight", "locationReference", "showCircle", "showFrame", "showHighlight", "completePlacement", "reconcileInvalidationId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "stage-b-remedy-placement-delete": ["action", "actorRole", "remediationId", "pageId", "placementId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "stage-b-page-finalise": ["action", "actorRole", "remediationId", "pageId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "stage-b-integrity-validate": ["action", "actorRole", "remediationId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
    };
    Object.assign(stageBAllowedFields, {
      "section-a-initialise": ["action", "actorRole", "remediationId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "section-a-asset-register": ["action", "actorRole", "remediationId", "assetType", "name", "attributePurpose", "assetId", "assetVersionId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "section-a-annotation-upsert": ["action", "actorRole", "remediationId", "pageId", "annotationId", "annotationType", "points", "text", "colour", "strokeWidth", "opacity", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "section-a-annotation-delete": ["action", "actorRole", "remediationId", "pageId", "annotationId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "section-a-placement-upsert": ["action", "actorRole", "remediationId", "pageId", "placementId", "sectionAAssetId", "baseLayoutVersionId", "placementType", "anchorX", "anchorY", "calloutX", "calloutY", "calloutWidth", "calloutHeight", "locationReference", "showCircle", "showFrame", "showHighlight", "completePlacement", "reconcileInvalidationId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "section-a-placement-delete": ["action", "actorRole", "remediationId", "pageId", "placementId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "section-a-colour-frame-upsert": ["action", "actorRole", "remediationId", "pageId", "compositionId", "sectionAAssetId", "baseLayoutVersionId", "x", "y", "width", "height", "rotationDegrees", "opacityPreset", "preserveAspectRatio", "printFit", "locked", "reconcileInvalidationId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "section-a-colour-frame-delete": ["action", "actorRole", "remediationId", "pageId", "compositionId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "section-a-page-finalise": ["action", "actorRole", "remediationId", "pageId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "section-a-integrity-validate": ["action", "actorRole", "remediationId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "remediation-report-integrity-validate": ["action", "actorRole", "remediationId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
      ,"section-c-extra-page-add": ["action", "actorRole", "remediationId", "title", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
      ,"section-c-extra-page-rename": ["action", "actorRole", "remediationId", "extraPageId", "title", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
      ,"section-c-extra-pages-reorder": ["action", "actorRole", "remediationId", "extraPageIds", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
      ,"section-c-extra-page-retire": ["action", "actorRole", "remediationId", "extraPageId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
      ,"section-c-asset-register": ["action", "actorRole", "remediationId", "extraPageId", "name", "attributePurpose", "assetId", "assetVersionId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
      ,"section-c-placement-upsert": ["action", "actorRole", "remediationId", "extraPageId", "placementId", "sectionCAssetId", "baseLayoutVersionId", "placementType", "anchorX", "anchorY", "calloutX", "calloutY", "calloutWidth", "calloutHeight", "locationReference", "showCircle", "showFrame", "showHighlight", "completePlacement", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
      ,"section-c-placement-delete": ["action", "actorRole", "remediationId", "extraPageId", "placementId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
      ,"section-c-page-finalise": ["action", "actorRole", "remediationId", "extraPageId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
      ,"section-c-sequence-finalise": ["action", "actorRole", "remediationId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
      ,"section-c-integrity-validate": ["action", "actorRole", "remediationId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
    });
    if (stageBAllowedFields[action]) {
      const allowed = new Set(stageBAllowedFields[action]);
      const unknown = Object.keys(body).find((key) => !allowed.has(key));
      if (unknown) return NextResponse.json({ ok: false, error: `Unknown Stage B field: ${unknown}.` }, { status: 400 });
    }

    const documentDeliveryAllowedFields: Record<string, string[]> = {
      "document-delivery-prepare": ["action", "actorRole", "reportId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "document-delivery-mark-ready": ["action", "actorRole", "deliveryId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "document-delivery-deliver": ["action", "actorRole", "deliveryId", "channel", "manualHandoffDescription", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "document-delivery-acknowledge": ["action", "actorRole", "deliveryId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
    };
    if (documentDeliveryAllowedFields[action]) {
      const allowed = new Set(documentDeliveryAllowedFields[action]); const unknown = Object.keys(body).find((key) => !allowed.has(key));
      if (unknown) return NextResponse.json({ ok: false, error: `Unknown document-delivery field: ${unknown}.` }, { status: 400 });
      if (typeof body.idempotencyKey !== "string" || body.idempotencyKey.trim().length < 8 || body.idempotencyKey.length > 160) {
        return NextResponse.json({ ok: false, error: "A stable idempotency key is required for this protected delivery action." }, { status: 400 });
      }
    }

    const repositoryAllowedFields: Record<string, string[]> = {
      "repository-record-create": ["action", "actorRole", "category", "name", "attributePurpose", "assetId", "assetVersionId", "elements", "directions", "tags", "duplicatePolicy", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "repository-record-update": ["action", "actorRole", "recordId", "name", "attributePurpose", "elements", "directions", "tags", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "repository-record-approve": ["action", "actorRole", "recordId", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "repository-record-archive": ["action", "actorRole", "recordId", "replacementRecordId", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "repository-record-reactivate": ["action", "actorRole", "recordId", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "repository-preferred-asset-set": ["action", "actorRole", "recordId", "assetId", "assetVersionId", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "repository-records-bulk-transition": ["action", "actorRole", "records", "target", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "repository-case-used-create": ["action", "actorRole", "remediationId", "pageId", "name", "attributePurpose", "assetId", "assetVersionId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "repository-case-used-merge": ["action", "actorRole", "caseUsedRemedyId", "elements", "directions", "tags", "duplicatePolicy", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "repository-import-stage": ["action", "actorRole", "filename", "csv", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "repository-import-approve": ["action", "actorRole", "batchId", "rowIds", "duplicatePolicy", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "repository-section-a-consume": ["action", "actorRole", "remediationId", "recordId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "repository-section-c-consume": ["action", "actorRole", "remediationId", "extraPageId", "recordId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
    };
    if (repositoryAllowedFields[action]) {
      const allowed = new Set(repositoryAllowedFields[action]); const unknown = Object.keys(body).find((key) => !allowed.has(key));
      if (unknown) return NextResponse.json({ ok: false, error: `Unknown Repository Administration field: ${unknown}.` }, { status: 400 });
    }

    const imageUtilityAllowedFields: Record<string, string[]> = {
      "image-utility-derivative-process": ["action", "actorRole", "sourceVersionId", "transformationType", "parameters", "outputFormat", "purpose", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "image-utility-task-retry": ["action", "actorRole", "taskId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "image-utility-batch-process": ["action", "actorRole", "sourceVersionIds", "transformationType", "parameters", "outputFormat", "purpose", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "image-utility-derivative-retire": ["action", "actorRole", "derivativeId", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
    };
    if (imageUtilityAllowedFields[action]) {
      const allowed = new Set(imageUtilityAllowedFields[action]); const unknown = Object.keys(body).find((key) => !allowed.has(key));
      if (unknown) return NextResponse.json({ ok: false, error: `Unknown Image Utility field: ${unknown}.` }, { status: 400 });
      if (typeof body.idempotencyKey !== "string" || body.idempotencyKey.trim().length < 8 || body.idempotencyKey.length > 180) {
        return NextResponse.json({ ok: false, error: "A stable idempotency key is required for this protected Image Utility action." }, { status: 400 });
      }
    }
    const brandingAllowedFields: Record<string, string[]> = {
      "branding-legacy-bootstrap": ["action", "actorRole", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "branding-profile-version-create": ["action", "actorRole", "sourceProfileId", "profile", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "branding-profile-draft-update": ["action", "actorRole", "profileId", "profile", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "branding-profile-activate": ["action", "actorRole", "profileId", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "branding-profile-archive": ["action", "actorRole", "profileId", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "document-template-version-create": ["action", "actorRole", "family", "sourceTemplateId", "template", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "document-template-draft-update": ["action", "actorRole", "templateId", "template", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "document-template-activate": ["action", "actorRole", "templateId", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "document-template-archive": ["action", "actorRole", "templateId", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
    };
    if (brandingAllowedFields[action]) {
      const allowed = new Set(brandingAllowedFields[action]); const unknown = Object.keys(body).find((key) => !allowed.has(key));
      if (unknown) return NextResponse.json({ ok: false, error: `Unknown Brand & Document Templates field: ${unknown}.` }, { status: 400 });
      if (typeof body.idempotencyKey !== "string" || body.idempotencyKey.trim().length < 8 || body.idempotencyKey.length > 180) return NextResponse.json({ ok: false, error: "A stable idempotency key is required for this protected branding action." }, { status: 400 });
    }

    const founderEngagementAllowedFields: Record<string, string[]> = {
      "founder-lead-profile-update": ["action", "actorRole", "leadId", "changes", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "founder-media-dry-run": ["action", "actorRole", "assetKey", "filename", "sizeBytes", "pageCount", "checksumSha256"],
      "founder-media-register": ["action", "actorRole", "assetKey", "privateObjectKey", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "founder-media-transition": ["action", "actorRole", "versionId", "target", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "founder-qualification-invite": ["action", "actorRole", "leadId", "clientId", "prospectiveProjectId", "kind", "selectedServices", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "founder-communication-context": ["action", "actorRole", "leadId", "clientId", "prospectiveProjectId", "templateKey", "serviceType", "qualificationKind", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "founder-communication-prepare": ["action", "actorRole", "leadId", "clientId", "prospectiveProjectIds", "templateKey", "values", "channel", "recipient", "assetVersionIds", "formDefinitionId", "bookingId", "grantIds", "renderedTimeZoneSnapshot", "manualNote", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "founder-communication-opened": ["action", "actorRole", "preparationId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "founder-booking-assign": ["action", "actorRole", "responseVersionId", "startsAt", "timeZone", "confirmationGrantId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "founder-booking-reschedule": ["action", "actorRole", "bookingId", "startsAt", "timeZone", "confirmationGrantId", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "founder-booking-cancel": ["action", "actorRole", "bookingId", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
    };
    if (founderEngagementAllowedFields[action]) {
      const allowed = new Set(founderEngagementAllowedFields[action]);
      const unknown = Object.keys(body).find((key) => !allowed.has(key));
      if (unknown) return NextResponse.json({ ok: false, error: `Unknown Founder engagement field: ${unknown}.` }, { status: 400 });
    }

    const founderCommercialAllowedFields: Record<string, string[]> = {
      "founder-legal-policy-version-create-from-canonical": ["action", "actorRole", "kind", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "founder-legal-policy-approve": ["action", "actorRole", "policyId", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "founder-legal-policy-activate": ["action", "actorRole", "policyId", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "founder-commercial-policy-publish": ["action", "actorRole", "referenceFeePaise", "referenceAdvancePaise", "defaultGstBasisPoints", "reason", "idempotencyKey", "expectedActiveVersion", "expectedRecordVersion", "expectedRevision"],
      "founder-commercial-legal-create": ["action", "actorRole", "kind", "title", "exactText", "configuration", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "founder-commercial-legal-activate": ["action", "actorRole", "policyId", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "founder-no-refund-policy-activate": ["action", "actorRole", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "founder-commercial-policy-event-record": ["action", "actorRole", "clientId", "prospectiveProjectId", "proposalVersionId", "eventType", "reason", "revisedEstimate", "replacementDateOrSlot", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "founder-proposal-template-create": ["action", "actorRole", "serviceType", "name", "kind", "scopeItems", "deliverables", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "founder-proposal-template-activate": ["action", "actorRole", "templateId", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "founder-proposal-draft-create": ["action", "actorRole", "clientId", "prospectiveProjectId", "classification", "professionalFeePaise", "appliedGstBasisPoints", "agreedAdvancePaise", "feeDeviationReason", "classificationReason", "gstDeviationReason", "advanceExceptionReason", "idempotencyKey", "expectedProjectVersion", "expectedRecordVersion", "expectedRevision"],
      "founder-inbound-onboarding-create": ["action", "actorRole", "clientId", "prospectiveProjectId", "classification", "professionalFeePaise", "appliedGstBasisPoints", "agreedAdvancePaise", "advanceReceivedPaise", "paymentId", "paymentMode", "feeDeviationReason", "classificationReason", "gstDeviationReason", "advanceExceptionReason", "idempotencyKey", "expectedProjectVersion", "expectedRecordVersion", "expectedRevision"],
      "founder-proposal-step-save": ["action", "actorRole", "proposalVersionId", "step", "patch", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "founder-proposal-review": ["action", "actorRole", "proposalVersionId", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "founder-proposal-approve": ["action", "actorRole", "proposalVersionId", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "founder-proposal-artifact-generate": ["action", "actorRole", "proposalVersionId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "founder-proposal-send": ["action", "actorRole", "proposalVersionId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "founder-proposal-successor": ["action", "actorRole", "proposalVersionId", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "founder-complimentary-case-handoff": ["action", "actorRole", "proposalVersionId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "founder-paid-case-handoff": ["action", "actorRole", "proposalVersionId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "founder-case-intent-create": ["action", "actorRole", "clientId", "serviceType", "propertyType", "displayName", "propertyLocation", "floorCount", "importantNotes", "confirmPossibleDuplicate", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "founder-project-scope-save": ["action", "actorRole", "clientId", "leadId", "serviceType", "propertyType", "displayName", "propertyLocation", "floorCount", "importantNotes", "confirmPossibleDuplicate", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "founder-prospective-project-service-classify": ["action", "actorRole", "prospectiveProjectId", "serviceType", "clientId", "leadId", "responseVersionId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "founder-commercial-payment-confirm": ["action", "actorRole", "proposalVersionId", "paymentId", "type", "amountPaise", "idempotencyKey", "expectedProposalRecordVersion", "expectedRecordVersion", "expectedRevision"],
      "founder-balance-deadline-exception": ["action", "actorRole", "proposalVersionId", "exceptionAction", "newDueAt", "reason", "engagementClassification", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "founder-invoice-issue": ["action", "actorRole", "proposalVersionId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
      ,"founder-statutory-policy-create": ["action", "actorRole", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
      ,"founder-statutory-policy-activate": ["action", "actorRole", "policyId", "accountantApprovalReference", "approvedServiceTypes", "serviceTimingPolicyText", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
      ,"founder-billing-profile-save": ["action", "actorRole", "clientId", "prospectiveProjectId", "billingLegalName", "billingAddress", "billingState", "billingPin", "recipientRegisteredForGst", "recipientGstin", "clientLocationCountry", "clientLocationState", "propertyLocation", "serviceLocation", "timeZone", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
      ,"founder-statutory-document-issue": ["action", "actorRole", "documentId", "serviceSuppliedAt", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
    };
    if (founderCommercialAllowedFields[action]) {
      const allowed = new Set(founderCommercialAllowedFields[action]);
      const unknown = Object.keys(body).find((key) => !allowed.has(key));
      if (unknown) return NextResponse.json({ ok: false, error: `Unknown Founder commercial field: ${unknown}.` }, { status: 400 });
    }

    const assessmentAllowedFields: Record<string, string[]> = {
      "assessment-observation-upsert": ["recordId", "floorId", "title", "observation", "alignmentStatus", "energyStatus", "placementStatus", "evidenceRefs"],
      "assessment-recommendation-upsert": ["recordId", "floorId", "title", "rationale", "recommendedAction", "decisionPriority", "attentionClass", "implementationHorizon", "level", "observationIds", "evidenceRefs"],
      "assessment-implementation-upsert": ["recordId", "floorId", "recommendationId", "title", "notes", "status", "implementationHorizon", "ownerRole", "ownerName", "evidenceRefs"]
      ,"case-document-upsert": ["recordId", "assetType", "floorLabel", "versionLabel", "documentDate", "isCurrent", "successorOfDocumentId", "evidenceRef", "discrepancy", "blocker", "reviewObservation", "requiredChange", "preferredAlternative", "acceptableAlternative", "ownerRole", "ownerName", "revisionStatus"]
      ,"case-document-issue-resolve": ["recordId", "resolutionNote"]
      ,"delivery-milestone-upsert": ["recordId", "kind", "sequence", "roundLabel", "title", "status", "dueDate", "ownerRole", "ownerName", "drawingRef", "observationSummary", "actionSummary", "reason", "evidenceRefs"]
    };
    if (assessmentAllowedFields[action]) {
      const allowed = new Set(["action", "actorRole", "caseId", "idempotencyKey", "expectedRecordVersion", "expectedRevision", ...assessmentAllowedFields[action]]);
      const unknown = Object.keys(body).find((key) => !allowed.has(key));
      if (unknown) return NextResponse.json({ ok: false, error: `Unknown assessment field: ${unknown}.` }, { status: 400 });
    }
    const siteAllowedFields: Record<string, string[]> = {
      "site-analysis-upsert": ["caseId", "floorId", "recordId", "stageAVerdictReportId", "evidenceType", "evidenceRefs", "capturedAt", "visitMetadata", "site", "entrance", "surroundings", "light", "ventilation", "airflow", "neighbouringEffects", "relevantObservations"],
      "site-analysis-checkpoint": ["caseId", "floorId", "recordId", "checkpoint", "reason"],
      "post-site-findings-upsert": ["caseId", "floorId", "recordId", "siteAnalysisId", "reportId", "upstreamEvaluationVersionId", "differences", "corrections", "newFindings", "additionalObservations"],
      "post-site-findings-checkpoint": ["caseId", "floorId", "recordId", "checkpoint", "reason"],
      "manual-sheet-approve": ["caseId", "floorId", "documentId", "reason"]
    };
    if (siteAllowedFields[action]) {
      const allowed = new Set(["action", "actorRole", "idempotencyKey", "expectedRecordVersion", "expectedRevision", ...siteAllowedFields[action]]);
      if (Object.keys(body).some((field) => !allowed.has(field))) return NextResponse.json({ ok: false, error: "Unsupported site workflow field." }, { status: 400 });
    }
    const paymentAllowedFields: Record<string, string[]> = {
      "advance-proof-verify": ["action", "actorRole", "clientId", "proposalId", "amountInr", "proofId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "balance-proof-verify": ["action", "actorRole", "clientId", "caseId", "amountInr", "proofId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
    };
    if (paymentAllowedFields[action]) {
      const allowed = new Set(paymentAllowedFields[action]);
      const unknown = Object.keys(body).find((key) => !allowed.has(key));
      if (unknown) return NextResponse.json({ ok: false, error: `Unknown payment field: ${unknown}.` }, { status: 400 });
    }
    const reportAllowedFields: Record<string, string[]> = {
      "preview-report": ["action", "actorRole", "clientId", "caseId", "floorId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "final-report-prepare": ["action", "actorRole", "clientId", "caseId", "floorId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "report-approve": ["action", "actorRole", "clientId", "reportId", "comment", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "verdict-release": ["action", "actorRole", "clientId", "reportId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "stage-a-present": ["action", "actorRole", "clientId", "caseId", "floorId", "note", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
    };
    if (reportAllowedFields[action]) {
      const allowed = new Set(reportAllowedFields[action]);
      const unknown = Object.keys(body).find((key) => !allowed.has(key));
      if (unknown) return NextResponse.json({ ok: false, error: `Unknown report field: ${unknown}.` }, { status: 400 });
    }
    const spatialAllowedFields: Record<string, string[]> = {
      "plan-version-create": ["action", "actorRole", "caseId", "floorId", "versionLabel", "evidenceRef", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "spatial-evidence-create": ["action", "actorRole", "caseId", "floorId", "planVersionId", "kind", "classification", "manualEvidencePurpose", "has32SectorChakra", "has16DirectionMapping", "dualPurposeMarkedLayersConfirmed", "evidenceRef", "fullColourConfirmed", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "orientation-version-lock": ["action", "actorRole", "caseId", "exactDegree", "googleEarthEvidenceVersionId", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "entrance-zones-confirm": ["action", "actorRole", "caseId", "floorId", "planVersionId", "marked32EvidenceVersionId", "propertyMainGateZoneCode", "floorGateZoneCode", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "floor-create": ["action", "actorRole", "caseId", "floorLabel", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "opening-mapping-create": ["action", "actorRole", "caseId", "floorId", "planVersionId", "orientationVersionId", "evidenceVersionId", "kind", "markerX", "markerY", "verified", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "space-mapping-create": ["action", "actorRole", "caseId", "floorId", "planVersionId", "orientationVersionId", "evidenceVersionId", "spaceLabel", "polygon", "verified", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
      ,"regeneration-transition": ["action", "actorRole", "caseId", "floorId", "invalidationId", "toStatus", "replacementVersionId", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
    };
    if (spatialAllowedFields[action]) {
      const allowed = new Set(spatialAllowedFields[action]);
      const unknown = Object.keys(body).find((key) => !allowed.has(key));
      if (unknown) return NextResponse.json({ ok: false, error: "Unsupported spatial workflow field." }, { status: 400 });
    }
    const methodologyAllowedFields: Record<string, string[]> = {
      "methodology-version-create": ["action", "actorRole", "module", "label", "sourceLabel", "sourceAssetVersion", "sourceAssetHash", "executionAdapterVersion", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "methodology-version-authority-bind": ["action", "actorRole", "methodologyVersionId", "sourceAssetVersion", "sourceAssetHash", "executionAdapterVersion", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "methodology-rule-upsert": ["action", "actorRole", "methodologyVersionId", "recordId", "ruleKey", "sourceReference", "decisionStatus", "conditionJson", "outcomeJson", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "methodology-fixture-upsert": ["action", "actorRole", "methodologyVersionId", "recordId", "fixtureKey", "inputJson", "expectedOutputJson", "decisionStatus", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "methodology-version-publish": ["action", "actorRole", "methodologyVersionId", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "aou-source-initialize": ["action", "actorRole", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "aou-display-draft": ["action", "actorRole", "rowId", "fields", "cleanupOnlyConfirmed", "meaningChangeConfirmed", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "aou-display-approve": ["action", "actorRole", "rowId", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
    };
    if (methodologyAllowedFields[action]) {
      const allowed = new Set(methodologyAllowedFields[action]);
      if (Object.keys(body).some((field) => !allowed.has(field))) return NextResponse.json({ ok: false, error: "Unsupported methodology field." }, { status: 400 });
    }
    const evaluationAllowedFields: Record<string, string[]> = {
      "utility-evaluate": ["action", "actorRole", "caseId", "floorId", "snapshotName", "zoneCodes", "utilityInputs", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "utility-verdict": ["action", "actorRole", "caseId", "floorId", "utilityEvaluationSnapshotId", "element", "directionSet", "bars", "redLine", "balanceLine", "blueLine", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "shakti-rank": ["action", "actorRole", "caseId", "floorId", "values", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
      ,"evaluation-replacement-request": ["action", "actorRole", "caseId", "floorId", "targetType", "snapshotId", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
      ,"d8-orientation-finalize-v1": ["action", "actorRole", "caseId", "projectId", "floorId", "orientationVersionId", "orientationEvidenceVersionId", "exactDegree", "methodologyVersionId", "methodologyContentHash", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
      ,"d16-mapping-draft-v1": ["action", "actorRole", "caseId", "projectId", "floorId", "rows", "methodologyVersionId", "methodologyVersion", "methodologyContentHash", "externalD16EvidenceVersionId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
      ,"d16-mapping-finalize-v1": ["action", "actorRole", "caseId", "mappingId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
      ,"d16-mapping-successor-v1": ["action", "actorRole", "caseId", "projectId", "floorId", "predecessorId", "rows", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
      ,"d32-entrance-draft-v1": ["action", "actorRole", "caseId", "floorId", "planVersionId", "marked32EvidenceVersionId", "propertyMainGateZoneCode", "floorGateZoneCode", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
      ,"d32-entrance-finalize-v1": ["action", "actorRole", "caseId", "floorId", "scope", "draftId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
      ,"d32-entrance-successor-v1": ["action", "actorRole", "caseId", "floorId", "scope", "draftId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
      ,"directional-input-draft-v1": ["action", "actorRole", "caseId", "projectId", "floorId", "modifierFindings", "noConfirmedD8Modifiers", "circulationState", "methodologyVersionId", "methodologyContentHash", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
      ,"directional-input-finalize-v1": ["action", "actorRole", "caseId", "projectId", "floorId", "inputId", "expectedInputVersion", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
      ,"directional-input-successor-v1": ["action", "actorRole", "predecessorId", "modifierFindings", "noConfirmedD8Modifiers", "circulationState", "methodologyVersionId", "methodologyContentHash", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
      ,"directional-evaluation-finalize-v1": ["action", "actorRole", "caseId", "projectId", "floorId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
      ,"directional-evaluation-successor-v1": ["action", "actorRole", "caseId", "projectId", "floorId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
      ,"directional-report-card-draft-v1": ["action", "actorRole", "caseId", "projectId", "floorId", "statements", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
      ,"directional-report-card-finalize-v1": ["action", "actorRole", "snapshotId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
      ,"directional-report-card-successor-v1": ["action", "actorRole", "predecessorId", "statements", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
      ,"directional-stage-a-present-v1": ["action", "actorRole", "reportCardSnapshotId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
      ,"site-evaluation-evidence-draft-v1": ["action", "actorRole", "caseId", "projectId", "floorId", "mode", "evidenceRef", "artifactHash", "fileName", "fileSize", "evidenceDate", "expectedRecordVersion", "idempotencyKey", "expectedRevision"]
      ,"site-evaluation-evidence-finalize-v1": ["action", "actorRole", "recordId", "expectedRecordVersion", "idempotencyKey", "expectedRevision"]
      ,"site-evaluation-evidence-successor-v1": ["action", "actorRole", "predecessorId", "mode", "evidenceRef", "artifactHash", "fileName", "fileSize", "evidenceDate", "expectedRecordVersion", "idempotencyKey", "expectedRevision"]
      ,"post-site-observation-draft-v1": ["action", "actorRole", "caseId", "projectId", "floorId", "naturalLight", "ventilation", "methodologyVersionId", "methodologyContentHash", "expectedRecordVersion", "idempotencyKey", "expectedRevision"]
      ,"post-site-observation-finalize-v1": ["action", "actorRole", "recordId", "expectedRecordVersion", "idempotencyKey", "expectedRevision"]
      ,"post-site-observation-successor-v1": ["action", "actorRole", "predecessorId", "naturalLight", "ventilation", "methodologyVersionId", "methodologyContentHash", "expectedRecordVersion", "idempotencyKey", "expectedRevision"]
      ,"energy-bar-evidence-draft-v1": ["action", "actorRole", "caseId", "projectId", "floorId", "evidenceRef", "artifactHash", "fileName", "fileSize", "expectedRecordVersion", "idempotencyKey", "expectedRevision"]
      ,"energy-bar-evidence-finalize-v1": ["action", "actorRole", "recordId", "expectedRecordVersion", "idempotencyKey", "expectedRevision"]
      ,"energy-bar-evidence-successor-v1": ["action", "actorRole", "predecessorId", "evidenceRef", "artifactHash", "fileName", "fileSize", "expectedRecordVersion", "idempotencyKey", "expectedRevision"]
      ,"energy-bar-state-draft-v1": ["action", "actorRole", "caseId", "projectId", "floorId", "evidenceVersionId", "directions", "methodologyVersionId", "methodologyContentHash", "expectedRecordVersion", "idempotencyKey", "expectedRevision"]
      ,"energy-bar-state-finalize-v1": ["action", "actorRole", "recordId", "expectedRecordVersion", "idempotencyKey", "expectedRevision"]
      ,"energy-bar-state-successor-v1": ["action", "actorRole", "predecessorId", "evidenceVersionId", "directions", "methodologyVersionId", "methodologyContentHash", "expectedRecordVersion", "idempotencyKey", "expectedRevision"]
      ,"elemental-evaluation-finalize-v1": ["action", "actorRole", "caseId", "projectId", "floorId", "expectedRecordVersion", "idempotencyKey", "expectedRevision"]
      ,"elemental-evaluation-successor-v1": ["action", "actorRole", "predecessorId", "expectedRecordVersion", "idempotencyKey", "expectedRevision"]
      ,"elemental-report-draft-v1": ["action", "actorRole", "caseId", "projectId", "floorId", "expectedRecordVersion", "idempotencyKey", "expectedRevision"]
      ,"elemental-report-finalize-v1": ["action", "actorRole", "snapshotId", "expectedRecordVersion", "idempotencyKey", "expectedRevision"]
      ,"elemental-report-successor-v1": ["action", "actorRole", "predecessorId", "expectedRecordVersion", "idempotencyKey", "expectedRevision"]
      ,"evaluation-remedy-handoff-create-v1": ["action", "actorRole", "caseId", "projectId", "floorId", "expectedRecordVersion", "idempotencyKey", "expectedRevision"]
      ,"v1-full-balance-clearance-approve": ["action", "actorRole", "caseId", "projectId", "floorId", "expectedRecordVersion", "idempotencyKey", "expectedRevision"]
      ,"stage-b-input-v1-draft": ["action", "actorRole", "handoffId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
      ,"stage-b-input-v1-finalize": ["action", "actorRole", "recordId", "expectedRecordVersion", "idempotencyKey", "expectedRevision"]
      ,"stage-b-input-v1-successor": ["action", "actorRole", "predecessorId", "expectedRecordVersion", "idempotencyKey", "expectedRevision"]
      ,"combined-report-draft-v1": ["action", "actorRole", "caseId", "projectId", "floorId", "expectedRecordVersion", "idempotencyKey", "expectedRevision"]
      ,"combined-report-finalize-v1": ["action", "actorRole", "snapshotId", "expectedRecordVersion", "idempotencyKey", "expectedRevision"]
      ,"combined-report-successor-v1": ["action", "actorRole", "predecessorId", "expectedRecordVersion", "idempotencyKey", "expectedRevision"]
    };
    if (evaluationAllowedFields[action] && Object.keys(body).some((field) => !evaluationAllowedFields[action].includes(field))) return NextResponse.json({ ok: false, error: "Unsupported evaluation field." }, { status: 400 });
    if (["case-create-v1", "case-property-context-upsert-v1", "client-intake-profile-upsert-v1", "client-intake-save-v1", "floor-evidence-add", "floor-ready", "d8-orientation-finalize-v1", "d16-mapping-draft-v1", "d16-mapping-finalize-v1", "d16-mapping-successor-v1", "d32-entrance-draft-v1", "d32-entrance-finalize-v1", "d32-entrance-successor-v1", "directional-input-draft-v1", "directional-input-finalize-v1", "directional-input-successor-v1", "directional-evaluation-finalize-v1", "directional-evaluation-successor-v1", "directional-report-card-draft-v1", "directional-report-card-finalize-v1", "directional-report-card-successor-v1", "directional-stage-a-present-v1"].includes(action) && (typeof body.idempotencyKey !== "string" || body.idempotencyKey.trim().length < 8 || body.idempotencyKey.length > 160)) return NextResponse.json({ ok: false, error: "A stable idempotency key is required for this protected action." }, { status: 400 });
      if (["site-evaluation-evidence-successor-v1", "post-site-observation-successor-v1", "energy-bar-evidence-successor-v1", "energy-bar-state-successor-v1", "elemental-evaluation-successor-v1", "elemental-report-successor-v1", "combined-report-successor-v1"].includes(action) && (typeof body.expectedRecordVersion !== "number" || !Number.isInteger(body.expectedRecordVersion) || body.expectedRecordVersion < 1)) return NextResponse.json({ ok: false, error: "A current entity expectedRecordVersion is required for successor actions." }, { status: 400 });
      if (["energy-bar-evidence-draft-v1", "energy-bar-state-draft-v1"].includes(action) && (typeof body.expectedRecordVersion !== "number" || !Number.isInteger(body.expectedRecordVersion) || body.expectedRecordVersion < 1)) return NextResponse.json({ ok: false, error: "A current upstream entity expectedRecordVersion is required for Energy draft actions." }, { status: 400 });
      if (["site-evaluation-evidence-draft-v1", "site-evaluation-evidence-finalize-v1", "site-evaluation-evidence-successor-v1", "post-site-observation-draft-v1", "post-site-observation-finalize-v1", "post-site-observation-successor-v1", "energy-bar-evidence-draft-v1", "energy-bar-evidence-finalize-v1", "energy-bar-evidence-successor-v1", "energy-bar-state-draft-v1", "energy-bar-state-finalize-v1", "energy-bar-state-successor-v1", "elemental-evaluation-finalize-v1", "elemental-evaluation-successor-v1", "elemental-report-draft-v1", "elemental-report-finalize-v1", "elemental-report-successor-v1", "v1-full-balance-clearance-approve", "evaluation-remedy-handoff-create-v1", "combined-report-draft-v1", "combined-report-finalize-v1", "combined-report-successor-v1"].includes(action) && (typeof body.idempotencyKey !== "string" || body.idempotencyKey.trim().length < 8 || body.idempotencyKey.length > 160)) return NextResponse.json({ ok: false, error: "A stable idempotency key is required for this protected V1 action." }, { status: 400 });
      if (founderCommercialAllowedFields[action] && (typeof body.idempotencyKey !== "string" || body.idempotencyKey.trim().length < 8 || body.idempotencyKey.length > 160)) return NextResponse.json({ ok: false, error: "A stable idempotency key is required for this protected Founder commercial action." }, { status: 400 });
      if (["stage-b-input-v1-draft", "stage-b-input-v1-finalize", "stage-b-input-v1-successor", "stage-b-readiness-v1"].includes(action) && (typeof body.idempotencyKey !== "string" || body.idempotencyKey.trim().length < 8 || body.idempotencyKey.length > 160)) return NextResponse.json({ ok: false, error: "A stable idempotency key is required for this protected Stage B V1 action." }, { status: 400 });
    if ((action === "entrance-zones-confirm" || ["founder-lead-profile-update", "founder-media-register", "founder-media-transition", "founder-qualification-invite", "founder-communication-prepare", "founder-communication-opened", "founder-booking-assign", "founder-booking-reschedule", "founder-booking-cancel", "proposal-create", "proposal-approve", "case-create", "advance-proof-verify", "preview-report", "stage-a-present", "balance-proof-verify", "final-report-prepare", "report-approve", "verdict-release", "utility-evaluate", "utility-verdict", "shakti-rank", "evaluation-replacement-request", "floor-create", "plan-version-create", "spatial-evidence-create", "orientation-version-lock", "opening-mapping-create", "space-mapping-create", "regeneration-transition", "methodology-version-create", "methodology-version-authority-bind", "methodology-rule-upsert", "methodology-fixture-upsert", "methodology-version-publish", "aou-source-initialize", "aou-display-draft", "aou-display-approve", "site-analysis-upsert", "site-analysis-checkpoint", "post-site-findings-upsert", "post-site-findings-checkpoint", "manual-sheet-approve"].includes(action))
      && (typeof body.idempotencyKey !== "string" || body.idempotencyKey.trim().length < 8 || body.idempotencyKey.length > 160)) {
      return NextResponse.json({ ok: false, error: "A stable idempotency key is required for this protected action." }, { status: 400 });
    }

    switch (action) {
      case "founder-legal-policy-version-create-from-canonical": {
        const organisationId = foundation?.organisation.id ?? actor.organisationId!; response = { ok: true, policy: createFounderCanonicalLegalPolicyVersion({ state: getAppState(), actor, founderUserId: foundation?.organisation.founderUserId ?? actor.id, organisationId, kind: body.kind, reason: body.reason, idempotencyKey: body.idempotencyKey }) }; break;
      }
      case "founder-legal-policy-approve": {
        const organisationId = foundation?.organisation.id ?? actor.organisationId!; response = { ok: true, policy: approveFounderLegalPolicy({ state: getAppState(), actor, founderUserId: foundation?.organisation.founderUserId ?? actor.id, organisationId, policyId: body.policyId, reason: body.reason, idempotencyKey: body.idempotencyKey, expectedRecordVersion: body.expectedRecordVersion }) }; break;
      }
      case "founder-legal-policy-activate": {
        const organisationId = foundation?.organisation.id ?? actor.organisationId!; response = { ok: true, policy: activateFounderLegalPolicy({ state: getAppState(), actor, founderUserId: foundation?.organisation.founderUserId ?? actor.id, organisationId, policyId: body.policyId, reason: body.reason, idempotencyKey: body.idempotencyKey, expectedRecordVersion: body.expectedRecordVersion }) }; break;
      }
      case "founder-commercial-policy-publish": {
        const organisationId = foundation?.organisation.id ?? actor.organisationId!; response = { ok: true, policy: publishFounderCommercialPolicy({ state: getAppState(), actor, founderUserId: foundation?.organisation.founderUserId ?? actor.id, organisationId, referenceFeePaise: Number(body.referenceFeePaise), referenceAdvancePaise: Number(body.referenceAdvancePaise), defaultGstBasisPoints: Number(body.defaultGstBasisPoints), reason: body.reason, idempotencyKey: body.idempotencyKey, expectedActiveVersion: body.expectedActiveVersion }) }; break;
      }
      case "founder-commercial-legal-create": {
        const organisationId = foundation?.organisation.id ?? actor.organisationId!; response = { ok: true, policy: createFounderLegalPolicy({ state: getAppState(), actor, founderUserId: foundation?.organisation.founderUserId ?? actor.id, organisationId, kind: body.kind, title: body.title, exactText: body.exactText, configuration: body.configuration, reason: body.reason, idempotencyKey: body.idempotencyKey }) }; break;
      }
      case "founder-commercial-legal-activate": {
        const organisationId = foundation?.organisation.id ?? actor.organisationId!; response = { ok: true, policy: activateFounderLegalPolicy({ state: getAppState(), actor, founderUserId: foundation?.organisation.founderUserId ?? actor.id, organisationId, policyId: body.policyId, reason: body.reason, idempotencyKey: body.idempotencyKey, expectedRecordVersion: body.expectedRecordVersion }) }; break;
      }
      case "founder-no-refund-policy-activate": {
        const organisationId = foundation?.organisation.id ?? actor.organisationId!; response = { ok: true, policy: activateFounderNoRefundPolicy({ state: getAppState(), actor, founderUserId: foundation?.organisation.founderUserId ?? actor.id, organisationId, reason: body.reason, idempotencyKey: body.idempotencyKey, expectedActiveRecordVersion: body.expectedRecordVersion }) }; break;
      }
      case "founder-commercial-policy-event-record": {
        const organisationId = foundation?.organisation.id ?? actor.organisationId!; response = { ok: true, event: recordFounderCommercialPolicyEvent({ state: getAppState(), actor, founderUserId: foundation?.organisation.founderUserId ?? actor.id, organisationId, clientId: body.clientId, prospectiveProjectId: body.prospectiveProjectId, proposalVersionId: body.proposalVersionId, eventType: body.eventType, reason: body.reason, revisedEstimate: body.revisedEstimate, replacementDateOrSlot: body.replacementDateOrSlot, idempotencyKey: body.idempotencyKey, expectedProjectRecordVersion: body.expectedRecordVersion }) }; break;
      }
      case "founder-proposal-template-create": {
        const organisationId = foundation?.organisation.id ?? actor.organisationId!; response = { ok: true, template: createFounderProposalTemplate({ state: getAppState(), actor, founderUserId: foundation?.organisation.founderUserId ?? actor.id, organisationId, serviceType: body.serviceType, name: body.name, kind: body.kind, scopeItems: body.scopeItems ?? [], deliverables: body.deliverables ?? [], reason: body.reason, idempotencyKey: body.idempotencyKey }) }; break;
      }
      case "founder-proposal-template-activate": {
        const organisationId = foundation?.organisation.id ?? actor.organisationId!; response = { ok: true, template: activateFounderProposalTemplate({ state: getAppState(), actor, founderUserId: foundation?.organisation.founderUserId ?? actor.id, organisationId, templateId: body.templateId, reason: body.reason, idempotencyKey: body.idempotencyKey, expectedRecordVersion: body.expectedRecordVersion }) }; break;
      }
      case "founder-proposal-draft-create": {
        const organisationId = foundation?.organisation.id ?? actor.organisationId!; response = { ok: true, proposal: createFounderProposalDraft({ state: getAppState(), actor, founderUserId: foundation?.organisation.founderUserId ?? actor.id, organisationId, clientId: body.clientId, prospectiveProjectId: body.prospectiveProjectId, classification: body.classification, professionalFeePaise: Number(body.professionalFeePaise), appliedGstBasisPoints: Number(body.appliedGstBasisPoints), agreedAdvancePaise: Number(body.agreedAdvancePaise), feeDeviationReason: body.feeDeviationReason, classificationReason: body.classificationReason, gstDeviationReason: body.gstDeviationReason, advanceExceptionReason: body.advanceExceptionReason, idempotencyKey: body.idempotencyKey, expectedProjectVersion: body.expectedProjectVersion }) }; break;
      }
      case "founder-inbound-onboarding-create": {
        const organisationId = foundation?.organisation.id ?? actor.organisationId!;
        response = { ok: true, result: createFounderInboundOnboarding({ state: getAppState(), actor, founderUserId: foundation?.organisation.founderUserId ?? actor.id, organisationId, clientId: body.clientId, prospectiveProjectId: body.prospectiveProjectId, classification: body.classification, professionalFeePaise: Number(body.professionalFeePaise), appliedGstBasisPoints: Number(body.appliedGstBasisPoints), agreedAdvancePaise: Number(body.agreedAdvancePaise), advanceReceivedPaise: Number(body.advanceReceivedPaise), paymentId: body.paymentId, paymentMode: body.paymentMode, feeDeviationReason: body.feeDeviationReason, classificationReason: body.classificationReason, gstDeviationReason: body.gstDeviationReason, advanceExceptionReason: body.advanceExceptionReason, idempotencyKey: body.idempotencyKey, expectedProjectVersion: body.expectedProjectVersion }) };
        break;
      }
      case "founder-proposal-step-save": {
        const organisationId = foundation?.organisation.id ?? actor.organisationId!; response = { ok: true, proposal: autosaveFounderProposalStep({ state: getAppState(), actor, founderUserId: foundation?.organisation.founderUserId ?? actor.id, organisationId, proposalVersionId: body.proposalVersionId, step: Number(body.step) as 1 | 2 | 3 | 4 | 5 | 6, patch: body.patch ?? {}, idempotencyKey: body.idempotencyKey, expectedRecordVersion: body.expectedRecordVersion }) }; break;
      }
      case "founder-proposal-review": {
        const organisationId = foundation?.organisation.id ?? actor.organisationId!; response = { ok: true, proposal: reviewFounderProposal({ state: getAppState(), actor, founderUserId: foundation?.organisation.founderUserId ?? actor.id, organisationId, proposalVersionId: body.proposalVersionId, reason: body.reason, idempotencyKey: body.idempotencyKey, expectedRecordVersion: body.expectedRecordVersion }) }; break;
      }
      case "founder-proposal-approve": {
        const organisationId = foundation?.organisation.id ?? actor.organisationId!; response = { ok: true, proposal: approveFounderProposal({ state: getAppState(), actor, founderUserId: foundation?.organisation.founderUserId ?? actor.id, organisationId, proposalVersionId: body.proposalVersionId, reason: body.reason, idempotencyKey: body.idempotencyKey, expectedRecordVersion: body.expectedRecordVersion }) }; break;
      }
      case "founder-proposal-artifact-generate": {
        const organisationId = foundation?.organisation.id ?? actor.organisationId!; response = { ok: true, artifact: await generateFounderProposalArtifact({ state: getAppState(), actor, founderUserId: foundation?.organisation.founderUserId ?? actor.id, organisationId, proposalVersionId: body.proposalVersionId, store: founderCommercialArtifactStore(), idempotencyKey: body.idempotencyKey, expectedRecordVersion: body.expectedRecordVersion }) }; break;
      }
      case "founder-proposal-send": {
        const organisationId = foundation?.organisation.id ?? actor.organisationId!; response = { ok: true, result: await sendFounderProposal({ state: getAppState(), actor, founderUserId: foundation?.organisation.founderUserId ?? actor.id, organisationId, proposalVersionId: body.proposalVersionId, idempotencyKey: body.idempotencyKey, expectedRecordVersion: body.expectedRecordVersion }) }; break;
      }
      case "founder-proposal-successor": {
        const organisationId = foundation?.organisation.id ?? actor.organisationId!; response = { ok: true, proposal: createFounderProposalSuccessor({ state: getAppState(), actor, founderUserId: foundation?.organisation.founderUserId ?? actor.id, organisationId, proposalVersionId: body.proposalVersionId, reason: body.reason, idempotencyKey: body.idempotencyKey, expectedRecordVersion: body.expectedRecordVersion }) }; break;
      }
      case "founder-complimentary-case-handoff": {
        const organisationId = foundation?.organisation.id ?? actor.organisationId!;
        response = { ok: true, caseRecord: createFounderComplimentaryCaseHandoff({ state: getAppState(), actor, founderUserId: foundation?.organisation.founderUserId ?? actor.id, organisationId, proposalVersionId: body.proposalVersionId, idempotencyKey: body.idempotencyKey, expectedRecordVersion: body.expectedRecordVersion }) };
        break;
      }
      case "founder-paid-case-handoff": {
        const organisationId = foundation?.organisation.id ?? actor.organisationId!;
        response = { ok: true, caseRecord: createFounderPaidCaseHandoff({ state: getAppState(), actor, founderUserId: foundation?.organisation.founderUserId ?? actor.id, organisationId, proposalVersionId: body.proposalVersionId, idempotencyKey: body.idempotencyKey, expectedRecordVersion: body.expectedRecordVersion }) };
        break;
      }
      case "founder-prospective-project-service-classify": {
        const organisationId = foundation?.organisation.id ?? actor.organisationId!;
        response = { ok: true, result: classifyFounderProspectiveProjectService({ state: getAppState(), actor, founderUserId: foundation?.organisation.founderUserId ?? actor.id, organisationId, prospectiveProjectId: body.prospectiveProjectId, serviceType: body.serviceType, clientId: body.clientId, leadId: body.leadId, responseVersionId: body.responseVersionId, idempotencyKey: body.idempotencyKey, expectedRecordVersion: body.expectedRecordVersion }) };
        break;
      }
      case "founder-case-intent-create": {
        const organisationId = foundation?.organisation.id ?? actor.organisationId!;
        response = { ok: true, result: createFounderProspectiveCase({ state: getAppState(), actor, founderUserId: foundation?.organisation.founderUserId ?? actor.id, organisationId, clientId: body.clientId, serviceType: body.serviceType, propertyType: body.propertyType, displayName: body.displayName, propertyLocation: body.propertyLocation, floorCount: body.floorCount, importantNotes: body.importantNotes, confirmPossibleDuplicate: body.confirmPossibleDuplicate, idempotencyKey: body.idempotencyKey, expectedClientRecordVersion: body.expectedRecordVersion, allowLegacyUnownedLocalFixture: isExplicitLocalDemo(request.headers) }) };
        break;
      }
      case "founder-project-scope-save": {
        const organisationId = foundation?.organisation.id ?? actor.organisationId!;
        response = { ok: true, result: createFounderProspectiveCase({ state: getAppState(), actor, founderUserId: foundation?.organisation.founderUserId ?? actor.id, organisationId, clientId: body.clientId, leadId: body.leadId, serviceType: body.serviceType, propertyType: body.propertyType, displayName: body.displayName, propertyLocation: body.propertyLocation, floorCount: body.floorCount, importantNotes: body.importantNotes, confirmPossibleDuplicate: body.confirmPossibleDuplicate, idempotencyKey: body.idempotencyKey, expectedClientRecordVersion: body.expectedRecordVersion, preCaseReview: true, allowLegacyUnownedLocalFixture: isExplicitLocalDemo(request.headers) }) };
        break;
      }
      case "founder-commercial-payment-confirm": {
        const organisationId = foundation?.organisation.id ?? actor.organisationId!; response = { ok: true, confirmation: confirmFounderCommercialPayment({ state: getAppState(), actor, founderUserId: foundation?.organisation.founderUserId ?? actor.id, organisationId, proposalVersionId: body.proposalVersionId, paymentId: body.paymentId, type: body.type, amountPaise: Number(body.amountPaise), idempotencyKey: body.idempotencyKey, expectedProposalRecordVersion: body.expectedProposalRecordVersion }) }; break;
      }
      case "founder-balance-deadline-exception": {
        const organisationId = foundation?.organisation.id ?? actor.organisationId!; response = { ok: true, deadline: applyFounderBalanceDeadlineException({ state: getAppState(), actor, founderUserId: foundation?.organisation.founderUserId ?? actor.id, organisationId, proposalVersionId: body.proposalVersionId, action: body.exceptionAction, newDueAt: body.newDueAt, reason: body.reason, engagementClassification: body.engagementClassification, idempotencyKey: body.idempotencyKey, expectedRecordVersion: body.expectedRecordVersion }) }; break;
      }
      case "founder-invoice-issue": {
        const organisationId = foundation?.organisation.id ?? actor.organisationId!; response = { ok: true, invoice: await issueFounderAdvanceInvoice({ state: getAppState(), actor, founderUserId: foundation?.organisation.founderUserId ?? actor.id, organisationId, proposalVersionId: body.proposalVersionId, store: founderCommercialArtifactStore(), idempotencyKey: body.idempotencyKey, expectedRecordVersion: body.expectedRecordVersion }) }; break;
      }
      case "founder-statutory-policy-create": {
        const organisationId = foundation?.organisation.id ?? actor.organisationId!; response = { ok: true, policy: createFounderStatutoryPolicyDraft({ state: getAppState(), actor, founderUserId: foundation?.organisation.founderUserId ?? actor.id, organisationId, reason: body.reason, idempotencyKey: body.idempotencyKey }) }; break;
      }
      case "founder-statutory-policy-activate": {
        const organisationId = foundation?.organisation.id ?? actor.organisationId!; response = { ok: true, policy: activateFounderStatutoryPolicy({ state: getAppState(), actor, founderUserId: foundation?.organisation.founderUserId ?? actor.id, organisationId, policyId: body.policyId, accountantApprovalReference: body.accountantApprovalReference, approvedServiceTypes: body.approvedServiceTypes, serviceTimingPolicyText: body.serviceTimingPolicyText, reason: body.reason, idempotencyKey: body.idempotencyKey, expectedRecordVersion: body.expectedRecordVersion }) }; break;
      }
      case "founder-billing-profile-save": {
        const organisationId = foundation?.organisation.id ?? actor.organisationId!; response = { ok: true, billing: saveFounderBillingProfile({ state: getAppState(), actor, founderUserId: foundation?.organisation.founderUserId ?? actor.id, organisationId, clientId: body.clientId, prospectiveProjectId: body.prospectiveProjectId, billingLegalName: body.billingLegalName, billingAddress: body.billingAddress, billingState: body.billingState, billingPin: body.billingPin, recipientRegisteredForGst: Boolean(body.recipientRegisteredForGst), recipientGstin: body.recipientGstin, clientLocationCountry: body.clientLocationCountry, clientLocationState: body.clientLocationState, propertyLocation: body.propertyLocation, serviceLocation: body.serviceLocation, timeZone: body.timeZone, reason: body.reason, idempotencyKey: body.idempotencyKey, expectedPriorRecordVersion: body.expectedRecordVersion }) }; break;
      }
      case "founder-statutory-document-issue": {
        const organisationId = foundation?.organisation.id ?? actor.organisationId!; response = { ok: true, document: await issueFounderStatutoryDocument({ state: getAppState(), actor, founderUserId: foundation?.organisation.founderUserId ?? actor.id, organisationId, documentId: body.documentId, serviceSuppliedAt: body.serviceSuppliedAt, store: founderCommercialArtifactStore(), idempotencyKey: body.idempotencyKey, expectedRecordVersion: body.expectedRecordVersion }) }; break;
      }
      case "founder-lead-profile-update": {
        const organisationId = foundation?.organisation.id ?? actor.organisationId!;
        response = { ok: true, result: updateCanonicalLeadProfile({ state: getAppState(), actor, founderUserId: foundation?.organisation.founderUserId ?? actor.id, organisationId, leadId: body.leadId, expectedRecordVersion: body.expectedRecordVersion, idempotencyKey: body.idempotencyKey, reason: body.reason, changes: body.changes ?? {} }) };
        break;
      }
      case "founder-media-dry-run": {
        const organisationId = foundation?.organisation.id ?? actor.organisationId!;
        return NextResponse.json({ ok: true, result: validateApprovedAssetDryRun({ actor, founderUserId: foundation?.organisation.founderUserId ?? actor.id, organisationId, assetKey: body.assetKey, filename: body.filename, sizeBytes: Number(body.sizeBytes), pageCount: Number(body.pageCount), checksumSha256: body.checksumSha256 }) });
      }
      case "founder-media-register": {
        const organisationId = foundation?.organisation.id ?? actor.organisationId!;
        response = { ok: true, result: registerMediaAssetVersion({ state: getAppState(), actor, founderUserId: foundation?.organisation.founderUserId ?? actor.id, organisationId, assetKey: body.assetKey, privateObjectKey: body.privateObjectKey, reason: body.reason, idempotencyKey: body.idempotencyKey, expectedRecordVersion: body.expectedRecordVersion }) };
        break;
      }
      case "founder-media-transition": {
        const organisationId = foundation?.organisation.id ?? actor.organisationId!;
        response = { ok: true, version: transitionMediaAssetVersion({ state: getAppState(), actor, founderUserId: foundation?.organisation.founderUserId ?? actor.id, organisationId, versionId: body.versionId, target: body.target, expectedRecordVersion: body.expectedRecordVersion, reason: body.reason }) };
        break;
      }
      case "founder-qualification-invite": {
        const organisationId = foundation?.organisation.id ?? actor.organisationId!;
        response = { ok: true, result: await createQualificationInvitation({ state: getAppState(), actor, founderUserId: foundation?.organisation.founderUserId ?? actor.id, organisationId, leadId: body.leadId, clientId: body.clientId, prospectiveProjectId: body.prospectiveProjectId, kind: body.kind, selectedServices: body.selectedServices ?? [], idempotencyKey: body.idempotencyKey, expectedRecordVersion: body.expectedRecordVersion }) };
        break;
      }
      case "founder-communication-prepare": {
        const organisationId = foundation?.organisation.id ?? actor.organisationId!;
        response = { ok: true, result: await prepareManualCommunication({ state: getAppState(), actor, founderUserId: foundation?.organisation.founderUserId ?? actor.id, organisationId, leadId: body.leadId, clientId: body.clientId, prospectiveProjectIds: body.prospectiveProjectIds, templateKey: body.templateKey, values: body.values ?? {}, channel: body.channel, recipient: body.recipient, assetVersionIds: body.assetVersionIds, formDefinitionId: body.formDefinitionId, bookingId: body.bookingId, grantIds: body.grantIds, renderedTimeZoneSnapshot: body.renderedTimeZoneSnapshot, manualNote: body.manualNote, idempotencyKey: body.idempotencyKey, expectedRecordVersion: body.expectedRecordVersion }) };
        break;
      }
      case "founder-communication-context": {
        const organisationId = foundation?.organisation.id ?? actor.organisationId!;
        response = { ok: true, result: await createFounderCommunicationContext({ state: getAppState(), actor, founderUserId: foundation?.organisation.founderUserId ?? actor.id, organisationId, leadId: body.leadId, clientId: body.clientId, prospectiveProjectId: body.prospectiveProjectId, templateKey: body.templateKey, serviceType: body.serviceType, qualificationKind: body.qualificationKind, idempotencyKey: body.idempotencyKey, expectedRecordVersion: body.expectedRecordVersion }) };
        break;
      }
      case "founder-communication-opened": {
        const organisationId = foundation?.organisation.id ?? actor.organisationId!;
        response = { ok: true, preparation: markCommunicationOpened({ state: getAppState(), actor, founderUserId: foundation?.organisation.founderUserId ?? actor.id, organisationId, preparationId: body.preparationId, expectedRecordVersion: body.expectedRecordVersion }) };
        break;
      }
      case "founder-booking-assign": {
        const organisationId = foundation?.organisation.id ?? actor.organisationId!;
        response = { ok: true, booking: assignReviewCall({ state: getAppState(), actor, founderUserId: foundation?.organisation.founderUserId ?? actor.id, organisationId, responseVersionId: body.responseVersionId, startsAt: body.startsAt, timeZone: body.timeZone, confirmationGrantId: body.confirmationGrantId, idempotencyKey: body.idempotencyKey, expectedRecordVersion: body.expectedRecordVersion }) };
        break;
      }
      case "founder-booking-reschedule": {
        const organisationId = foundation?.organisation.id ?? actor.organisationId!;
        response = { ok: true, booking: rescheduleReviewCall({ state: getAppState(), actor, founderUserId: foundation?.organisation.founderUserId ?? actor.id, organisationId, bookingId: body.bookingId, startsAt: body.startsAt, timeZone: body.timeZone, confirmationGrantId: body.confirmationGrantId, reason: body.reason, idempotencyKey: body.idempotencyKey, expectedRecordVersion: body.expectedRecordVersion }) };
        break;
      }
      case "founder-booking-cancel": {
        const organisationId = foundation?.organisation.id ?? actor.organisationId!;
        response = { ok: true, booking: cancelReviewCall({ state: getAppState(), actor, founderUserId: foundation?.organisation.founderUserId ?? actor.id, organisationId, bookingId: body.bookingId, reason: body.reason, expectedRecordVersion: body.expectedRecordVersion }) };
        break;
      }
      case "reset":
        if (!isExplicitLocalDemo(request.headers)) {
          return NextResponse.json({ ok: false, error: "Demo reset is unavailable outside an explicit local demo." }, { status: 403 });
        }
        if (actor.role !== "ADMIN" && actor.role !== "SUPER_ADMIN") {
          return deny("Only an admin can reset the local demo state.");
        }
        response = { ok: true, state: resetDemoData() };
        break;
      case "lead":
        if (!canTriggerDeliverables(actor)) {
          return deny("This role cannot record lead qualification.");
        }
        response = { ok: true, lead: recordLeadQualification(body) };
        break;
      case "client-pipeline-transition":
        if (!canTriggerDeliverables(actor)) return deny("Only assigned setters, consultants, or administrators can update the client pipeline.");
        response = { ok: true, result: transitionClientPipeline({ ...body, actor }) };
        break;
      case "commercial-policy-update":
        if (actor.role !== "SUPER_ADMIN") return deny("Only a Super-Admin can publish commercial policy.");
        response = { ok: true, policy: updateCommercialPolicy({ ...body, actor }) };
        break;
      case "client-intake-upsert":
        if (!canTriggerDeliverables(actor)) return deny("Only assigned setters, consultants, or administrators can update client intake.");
        response = { ok: true, intake: upsertClientIntake({ ...body, actor }) };
        break;
      case "lead-qualify":
        if (!canTriggerDeliverables(actor)) {
          return deny("This role cannot qualify inbound leads.");
        }
        response = { ok: true, result: qualifyInboundLead(body.leadId, actor) };
        break;
      case "lead-status-set":
        if (!canTriggerDeliverables(actor)) {
          return deny("This role cannot triage inbound leads.");
        }
        response = {
          ok: true,
          lead: updateInboundLeadStatus(body.leadId, body.status, actor, typeof body.note === "string" ? body.note : undefined)
        };
        break;
      case "proposal-create":
        if (!canTriggerDeliverables(actor)) {
          return deny("This role cannot create commercial proposals.");
        }
        response = { ok: true, proposal: createCommercialProposal(body.clientId, body.amountInr, actor, body.idempotencyKey, body.expectedRecordVersion) };
        break;
      case "book-qualification-call":
        if (!canTriggerDeliverables(actor)) {
          return deny("This role cannot book qualification calls.");
        }
        response = {
          ok: true,
          lead: bookQualificationCall({
            clientId: body.clientId,
            scheduledAt: String(body.scheduledAt ?? new Date().toISOString()),
            actor
          })
        };
        break;
      case "review-call-book":
        if (!canTriggerDeliverables(actor)) {
          return deny("This role cannot book review calls.");
        }
        response = {
          ok: true,
          booking: await bookReviewCall({
            clientId: body.clientId,
            proposalId: body.proposalId,
            provider: body.provider === "ZOOM" ? "ZOOM" : "GOOGLE_MEET",
            scheduledAt: String(body.scheduledAt ?? new Date().toISOString()),
            durationMinutes: body.durationMinutes === undefined ? undefined : Number(body.durationMinutes),
            actor
          })
        };
        break;
      case "review-call-complete":
        if (!canTriggerDeliverables(actor)) {
          return deny("This role cannot complete review calls.");
        }
        response = {
          ok: true,
          booking: await completeReviewCall({
            bookingId: body.bookingId,
            outcome: body.outcome === "CANCELLED" ? "CANCELLED" : "COMPLETED",
            actor,
            note: typeof body.note === "string" ? body.note : undefined
          })
        };
        break;
      case "proposal-approve":
        if (!canApproveCommercialProposal(actor)) {
          return deny("Only a Super-Admin can approve the commercial proposal.");
        }
        response = { ok: true, proposal: approveCommercialProposal(body.proposalId, actor, body.expectedRecordVersion) };
        break;
      case "case-create":
        if (!canVerifyPayments(actor)) {
          return deny("Only an independent payment verifier can create a case after scoped advance proof is approved.");
        }
        response = { ok: true, caseRecord: createVastuCase(body.clientId, body.proposalId, actor, body.expectedRecordVersion) };
        break;
      case "case-create-v1":
        if (!canVerifyPayments(actor)) return deny("Only an independent payment verifier can create a V1 case after scoped advance proof is approved.");
        response = { ok: true, caseRecord: createVastuCaseV1(body.clientId, body.proposalId, actor, body.expectedRecordVersion) };
        break;
      case "case-property-context-upsert-v1":
        if (!canEvaluateCases(actor)) return deny("This role cannot update V1 case property context.");
        response = { ok: true, propertyContext: upsertCasePropertyContextV1({ clientId: body.clientId, caseId: body.caseId, projectId: body.projectId, propertyContext: body.propertyContext, actor, idempotencyKey: body.idempotencyKey, expectedRecordVersion: body.expectedRecordVersion, organisationId: foundation?.organisation.id ?? actor.organisationId }) };
        break;
      case "client-intake-profile-upsert-v1":
        if (!canEvaluateCases(actor)) return deny("This role cannot update V1 client intake.");
        response = { ok: true, profile: upsertClientIntakeProfileV1({ ...body, actor }) };
        break;
      case "client-intake-save-v1":
        if (!canEvaluateCases(actor)) return deny("This role cannot update V1 client intake.");
        response = { ok: true, intake: saveClientIntakeV1({ ...body, actor, organisationId: foundation?.organisation.id ?? actor.organisationId }) };
        break;
      case "orientation-lock":
        return NextResponse.json({ ok: false, error: "Use the versioned orientation lock with exact degree and immutable Google Earth evidence." }, { status: 409 });
      case "plan-version-create":
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot manage plan versions.");
        response = { ok: true, plan: await createPlanVersion({ ...body, actor }) };
        break;
      case "spatial-evidence-create":
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot manage spatial evidence.");
        response = { ok: true, evidence: await createSpatialEvidenceVersion({ ...body, actor }) };
        break;
      case "orientation-version-lock":
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot lock orientation.");
        response = { ok: true, orientation: lockExactOrientation({ ...body, actor }) };
        break;
      case "d8-orientation-finalize-v1":
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot finalize V1 D8 orientation.");
        if (resolveEvaluationArchitecture({ state: getAppState(), caseId: String(body.caseId), ...(body.floorId ? { floorId: String(body.floorId) } : {}) }).caseVersion !== "V1") return NextResponse.json({ ok: false, error: "V1 D8 orientation requires an explicitly versioned V1 case." }, { status: 409 });
        response = { ok: true, snapshot: finalizeD8OrientationSnapshotV1({ state: getAppState(), organisationId: foundation?.organisation.id ?? actor.organisationId ?? "", caseId: body.caseId, projectId: body.projectId, floorId: body.floorId, orientationVersionId: body.orientationVersionId, orientationEvidenceVersionId: body.orientationEvidenceVersionId, exactDegree: Number(body.exactDegree), methodologyVersionId: body.methodologyVersionId, methodologyContentHash: body.methodologyContentHash, actor, idempotencyKey: body.idempotencyKey, expectedRecordVersion: body.expectedRecordVersion }) };
        break;
      case "d16-mapping-draft-v1":
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot create V1 D16 mappings.");
        if (resolveEvaluationArchitecture({ state: getAppState(), caseId: String(body.caseId), floorId: String(body.floorId) }).caseVersion !== "V1") return NextResponse.json({ ok: false, error: "V1 D16 mapping requires an explicitly versioned V1 case and floor." }, { status: 409 });
        response = { ok: true, mapping: createD16UtilityMappingDraft({ state: getAppState(), organisationId: foundation?.organisation.id ?? actor.organisationId ?? "", caseId: body.caseId, projectId: body.projectId, floorId: body.floorId, rows: body.rows ?? [], methodologyVersionId: body.methodologyVersionId, methodologyVersion: body.methodologyVersion, methodologyContentHash: body.methodologyContentHash, externalD16EvidenceVersionId: body.externalD16EvidenceVersionId, actorUserId: actor.id, idempotencyKey: body.idempotencyKey }) };
        break;
      case "d16-mapping-finalize-v1": {
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot finalize V1 D16 mappings.");
        const mapping = getAppState().d16UtilityMappingVersions.find((item) => item.id === String(body.mappingId));
        if (!mapping || resolveEvaluationArchitecture({ state: getAppState(), caseId: mapping.caseId, floorId: mapping.floorId }).caseVersion !== "V1") return NextResponse.json({ ok: false, error: "V1 D16 mapping requires an explicitly versioned V1 case and floor." }, { status: 409 });
        response = { ok: true, mapping: finalizeD16UtilityMapping({ state: getAppState(), mappingId: String(body.mappingId), actorUserId: actor.id, expectedVersion: body.expectedRecordVersion === undefined ? undefined : Number(body.expectedRecordVersion), idempotencyKey: String(body.idempotencyKey) }) };
        break;
      }
      case "d16-mapping-successor-v1": {
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot create V1 D16 successors.");
        const predecessor = getAppState().d16UtilityMappingVersions.find((item) => item.id === String(body.predecessorId));
        if (!predecessor || resolveEvaluationArchitecture({ state: getAppState(), caseId: predecessor.caseId, floorId: predecessor.floorId }).caseVersion !== "V1") return NextResponse.json({ ok: false, error: "V1 D16 mapping requires an explicitly versioned V1 case and floor." }, { status: 409 });
        response = { ok: true, mapping: createD16UtilityMappingSuccessor({ state: getAppState(), predecessorId: body.predecessorId, rows: body.rows ?? [], actorUserId: actor.id, idempotencyKey: body.idempotencyKey }) };
        break;
      }
      case "d32-entrance-draft-v1":
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot create V1 D32 entrance drafts.");
        if (resolveEvaluationArchitecture({ state: getAppState(), caseId: String(body.caseId), ...(body.floorId ? { floorId: String(body.floorId) } : {}) }).caseVersion !== "V1") return NextResponse.json({ ok: false, error: "V1 D32 entrances require an explicitly versioned V1 case." }, { status: 409 });
        response = { ok: true, result: confirmEntranceZones({ ...body, actor }) };
        break;
      case "d32-entrance-finalize-v1":
      case "d32-entrance-successor-v1":
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot finalize V1 D32 entrance versions.");
        if (resolveEvaluationArchitecture({ state: getAppState(), caseId: String(body.caseId), ...(body.floorId ? { floorId: String(body.floorId) } : {}) }).caseVersion !== "V1") return NextResponse.json({ ok: false, error: "V1 D32 entrances require an explicitly versioned V1 case." }, { status: 409 });
        response = { ok: true, result: finalizeEntranceZoneSuccessor({ ...body, actor, skipLegacyInvalidation: true }) };
        break;
      case "directional-input-draft-v1":
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot create V1 directional inputs.");
        response = { ok: true, input: createDirectionalInputDraft({ state: getAppState(), organisationId: foundation?.organisation.id ?? actor.organisationId, caseId: String(body.caseId), projectId: String(body.projectId), floorId: String(body.floorId), modifierFindings: body.modifierFindings, noConfirmedD8Modifiers: body.noConfirmedD8Modifiers === true, circulationState: body.circulationState, methodologyVersionId: body.methodologyVersionId, methodologyContentHash: body.methodologyContentHash, actor, idempotencyKey: String(body.idempotencyKey) }) };
        break;
      case "directional-input-finalize-v1":
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot finalize V1 directional inputs.");
        {
          const input = getAppState().directionalInputVersions.find((item) => item.id === String(body.inputId));
          const organisationId = foundation?.organisation.id ?? actor.organisationId;
          if (!input || input.caseId !== String(body.caseId) || input.projectId !== String(body.projectId) || input.floorId !== String(body.floorId) || (organisationId && input.organisationId !== organisationId)) {
            return NextResponse.json({ ok: false, error: "Directional Input scope does not match the requested case, project, floor, and organisation." }, { status: 409 });
          }
          if (typeof body.expectedInputVersion !== "number" || !Number.isInteger(body.expectedInputVersion) || body.expectedInputVersion < 1) {
            return NextResponse.json({ ok: false, error: "A current Directional Input expectedInputVersion is required." }, { status: 428 });
          }
        }
        response = { ok: true, input: finalizeDirectionalInput({ state: getAppState(), inputId: String(body.inputId), actor, expectedVersion: body.expectedInputVersion, idempotencyKey: String(body.idempotencyKey) }) };
        break;
      case "directional-input-successor-v1":
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot create V1 directional successors.");
        response = { ok: true, input: createDirectionalInputSuccessor({ state: getAppState(), predecessorId: String(body.predecessorId), modifierFindings: body.modifierFindings, noConfirmedD8Modifiers: body.noConfirmedD8Modifiers === true, circulationState: body.circulationState, methodologyVersionId: body.methodologyVersionId, methodologyContentHash: body.methodologyContentHash, actor, idempotencyKey: String(body.idempotencyKey) }) };
        break;
      case "directional-evaluation-finalize-v1":
      case "directional-evaluation-successor-v1":
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot finalize V1 Directional Evaluation.");
        response = { ok: true, snapshot: finalizeDirectionalEvaluationSnapshot({ state: getAppState(), organisationId: foundation?.organisation.id ?? actor.organisationId, caseId: String(body.caseId), projectId: String(body.projectId), floorId: String(body.floorId), actor, expectedRecordVersion: body.expectedRecordVersion, idempotencyKey: String(body.idempotencyKey) }) };
        break;
      case "directional-report-card-draft-v1":
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot create V1 Directional Report Cards.");
        response = { ok: true, reportCard: createDirectionalReportCardDraft({ state: getAppState(), organisationId: foundation?.organisation.id ?? actor.organisationId, caseId: String(body.caseId), projectId: String(body.projectId), floorId: String(body.floorId), actor, statements: body.statements ?? {}, expectedRecordVersion: body.expectedRecordVersion, idempotencyKey: String(body.idempotencyKey) }) };
        break;
      case "directional-report-card-finalize-v1":
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot finalize V1 Directional Report Cards.");
        response = { ok: true, reportCard: finalizeDirectionalReportCard({ state: getAppState(), snapshotId: String(body.snapshotId), actor, expectedRecordVersion: body.expectedRecordVersion, idempotencyKey: String(body.idempotencyKey) }) };
        break;
      case "directional-report-card-successor-v1":
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot create V1 Directional Report Card successors.");
        response = { ok: true, reportCard: createDirectionalReportCardSuccessor({ state: getAppState(), predecessorId: String(body.predecessorId), actor, statements: body.statements ?? {}, expectedRecordVersion: body.expectedRecordVersion, idempotencyKey: String(body.idempotencyKey) }) };
        break;
      case "directional-stage-a-present-v1":
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot present V1 Directional Stage A.");
        response = { ok: true, presentation: presentDirectionalStageA({ state: getAppState(), reportCardSnapshotId: String(body.reportCardSnapshotId), actor, expectedRecordVersion: body.expectedRecordVersion, idempotencyKey: String(body.idempotencyKey) }) };
        break;
      case "site-evaluation-evidence-draft-v1": {
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot create V1 Site Evidence.");
        const architecture = resolveEvaluationArchitecture({ state: getAppState(), caseId: String(body.caseId), floorId: String(body.floorId) });
        if (architecture.caseVersion !== "V1" || architecture.floorVersion !== "V1") return NextResponse.json({ ok: false, error: "V1 Site Evidence requires a V1 case and floor." }, { status: 409 });
        if (!resolveV1StageAReadiness(getAppState(), String(body.caseId), String(body.floorId)).directionalStageAPresented) return NextResponse.json({ ok: false, error: "Directional Stage A must be presented before V1 Site Evidence." }, { status: 409 });
        const currentState = getAppState();
        const caseRecord = currentState.vastuCases.find((item) => item.id === String(body.caseId) && item.projectId === String(body.projectId));
        const floor = currentState.floorWorkspaces.find((item) => item.id === String(body.floorId) && item.caseId === String(body.caseId) && item.projectId === String(body.projectId));
        if (!caseRecord || !floor) return NextResponse.json({ ok: false, error: "Site Evidence case, project and floor scope do not match." }, { status: 409 });
        const artifact = await resolveCaseFileEvidenceAuthority(String(body.evidenceRef), { organisationId: foundation?.organisation.id ?? actor.organisationId!, caseId: caseRecord.id, caseRevisionNumber: caseRecord.revisionNumber ?? 1, serviceType: normalizeCaseService(caseRecord).serviceType, floorLabel: floor.floorLabel });
        response = { ok: true, evidence: createSiteEvaluationEvidenceDraft({ state: currentState, organisationId: foundation?.organisation.id ?? actor.organisationId!, caseId: caseRecord.id, projectId: caseRecord.projectId!, floorId: floor.id, mode: body.mode, evidenceRef: artifact.evidenceRef, artifactHash: `sha256:${artifact.checksumSha256}`, fileName: artifact.fileName, fileSize: artifact.sizeBytes, evidenceDate: body.evidenceDate, actor, expectedRecordVersion: body.expectedRecordVersion === undefined ? undefined : Number(body.expectedRecordVersion), idempotencyKey: String(body.idempotencyKey) }) }; break;
      }
      case "site-evaluation-evidence-finalize-v1":
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot finalize V1 Site Evidence.");
        { const currentState = getAppState(); const record = currentState.siteEvaluationEvidenceVersions.find((x) => x.id === String(body.recordId)); const a = record ? resolveEvaluationArchitecture({ state: currentState, caseId: record.caseId, floorId: record.floorId }) : null; const organisationId = foundation?.organisation.id ?? actor.organisationId; const caseRecord = record && currentState.vastuCases.find((x) => x.id === record.caseId && x.projectId === record.projectId && x.organisationId === organisationId); const floor = record && currentState.floorWorkspaces.find((x) => x.id === record.floorId && x.caseId === record.caseId && x.projectId === record.projectId); if (!record || a?.caseVersion !== "V1" || a.floorVersion !== "V1" || !caseRecord || !floor || record.organisationId !== organisationId) return NextResponse.json({ ok: false, error: "V1 Site Evidence finalization scope does not match the active organisation, case, project and floor." }, { status: 409 }); const artifact = await resolveCaseFileEvidenceAuthority(record.evidenceRef, { organisationId, caseId: caseRecord.id, caseRevisionNumber: caseRecord.revisionNumber ?? 1, serviceType: normalizeCaseService(caseRecord).serviceType, floorLabel: floor.floorLabel }); if (`sha256:${artifact.checksumSha256}` !== record.artifactHash || artifact.fileName !== record.fileName || artifact.sizeBytes !== record.fileSize) return NextResponse.json({ ok: false, error: "The Site Evidence artifact authority no longer matches the saved draft." }, { status: 409 }); response = { ok: true, evidence: finalizeSiteEvaluationEvidence({ state: currentState, recordId: record.id, actor, expectedRecordVersion: Number(body.expectedRecordVersion), idempotencyKey: String(body.idempotencyKey) }) }; }
        break;
      case "site-evaluation-evidence-successor-v1":
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot create V1 Site Evidence successors.");
        response = { ok: true, evidence: createSiteEvaluationEvidenceSuccessor({ state: getAppState(), predecessorId: String(body.predecessorId), mode: body.mode, evidenceRef: String(body.evidenceRef), artifactHash: String(body.artifactHash), fileName: body.fileName, fileSize: body.fileSize, evidenceDate: body.evidenceDate, actor, expectedRecordVersion: body.expectedRecordVersion === undefined ? undefined : Number(body.expectedRecordVersion), idempotencyKey: String(body.idempotencyKey) }) }; break;
      case "post-site-observation-draft-v1":
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot create V1 Post-Site observations.");
        { const a = resolveEvaluationArchitecture({ state: getAppState(), caseId: String(body.caseId), floorId: String(body.floorId) }); if (a.caseVersion !== "V1" || a.floorVersion !== "V1") return NextResponse.json({ ok: false, error: "V1 Post-Site observations require a V1 case and floor." }, { status: 409 }); }
        response = { ok: true, observation: createPostSiteObservationDraft({ state: getAppState(), organisationId: foundation?.organisation.id ?? actor.organisationId!, caseId: String(body.caseId), projectId: String(body.projectId), floorId: String(body.floorId), naturalLight: body.naturalLight, ventilation: body.ventilation, methodologyVersionId: String(body.methodologyVersionId), methodologyContentHash: String(body.methodologyContentHash), actor, expectedRecordVersion: body.expectedRecordVersion === undefined ? undefined : Number(body.expectedRecordVersion), idempotencyKey: String(body.idempotencyKey) }) }; break;
      case "post-site-observation-finalize-v1":
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot finalize V1 Post-Site observations.");
        { const record = getAppState().postSiteElementalObservations.find((x) => x.id === String(body.recordId)); const a = record ? resolveEvaluationArchitecture({ state: getAppState(), caseId: record.caseId, floorId: record.floorId }) : null; if (!record || a?.caseVersion !== "V1" || a.floorVersion !== "V1") return NextResponse.json({ ok: false, error: "V1 Post-Site observations require a V1 case and floor." }, { status: 409 }); }
        response = { ok: true, observation: finalizePostSiteObservation({ state: getAppState(), recordId: String(body.recordId), actor, expectedRecordVersion: Number(body.expectedRecordVersion), idempotencyKey: String(body.idempotencyKey) }) }; break;
      case "post-site-observation-successor-v1":
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot create V1 Post-Site successors.");
        response = { ok: true, observation: createPostSiteObservationSuccessor({ state: getAppState(), predecessorId: String(body.predecessorId), naturalLight: body.naturalLight, ventilation: body.ventilation, methodologyVersionId: String(body.methodologyVersionId), methodologyContentHash: String(body.methodologyContentHash), actor, expectedRecordVersion: body.expectedRecordVersion === undefined ? undefined : Number(body.expectedRecordVersion), idempotencyKey: String(body.idempotencyKey) }) }; break;
      case "energy-bar-evidence-draft-v1":
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot create V1 Energy Bar evidence.");
        { const a = resolveEvaluationArchitecture({ state: getAppState(), caseId: String(body.caseId), floorId: String(body.floorId) }); if (a.caseVersion !== "V1" || a.floorVersion !== "V1") return NextResponse.json({ ok: false, error: "V1 Energy Bar evidence requires a V1 case and floor." }, { status: 409 }); }
        response = { ok: true, evidence: createEnergyBarEvidenceDraft({ state: getAppState(), organisationId: foundation?.organisation.id ?? actor.organisationId!, caseId: String(body.caseId), projectId: String(body.projectId), floorId: String(body.floorId), evidenceRef: String(body.evidenceRef), artifactHash: String(body.artifactHash), fileName: body.fileName, fileSize: body.fileSize, actor, expectedRecordVersion: body.expectedRecordVersion === undefined ? undefined : Number(body.expectedRecordVersion), idempotencyKey: String(body.idempotencyKey) }) }; break;
      case "energy-bar-evidence-finalize-v1":
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot finalize V1 Energy Bar evidence.");
        { const record = getAppState().energyBarEvidenceVersions.find((x) => x.id === String(body.recordId)); const a = record ? resolveEvaluationArchitecture({ state: getAppState(), caseId: record.caseId, floorId: record.floorId }) : null; if (!record || a?.caseVersion !== "V1" || a.floorVersion !== "V1") return NextResponse.json({ ok: false, error: "V1 Energy Bar evidence requires a V1 case and floor." }, { status: 409 }); }
        response = { ok: true, evidence: finalizeEnergyBarEvidence({ state: getAppState(), recordId: String(body.recordId), actor, expectedRecordVersion: Number(body.expectedRecordVersion), idempotencyKey: String(body.idempotencyKey) }) }; break;
      case "energy-bar-evidence-successor-v1":
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot create V1 Energy Bar evidence successors.");
        response = { ok: true, evidence: createEnergyBarEvidenceSuccessor({ state: getAppState(), predecessorId: String(body.predecessorId), evidenceRef: String(body.evidenceRef), artifactHash: String(body.artifactHash), fileName: body.fileName, fileSize: body.fileSize, actor, expectedRecordVersion: body.expectedRecordVersion === undefined ? undefined : Number(body.expectedRecordVersion), idempotencyKey: String(body.idempotencyKey) }) }; break;
      case "energy-bar-state-draft-v1":
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot create V1 Energy Bar state sets.");
        { const a = resolveEvaluationArchitecture({ state: getAppState(), caseId: String(body.caseId), floorId: String(body.floorId) }); if (a.caseVersion !== "V1" || a.floorVersion !== "V1") return NextResponse.json({ ok: false, error: "V1 Energy Bar states require a V1 case and floor." }, { status: 409 }); }
        response = { ok: true, states: createEnergyBarStateSetDraft({ state: getAppState(), organisationId: foundation?.organisation.id ?? actor.organisationId!, caseId: String(body.caseId), projectId: String(body.projectId), floorId: String(body.floorId), evidenceVersionId: String(body.evidenceVersionId), directions: body.directions ?? [], methodologyVersionId: String(body.methodologyVersionId), methodologyContentHash: String(body.methodologyContentHash), actor, expectedRecordVersion: body.expectedRecordVersion === undefined ? undefined : Number(body.expectedRecordVersion), idempotencyKey: String(body.idempotencyKey) }) }; break;
      case "energy-bar-state-finalize-v1":
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot finalize V1 Energy Bar state sets.");
        { const record = getAppState().energyBarStateSetVersions.find((x) => x.id === String(body.recordId)); const a = record ? resolveEvaluationArchitecture({ state: getAppState(), caseId: record.caseId, floorId: record.floorId }) : null; if (!record || a?.caseVersion !== "V1" || a.floorVersion !== "V1") return NextResponse.json({ ok: false, error: "V1 Energy Bar states require a V1 case and floor." }, { status: 409 }); }
        response = { ok: true, states: finalizeEnergyBarStateSet({ state: getAppState(), recordId: String(body.recordId), actor, expectedRecordVersion: Number(body.expectedRecordVersion), idempotencyKey: String(body.idempotencyKey) }) }; break;
      case "energy-bar-state-successor-v1":
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot create V1 Energy Bar state successors.");
        response = { ok: true, states: createEnergyBarStateSetSuccessor({ state: getAppState(), predecessorId: String(body.predecessorId), evidenceVersionId: String(body.evidenceVersionId), directions: body.directions ?? [], methodologyVersionId: String(body.methodologyVersionId), methodologyContentHash: String(body.methodologyContentHash), actor, expectedRecordVersion: body.expectedRecordVersion === undefined ? undefined : Number(body.expectedRecordVersion), idempotencyKey: String(body.idempotencyKey) }) }; break;
      case "elemental-evaluation-finalize-v1":
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot finalize V1 Elemental Evaluation.");
        { const a = resolveEvaluationArchitecture({ state: getAppState(), caseId: String(body.caseId), floorId: String(body.floorId) }); if (a.caseVersion !== "V1" || a.floorVersion !== "V1") return NextResponse.json({ ok: false, error: "V1 Elemental Evaluation requires a V1 case and floor." }, { status: 409 }); }
        response = { ok: true, snapshot: createCanonicalElementalEvaluationSnapshot({ state: getAppState(), organisationId: foundation?.organisation.id ?? actor.organisationId!, caseId: String(body.caseId), projectId: String(body.projectId), floorId: String(body.floorId), actor, expectedRecordVersion: body.expectedRecordVersion === undefined ? undefined : Number(body.expectedRecordVersion), idempotencyKey: String(body.idempotencyKey) }) }; break;
      case "elemental-evaluation-successor-v1":
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot create V1 Elemental Evaluation successors.");
        response = { ok: true, snapshot: createElementalEvaluationSuccessor({ state: getAppState(), predecessorId: String(body.predecessorId), actor, expectedRecordVersion: Number(body.expectedRecordVersion), idempotencyKey: String(body.idempotencyKey) }) }; break;
      case "elemental-report-draft-v1":
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot create V1 Elemental Reports.");
        response = { ok: true, report: createElementalReportSnapshotDraft({ state: getAppState(), organisationId: foundation?.organisation.id ?? actor.organisationId!, caseId: String(body.caseId), projectId: String(body.projectId), floorId: String(body.floorId), actor, expectedRecordVersion: body.expectedRecordVersion === undefined ? undefined : Number(body.expectedRecordVersion), idempotencyKey: String(body.idempotencyKey) }) }; break;
      case "elemental-report-finalize-v1":
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot finalize V1 Elemental Reports.");
        response = { ok: true, report: finalizeElementalReportSnapshot({ state: getAppState(), snapshotId: String(body.snapshotId), actor, expectedRecordVersion: Number(body.expectedRecordVersion), idempotencyKey: String(body.idempotencyKey) }) }; break;
      case "elemental-report-successor-v1":
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot create V1 Elemental Report successors.");
        response = { ok: true, report: createElementalReportSnapshotSuccessor({ state: getAppState(), predecessorId: String(body.predecessorId), actor, expectedRecordVersion: body.expectedRecordVersion === undefined ? undefined : Number(body.expectedRecordVersion), idempotencyKey: String(body.idempotencyKey) }) }; break;
      case "v1-full-balance-clearance-approve":
        if (!foundation || foundation.membership.role !== "SUPER_ADMIN" || foundation.membership.capability !== "organisation_owner") return deny("Only the authorised Founder organisation owner can approve V1 Full Balance Clearance.");
        response = { ok: true, clearance: approveV1FullBalanceClearance({ state: getAppState(), organisationId: foundation.organisation.id, caseId: String(body.caseId), projectId: String(body.projectId), floorId: String(body.floorId), actor, expectedRecordVersion: Number(body.expectedRecordVersion), idempotencyKey: String(body.idempotencyKey) }) }; break;
      case "evaluation-remedy-handoff-create-v1":
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot create V1 Remedy-Type handoffs.");
        response = { ok: true, handoff: createV1RemedyHandoff({ state: getAppState(), organisationId: foundation?.organisation.id ?? actor.organisationId!, caseId: String(body.caseId), projectId: String(body.projectId), floorId: String(body.floorId), actor, expectedRecordVersion: body.expectedRecordVersion === undefined ? undefined : Number(body.expectedRecordVersion), idempotencyKey: String(body.idempotencyKey) }) }; break;
      case "stage-b-input-v1-draft":
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot create Stage B V1 inputs.");
        response = { ok: true, input: createStageBInputV1({ state: getAppState(), handoffId: String(body.handoffId), actor, idempotencyKey: String(body.idempotencyKey), expectedRecordVersion: Number(body.expectedRecordVersion) }) }; break;
      case "stage-b-input-v1-finalize":
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot finalize Stage B V1 inputs.");
        response = { ok: true, input: finalizeStageBInputV1({ state: getAppState(), recordId: String(body.recordId), actor, expectedRecordVersion: Number(body.expectedRecordVersion), idempotencyKey: String(body.idempotencyKey) }) }; break;
      case "stage-b-input-v1-successor":
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot create Stage B V1 input successors.");
        response = { ok: true, input: createStageBInputV1Successor({ state: getAppState(), predecessorId: String(body.predecessorId), actor, idempotencyKey: String(body.idempotencyKey), expectedRecordVersion: Number(body.expectedRecordVersion) }) }; break;
      case "stage-b-readiness-v1":
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot resolve Stage B V1 readiness.");
        response = { ok: true, reservation: ensureStageBReservation({ state: getAppState(), caseId: String(body.caseId), floorId: String(body.floorId), actor, expectedRecordVersion: body.reservationRecordVersion === undefined ? undefined : Number(body.reservationRecordVersion), idempotencyKey: body.idempotencyKey }) }; break;
      case "combined-report-draft-v1":
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot create Combined V1 Reports.");
        response = { ok: true, report: createCombinedEvaluationReportDraft({ state: getAppState(), organisationId: foundation?.organisation.id ?? actor.organisationId!, caseId: String(body.caseId), projectId: String(body.projectId), floorId: String(body.floorId), actor, expectedRecordVersion: body.expectedRecordVersion === undefined ? undefined : Number(body.expectedRecordVersion), idempotencyKey: String(body.idempotencyKey) }) }; break;
      case "combined-report-finalize-v1":
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot finalize Combined V1 Reports.");
        response = { ok: true, report: finalizeCombinedEvaluationReport({ state: getAppState(), snapshotId: String(body.snapshotId), actor, expectedRecordVersion: body.expectedRecordVersion === undefined ? undefined : Number(body.expectedRecordVersion), idempotencyKey: String(body.idempotencyKey) }) }; break;
      case "combined-report-successor-v1":
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot create Combined V1 Report successors.");
        response = { ok: true, report: createCombinedEvaluationReportSuccessor({ state: getAppState(), predecessorId: String(body.predecessorId), actor, expectedRecordVersion: body.expectedRecordVersion === undefined ? undefined : Number(body.expectedRecordVersion), idempotencyKey: String(body.idempotencyKey) }) }; break;
      case "entrance-zones-confirm":
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot confirm entrance zones.");
        response = { ok: true, result: confirmEntranceZones({ ...body, actor }) };
        break;
      case "opening-mapping-create":
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot manage 32-direction opening mappings.");
        return NextResponse.json({ ok: false, error: "Legacy percentage opening markers are read-only. Confirm the applicable canonical entrance zones instead." }, { status: 409 });
      case "space-mapping-create":
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot manage 16-direction space mappings.");
        return NextResponse.json({ ok: false, error: "Computed 16-direction space mapping is deferred to V4; record the approved manual mapping evidence instead." }, { status: 409, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
      case "regeneration-transition":
        if (actor.role !== "SUPER_ADMIN" || (foundation && foundation.membership.capability !== "organisation_owner")) return deny("Only the active organisation owner can resolve Founder Edition regeneration records.");
        response = { ok: true, result: transitionFloorRegeneration({ ...body, actor }) };
        break;
      case "methodology-version-create":
        response = { ok: true, version: createMethodologyVersion({ ...body, actor }) };
        break;
      case "methodology-version-authority-bind":
        response = { ok: true, version: bindStageBMethodologyAuthority({ ...body, actor }) };
        break;
      case "methodology-rule-upsert":
        response = { ok: true, rule: upsertMethodologyRule({ ...body, actor }) };
        break;
      case "methodology-fixture-upsert":
        response = { ok: true, fixture: upsertMethodologyFixture({ ...body, actor }) };
        break;
      case "methodology-version-publish":
        response = { ok: true, version: publishMethodologyVersion({ ...body, actor }) };
        break;
      case "aou-source-initialize":
        if (!foundation) return NextResponse.json({ ok: false, error: "AOU methodology requires an active Founder organisation." }, { status: 503 });
        response = { ok: true, result: initializeCanonicalAouSource({ state: getAppState(), organisationId: foundation.organisation.id, actor,
          expectedRecordVersion: Number(body.expectedRecordVersion), idempotencyKey: body.idempotencyKey, reason: body.reason }) };
        break;
      case "aou-display-draft":
        if (!foundation) return NextResponse.json({ ok: false, error: "AOU methodology requires an active Founder organisation." }, { status: 503 });
        response = { ok: true, result: saveAouDisplayDraft({ state: getAppState(), organisationId: foundation.organisation.id, actor,
          rowId: body.rowId, fields: body.fields, cleanupOnlyConfirmed: body.cleanupOnlyConfirmed, meaningChangeConfirmed: body.meaningChangeConfirmed,
          reason: body.reason, idempotencyKey: body.idempotencyKey, expectedRecordVersion: Number(body.expectedRecordVersion) }) };
        break;
      case "aou-display-approve":
        if (!foundation) return NextResponse.json({ ok: false, error: "AOU methodology requires an active Founder organisation." }, { status: 503 });
        response = { ok: true, result: approveAouDisplayCopy({ state: getAppState(), organisationId: foundation.organisation.id, actor,
          rowId: body.rowId, reason: body.reason, idempotencyKey: body.idempotencyKey, expectedRecordVersion: Number(body.expectedRecordVersion) }) };
        break;
      case "case-service-configure":
        if (!canEvaluateCases(actor)) {
          return deny("Only a consultant or administrator can update service setup.");
        }
        {
          const allowedFields = new Set(["action", "actorRole", "caseId", "serviceType", "canonicalStage", "serviceTemplateVersion", "scopeVersion", "inputReadiness", "currentDrawing", "expectedRecordVersion", "expectedRevision"]);
          const unknownField = Object.keys(body).find((key) => !allowedFields.has(key));
          if (unknownField) return NextResponse.json({ ok: false, error: `Unknown service setup field: ${unknownField}.` }, { status: 400 });
        }
        response = {
          ok: true,
          caseRecord: configureCaseService({
            caseId: body.caseId,
            serviceType: body.serviceType,
            canonicalStage: body.canonicalStage,
            serviceTemplateVersion: body.serviceTemplateVersion,
            scopeVersion: body.scopeVersion,
            inputReadiness: body.inputReadiness,
            currentDrawing: body.currentDrawing,
            actor,
            expectedRecordVersion: body.expectedRecordVersion
          })
        };
        break;
      case "case-rectification-request":
        if (!canEvaluateCases(actor)) return deny("Only a consultant or administrator can request rectification.");
        response = { ok: true, request: requestCaseRectification({ caseId: body.caseId, reason: body.reason, idempotencyKey: body.idempotencyKey, expectedRecordVersion: body.expectedRecordVersion, actor }) };
        break;
      case "case-rectification-approve":
        if (actor.role !== "ADMIN" && actor.role !== "SUPER_ADMIN") return deny("Only an administrator can approve rectification.");
        response = { ok: true, result: await approveCaseRectification({ requestId: body.requestId, expectedRecordVersion: body.expectedRecordVersion, actor }) };
        break;
      case "assessment-observation-upsert":
        if (!canEvaluateCases(actor)) return deny("Only a consultant or administrator can record assessment observations.");
        response = { ok: true, observation: upsertAssessmentObservation({ ...body, actor }) };
        break;
      case "assessment-recommendation-upsert":
        if (!canEvaluateCases(actor)) return deny("Only a consultant or administrator can record recommendations.");
        response = { ok: true, recommendation: upsertRecommendation({ ...body, actor }) };
        break;
      case "assessment-implementation-upsert":
        if (!canEvaluateCases(actor)) return deny("Only a consultant or administrator can record implementation tasks.");
        response = { ok: true, task: upsertImplementationTask({ ...body, actor }) };
        break;
      case "case-document-upsert":
        if (!canEvaluateCases(actor)) return deny("Only a consultant or administrator can record and verify case documents.");
        response = { ok: true, document: await upsertCaseDocument({ ...body, actor }) };
        break;
      case "case-document-issue-resolve":
        if (!canEvaluateCases(actor)) return deny("Only a consultant or administrator can resolve case document review issues.");
        response = { ok: true, result: resolveCaseDocumentIssue({ ...body, actor }) };
        break;
      case "manual-sheet-approve":
        if (actor.role !== "SUPER_ADMIN" || (foundation && foundation.membership.capability !== "organisation_owner")) return deny("Only the Founder organisation owner can approve the manual utility sheet.");
        response = { ok: true, result: approveManualUtilitySheet({ ...body, actor }) };
        break;
      case "site-analysis-upsert":
        if (actor.role !== "SUPER_ADMIN" || (foundation && foundation.membership.capability !== "organisation_owner")) return deny("Only the Founder organisation owner can record Site Analysis.");
        response = { ok: true, analysis: await upsertSiteAnalysis({ ...body, actor }) };
        break;
      case "site-analysis-checkpoint":
        if (actor.role !== "SUPER_ADMIN" || (foundation && foundation.membership.capability !== "organisation_owner")) return deny("Only the Founder organisation owner can review Site Analysis.");
        response = { ok: true, result: checkpointSiteAnalysis({ ...body, actor }) };
        break;
      case "post-site-findings-upsert":
        if (actor.role !== "SUPER_ADMIN" || (foundation && foundation.membership.capability !== "organisation_owner")) return deny("Only the Founder organisation owner can record Post-Site Findings.");
        response = { ok: true, findings: await upsertPostSiteFindings({ ...body, actor }) };
        break;
      case "post-site-findings-checkpoint":
        if (actor.role !== "SUPER_ADMIN" || (foundation && foundation.membership.capability !== "organisation_owner")) return deny("Only the Founder organisation owner can review Post-Site Findings.");
        response = { ok: true, result: checkpointPostSiteFindings({ ...body, actor }) };
        break;
      case "delivery-milestone-upsert":
        if (!canEvaluateCases(actor)) return deny("Only a consultant or administrator can manage service delivery milestones.");
        response = { ok: true, milestone: await upsertDeliveryMilestone({ ...body, actor }) };
        break;
      case "floor-create":
        if (!canEditFloorWorkspaces(actor)) {
          return deny("This role cannot create floor workspaces.");
        }
        response = { ok: true, floor: addFloorWorkspace(body.caseId, body.floorLabel, actor, body.expectedRecordVersion, body.idempotencyKey) };
        break;
      case "floor-evidence-add":
        if (!canEditFloorWorkspaces(actor)) {
          return deny("This role cannot add floor evidence.");
        }
        response = { ok: true, floor: addFloorEvidence(body.floorId, body.fileName, actor, body.expectedRecordVersion, body.idempotencyKey, deterministicContentHash({ action: "floor-evidence-add", floorId: body.floorId, fileName: body.fileName })) };
        break;
      case "floor-ready":
        if (!canEditFloorWorkspaces(actor)) {
          return deny("This role cannot mark floor workspaces ready.");
        }
        response = { ok: true, floor: markFloorWorkspaceReady(body.floorId, actor, body.expectedRecordVersion, body.idempotencyKey, deterministicContentHash({ action: "floor-ready", floorId: body.floorId })) };
        break;
      case "advance-pay":
        if (!canVerifyPayments(actor)) {
          return deny("This role cannot approve payments.");
        }
        return NextResponse.json({ ok: false, error: "Upload and independently verify scoped advance proof before approving payment." }, { status: 409 });
      case "advance-proof-verify":
        if (!canVerifyPayments(actor)) {
          return deny("This role cannot verify advance proof.");
        }
        response = {
          ok: true,
          result: await verifyAdvanceProofAndOpenCase({
            clientId: body.clientId,
            proposalId: body.proposalId,
            amountInr: Number(body.amountInr ?? 0),
            proofId: String(body.proofId ?? ""),
            actor,
            idempotencyKey: String(body.idempotencyKey ?? ""),
            expectedRecordVersion: body.expectedRecordVersion,
            allowSameActorVerification: Boolean(foundation?.isFounderEdition && foundation.organisation.founderUserId === actor.id && foundation.membership.capability === "organisation_owner")
          })
        };
        break;
      case "balance-pay":
        if (!canVerifyPayments(actor)) {
          return deny("This role cannot approve payments.");
        }
        return NextResponse.json({ ok: false, error: "Upload and independently verify scoped balance proof before approving payment." }, { status: 409 });
      case "balance-proof-verify":
        if (!canVerifyPayments(actor)) {
          return deny("This role cannot verify balance proof.");
        }
        response = {
          ok: true,
          result: await verifyBalanceProof({
            clientId: body.clientId,
            caseId: body.caseId,
            amountInr: Number(body.amountInr ?? 0),
            proofId: String(body.proofId ?? ""),
            actor,
            idempotencyKey: String(body.idempotencyKey ?? ""),
            expectedRecordVersion: body.expectedRecordVersion,
            allowSameActorVerification: Boolean(foundation?.isFounderEdition && foundation.organisation.founderUserId === actor.id && foundation.membership.capability === "organisation_owner")
          })
        };
        break;
      case "preview-report":
        if (!canEditFloorWorkspaces(actor)) {
          return deny("This role cannot generate report previews.");
        }
        response = { ok: true, report: await generatePreviewReport(body.caseId, body.floorId, actor, body.expectedRecordVersion, body.idempotencyKey) };
        break;
      case "stage-a-present":
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot record Stage A verdict presentation.");
        response = { ok: true, caseRecord: recordStageAVerdictPresentation({ caseId: body.caseId, floorId: body.floorId, note: body.note, actor,
          idempotencyKey: body.idempotencyKey, expectedRecordVersion: body.expectedRecordVersion }) };
        break;
      case "final-report-prepare":
        if (!canEditFloorWorkspaces(actor)) {
          return deny("This role cannot prepare final reports.");
        }
        response = { ok: true, report: await prepareFinalReport(body.caseId, body.floorId, actor, body.expectedRecordVersion, body.idempotencyKey) };
        break;
      case "report-approve":
        if (!canApproveReport(actor)) {
          return deny("This role cannot approve reports.");
        }
        response = { ok: true, report: approveReport(body.reportId, actor, typeof body.comment === "string" ? body.comment : undefined,
          foundation?.isFounderEdition ? { mode: "FOUNDER", creatorMayApprove: foundation.approvalPolicy.creatorMayApprove } : undefined,
          body.expectedRecordVersion, body.idempotencyKey) };
        break;
      case "verdict-release":
        if (!canReleaseVerdict(actor)) {
          return deny("This role cannot release verdicts.");
        }
        response = { ok: true, report: releaseVerdict(body.reportId, actor,
          foundation?.isFounderEdition ? { mode: "FOUNDER", creatorMayApprove: foundation.approvalPolicy.creatorMayApprove } : undefined,
          body.expectedRecordVersion, body.idempotencyKey) };
        break;
      case "shakti-rank":
        if (!canEvaluateCases(actor)) {
          return deny("This role cannot run or save Shakti evaluations.");
        }
        response = { ok: true, ranking: rankShaktiValues(body.values ?? []), snapshot: body.caseId ? recordShaktiSnapshot(body.caseId, body.floorId, body.values ?? [], actor, body.expectedRecordVersion, body.idempotencyKey) : null };
        break;
      case "evaluation-replacement-request":
        if (!canEvaluateCases(actor)) return deny("This role cannot request evaluation successors.");
        response = { ok: true, result: requestEvaluationReplacement({ ...body, actor }) };
        break;
      case "stage-b-remediation-initialise":
        if (!canEvaluateCases(actor)) return deny("This role cannot initialise Stage B remediation.");
        response = { ok: true, result: initialiseStageB({ ...body, actor }) };
        break;
      case "repository-case-used-create":
        if (!canEvaluateCases(actor)) return deny("This role cannot create a one-time case-used remedy.");
        response = { ok: true, result: createCaseUsedRemedy({ ...body, actor }) };
        break;
      case "repository-record-create":
        if (!canManageTemplates(actor)) return deny("Repository Administration requires an Admin or Super-Admin.");
        response = { ok: true, result: createRepositoryRecord({ ...body, actor }) };
        break;
      case "image-utility-derivative-process": {
        if (!canManageTemplates(actor)) return deny("Image Utility requires an Admin or Super-Admin.");
        const result = await processImageDerivative(getAppState(), getRuntimeEnv(), { ...body, actor });
        if (result.createdObjectKey) createdImageObjectKeys.push(result.createdObjectKey);
        const { createdObjectKey: _createdObjectKey, version, ...safeResult } = result;
        const safeVersion = version ? { ...version, privateObjectKey: undefined } : undefined;
        response = { ok: true, result: { ...safeResult, version: safeVersion } }; break;
      }
      case "image-utility-task-retry": {
        if (!canManageTemplates(actor)) return deny("Image Utility requires an Admin or Super-Admin.");
        const result = await retryImageDerivative(getAppState(), getRuntimeEnv(), { ...body, actor });
        if (result.createdObjectKey) createdImageObjectKeys.push(result.createdObjectKey);
        const { createdObjectKey: _createdObjectKey, version, ...safeResult } = result;
        const safeVersion = version ? { ...version, privateObjectKey: undefined } : undefined;
        response = { ok: true, result: { ...safeResult, version: safeVersion } }; break;
      }
      case "image-utility-batch-process": {
        if (!canManageTemplates(actor)) return deny("Image Utility requires an Admin or Super-Admin.");
        const result = await processImageBatch(getAppState(), getRuntimeEnv(), { ...body, actor });
        createdImageObjectKeys.push(...result.createdObjectKeys);
        const { createdObjectKeys: _createdObjectKeys, ...safeResult } = result;
        response = { ok: true, result: safeResult }; break;
      }
      case "image-utility-derivative-retire":
        if (!canManageTemplates(actor)) return deny("Image Utility requires an Admin or Super-Admin.");
        response = { ok: true, result: retireImageDerivative(getAppState(), { ...body, actor }) };
        break;
      case "branding-legacy-bootstrap":
        if (!canManageTemplates(actor)) return deny("Brand & Document Templates requires an Admin or Super-Admin.");
        response = { ok: true, result: bootstrapLegacyBranding({ state: getAppState(), actor, idempotencyKey: body.idempotencyKey, expectedRecordVersion: body.expectedRecordVersion, reason: body.reason }) };
        break;
      case "branding-profile-version-create":
        if (!canManageTemplates(actor)) return deny("Brand & Document Templates requires an Admin or Super-Admin.");
        response = { ok: true, result: createBrandProfileVersion({ state: getAppState(), actor, sourceProfileId: body.sourceProfileId, profile: body.profile, reason: body.reason, idempotencyKey: body.idempotencyKey, expectedRecordVersion: body.expectedRecordVersion }) };
        break;
      case "branding-profile-draft-update":
        if (!canManageTemplates(actor)) return deny("Brand & Document Templates requires an Admin or Super-Admin.");
        response = { ok: true, result: updateBrandProfileDraft({ state: getAppState(), actor, profileId: body.profileId, profile: body.profile, reason: body.reason, idempotencyKey: body.idempotencyKey, expectedRecordVersion: body.expectedRecordVersion }) };
        break;
      case "branding-profile-activate":
        if (!canManageTemplates(actor)) return deny("Brand & Document Templates requires an Admin or Super-Admin.");
        response = { ok: true, result: activateBrandProfile({ state: getAppState(), actor, profileId: body.profileId, reason: body.reason, idempotencyKey: body.idempotencyKey, expectedRecordVersion: body.expectedRecordVersion }) };
        break;
      case "branding-profile-archive":
        if (!canManageTemplates(actor)) return deny("Brand & Document Templates requires an Admin or Super-Admin.");
        response = { ok: true, result: archiveBrandProfile({ state: getAppState(), actor, profileId: body.profileId, reason: body.reason, idempotencyKey: body.idempotencyKey, expectedRecordVersion: body.expectedRecordVersion }) };
        break;
      case "document-template-version-create":
        if (!canManageTemplates(actor)) return deny("Brand & Document Templates requires an Admin or Super-Admin.");
        response = { ok: true, result: createDocumentTemplateVersion({ state: getAppState(), actor, family: body.family, sourceTemplateId: body.sourceTemplateId, template: body.template, reason: body.reason, idempotencyKey: body.idempotencyKey, expectedRecordVersion: body.expectedRecordVersion }) };
        break;
      case "document-template-draft-update":
        if (!canManageTemplates(actor)) return deny("Brand & Document Templates requires an Admin or Super-Admin.");
        response = { ok: true, result: updateDocumentTemplateDraft({ state: getAppState(), actor, templateId: body.templateId, template: body.template, reason: body.reason, idempotencyKey: body.idempotencyKey, expectedRecordVersion: body.expectedRecordVersion }) };
        break;
      case "document-template-activate":
        if (!canManageTemplates(actor)) return deny("Brand & Document Templates requires an Admin or Super-Admin.");
        response = { ok: true, result: activateDocumentTemplate({ state: getAppState(), actor, templateId: body.templateId, reason: body.reason, idempotencyKey: body.idempotencyKey, expectedRecordVersion: body.expectedRecordVersion }) };
        break;
      case "document-template-archive":
        if (!canManageTemplates(actor)) return deny("Brand & Document Templates requires an Admin or Super-Admin.");
        response = { ok: true, result: archiveDocumentTemplate({ state: getAppState(), actor, templateId: body.templateId, reason: body.reason, idempotencyKey: body.idempotencyKey, expectedRecordVersion: body.expectedRecordVersion }) };
        break;
      case "repository-record-update":
        if (!canManageTemplates(actor)) return deny("Repository Administration requires an Admin or Super-Admin.");
        response = { ok: true, result: updateRepositoryRecord({ ...body, actor }) };
        break;
      case "repository-record-approve":
        if (!canManageTemplates(actor)) return deny("Repository Administration requires an Admin or Super-Admin.");
        response = { ok: true, result: approveRepositoryRecord({ ...body, actor }) };
        break;
      case "repository-record-archive":
        if (!canManageTemplates(actor)) return deny("Repository Administration requires an Admin or Super-Admin.");
        response = { ok: true, result: archiveRepositoryRecord({ ...body, actor }) };
        break;
      case "repository-record-reactivate":
        if (!canManageTemplates(actor)) return deny("Repository Administration requires an Admin or Super-Admin.");
        response = { ok: true, result: reactivateRepositoryRecord({ ...body, actor }) };
        break;
      case "repository-preferred-asset-set":
        if (!canManageTemplates(actor)) return deny("Repository Administration requires an Admin or Super-Admin.");
        if (getAppState().imageDerivatives.some((item) => item.outputVersionId === body.assetVersionId)) {
          await validateStoredImageVersion(getAppState(), getRuntimeEnv(), actor, body.assetVersionId);
        }
        response = { ok: true, result: setRepositoryPreferredAsset({ ...body, actor }) };
        break;
      case "repository-records-bulk-transition":
        if (!canManageTemplates(actor)) return deny("Repository Administration requires an Admin or Super-Admin.");
        response = { ok: true, result: bulkTransitionRepositoryRecords({ ...body, actor }) };
        break;
      case "repository-case-used-merge":
        if (!canManageTemplates(actor)) return deny("Only an Admin or Super-Admin can merge a case-used remedy into the Main Library Draft workflow.");
        response = { ok: true, result: mergeCaseUsedIntoMainLibrary({ ...body, actor }) };
        break;
      case "repository-import-stage":
        if (!canManageTemplates(actor)) return deny("Repository import requires an Admin or Super-Admin.");
        response = { ok: true, result: stageRepositoryCsvImport({ ...body, actor }) };
        break;
      case "repository-import-approve":
        if (!canManageTemplates(actor)) return deny("Repository import approval requires an Admin or Super-Admin.");
        response = { ok: true, result: approveRepositoryImportRows({ ...body, actor }) };
        break;
      case "repository-section-a-consume":
        if (!canEvaluateCases(actor)) return deny("This role cannot add approved repository items to Section A.");
        response = { ok: true, result: consumeSectionARepositoryRecord({ ...body, actor }) };
        break;
      case "repository-section-c-consume":
        if (!canEvaluateCases(actor)) return deny("This role cannot add approved repository items to Section C.");
        response = { ok: true, result: consumeSectionCRepositoryRecord({ ...body, actor }) };
        break;
      case "stage-b-final-layout-select":
        if (!canEvaluateCases(actor)) return deny("This role cannot select the final revised layout.");
        response = { ok: true, result: selectFinalRevisedLayout({ ...body, actor }) };
        break;
      case "revised-layout-candidate-create": {
        if (!canEvaluateCases(actor)) return deny("This role cannot add a revised-layout candidate.");
        if (body.purpose !== "REVISED_FURNITURE_LAYOUT") return NextResponse.json({ ok: false, error: "The revised-layout semantic purpose is required." }, { status: 400 });
        const current = getAppState(); const remediation = current.stageBRemediations.find((item) => item.id === String(body.remediationId) && item.organisationId === actor.organisationId);
        const caseRecord = remediation && current.vastuCases.find((item) => item.id === remediation.caseId && item.projectId === remediation.projectId && item.organisationId === actor.organisationId);
        const floor = remediation && current.floorWorkspaces.find((item) => item.id === remediation.floorId && item.caseId === remediation.caseId && item.projectId === remediation.projectId);
        if (!remediation || !caseRecord || !floor) return NextResponse.json({ ok: false, error: "Revised-layout candidate scope is not authorised." }, { status: 404 });
        const artifact = await resolveCaseFileEvidenceAuthority(String(body.evidenceRef), { organisationId: actor.organisationId!, caseId: caseRecord.id, caseRevisionNumber: caseRecord.revisionNumber ?? 1, serviceType: normalizeCaseService(caseRecord).serviceType, floorLabel: floor.floorLabel });
        response = { ok: true, result: createRevisedLayoutCandidate({ ...body, actor, sourceAssetId: artifact.artifactId, sourceFileName: artifact.fileName, sourceMimeType: artifact.mimeType, sourceSizeBytes: artifact.sizeBytes, checksumSha256: artifact.checksumSha256 }) };
        break;
      }
      case "revised-layout-candidate-approve":
        if (actor.role !== "SUPER_ADMIN") return deny("Only the Founder can approve a revised-layout candidate.");
        response = { ok: true, result: approveRevisedLayoutCandidate({ ...body, actor }) };
        break;
      case "stage-b-remedy-resolve":
        if (!canEvaluateCases(actor)) return deny("This role cannot resolve Stage B remedies.");
        response = { ok: true, result: resolveEligibleRemedies({ ...body, actor }) };
        break;
      case "stage-b-remedy-placement-upsert":
        if (!canEvaluateCases(actor)) return deny("This role cannot place Stage B remedies.");
        response = { ok: true, result: upsertRemedyPlacement({ ...body, actor }) };
        break;
      case "stage-b-remedy-placement-delete":
        if (!canEvaluateCases(actor)) return deny("This role cannot delete Stage B remedy placements.");
        response = { ok: true, result: deleteRemedyPlacement({ ...body, actor }) };
        break;
      case "stage-b-page-finalise":
        if (!canApproveReport(actor)) return deny("This role cannot finalise Stage B report pages.");
        response = { ok: true, result: finaliseStageBPage({ ...body, actor }) };
        break;
      case "stage-b-integrity-validate":
        if (!canEvaluateCases(actor)) return deny("This role cannot validate Stage B integrity.");
        response = { ok: true, result: validateStageBIntegrity({ ...body, actor }) };
        break;
      case "section-a-initialise":
        if (!canEvaluateCases(actor)) return deny("This role cannot initialise Section A.");
        response = { ok: true, result: initialiseSectionA({ ...body, actor }) };
        break;
      case "section-a-asset-register":
        if (!canEvaluateCases(actor)) return deny("This role cannot register Section A assets.");
        response = { ok: true, result: registerSectionAAsset({ ...body, actor }) };
        break;
      case "section-a-annotation-upsert":
        if (!canEvaluateCases(actor)) return deny("This role cannot annotate the Existing Layout.");
        response = { ok: true, result: upsertExistingLayoutAnnotation({ ...body, actor }) };
        break;
      case "section-a-annotation-delete":
        if (!canEvaluateCases(actor)) return deny("This role cannot delete Existing Layout annotations.");
        response = { ok: true, result: deleteExistingLayoutAnnotation({ ...body, actor }) };
        break;
      case "section-a-placement-upsert":
        if (!canEvaluateCases(actor)) return deny("This role cannot place Section A items.");
        response = { ok: true, result: upsertSectionAPlacement({ ...body, actor }) };
        break;
      case "section-a-placement-delete":
        if (!canEvaluateCases(actor)) return deny("This role cannot delete Section A placements.");
        response = { ok: true, result: deleteSectionAPlacement({ ...body, actor }) };
        break;
      case "section-a-colour-frame-upsert":
        if (!canEvaluateCases(actor)) return deny("This role cannot compose Section A Colour Frames.");
        response = { ok: true, result: upsertColourFrameComposition({ ...body, actor }) };
        break;
      case "section-a-colour-frame-delete":
        if (!canEvaluateCases(actor)) return deny("This role cannot delete Section A Colour Frames.");
        response = { ok: true, result: deleteColourFrameComposition({ ...body, actor }) };
        break;
      case "section-a-page-finalise":
        if (!canApproveReport(actor)) return deny("This role cannot finalise Section A report pages.");
        response = { ok: true, result: finaliseSectionAPage({ ...body, actor }) };
        break;
      case "section-a-integrity-validate":
        if (!canEvaluateCases(actor)) return deny("This role cannot validate Section A integrity.");
        response = { ok: true, result: validateSectionAIntegrity({ ...body, actor }) };
        break;
      case "remediation-report-integrity-validate":
        if (!canEvaluateCases(actor)) return deny("This role cannot validate remediation report integrity.");
        response = { ok: true, result: validateRemediationReportIntegrity({ ...body, actor }) };
        break;
      case "section-c-extra-page-add":
        if (!canEvaluateCases(actor)) return deny("This role cannot add Section C Extra pages.");
        response = { ok: true, result: addSectionCExtraPage({ ...body, actor }) };
        break;
      case "section-c-extra-page-rename":
        if (!canEvaluateCases(actor)) return deny("This role cannot rename Section C Extra pages.");
        response = { ok: true, result: renameSectionCExtraPage({ ...body, actor }) };
        break;
      case "section-c-extra-pages-reorder":
        if (!canEvaluateCases(actor)) return deny("This role cannot reorder Section C Extra pages.");
        response = { ok: true, result: reorderSectionCExtraPages({ ...body, actor }) };
        break;
      case "section-c-extra-page-retire":
        if (!canEvaluateCases(actor)) return deny("This role cannot retire Section C Extra pages.");
        response = { ok: true, result: retireSectionCExtraPage({ ...body, actor }) };
        break;
      case "section-c-asset-register":
        if (!canEvaluateCases(actor)) return deny("This role cannot register Section C Extra assets.");
        response = { ok: true, result: registerSectionCAsset({ ...body, actor }) };
        break;
      case "section-c-placement-upsert":
        if (!canEvaluateCases(actor)) return deny("This role cannot place Section C Extra items.");
        response = { ok: true, result: upsertSectionCPlacement({ ...body, actor }) };
        break;
      case "section-c-placement-delete":
        if (!canEvaluateCases(actor)) return deny("This role cannot delete Section C Extra placements.");
        response = { ok: true, result: deleteSectionCPlacement({ ...body, actor }) };
        break;
      case "section-c-page-finalise":
        if (!canApproveReport(actor)) return deny("This role cannot finalise Section C Extra pages.");
        response = { ok: true, result: finaliseSectionCPage({ ...body, actor }) };
        break;
      case "section-c-sequence-finalise":
        if (!canApproveReport(actor)) return deny("This role cannot finalise the Section C Extras sequence.");
        response = { ok: true, result: finaliseSectionCSequence({ ...body, actor }) };
        break;
      case "section-c-integrity-validate":
        if (!canEvaluateCases(actor)) return deny("This role cannot validate Section C integrity.");
        response = { ok: true, result: validateSectionCIntegrity({ ...body, actor }) };
        break;
      case "document-delivery-prepare": {
        if (!foundation || !hasOrganisationCapability(foundation.membership, "DELIVERY")) return deny("The active organisation membership does not permit final report delivery.");
        const protectedPdf = await inspectProtectedPdfForDelivery({ state: getAppState(), organisationId: foundation.organisation.id, reportId: body.reportId });
        response = { ok: true, result: prepareDocumentDelivery({ state: getAppState(), organisationId: foundation.organisation.id, actor,
          reportId: body.reportId, expectedRecordVersion: body.expectedRecordVersion, protectedPdf, idempotencyKey: body.idempotencyKey, requestId }) };
        break;
      }
      case "document-delivery-mark-ready": {
        if (!foundation || !hasOrganisationCapability(foundation.membership, "DELIVERY")) return deny("The active organisation membership does not permit final report delivery.");
        const delivery = getAppState().documentDeliveries.find((item) => item.id === body.deliveryId && item.organisationId === foundation!.organisation.id);
        if (!delivery) return NextResponse.json({ ok: false, error: "Delivery record not found." }, { status: 404 });
        const protectedPdf = await inspectProtectedPdfForDelivery({ state: getAppState(), organisationId: foundation.organisation.id,
          reportId: delivery.reportId, protectedPdfArtifactId: delivery.protectedPdfArtifactId });
        response = { ok: true, result: markDocumentDeliveryReady({ state: getAppState(), organisationId: foundation.organisation.id, actor,
          deliveryId: body.deliveryId, expectedRecordVersion: body.expectedRecordVersion, protectedPdf, idempotencyKey: body.idempotencyKey, requestId }) };
        break;
      }
      case "document-delivery-deliver": {
        if (!foundation || !hasOrganisationCapability(foundation.membership, "DELIVERY")) return deny("The active organisation membership does not permit final report delivery.");
        const delivery = getAppState().documentDeliveries.find((item) => item.id === body.deliveryId && item.organisationId === foundation!.organisation.id);
        if (!delivery) return NextResponse.json({ ok: false, error: "Delivery record not found." }, { status: 404 });
        const protectedPdf = await inspectProtectedPdfForDelivery({ state: getAppState(), organisationId: foundation.organisation.id,
          reportId: delivery.reportId, protectedPdfArtifactId: delivery.protectedPdfArtifactId });
        response = { ok: true, result: deliverDocument({ state: getAppState(), organisationId: foundation.organisation.id, actor,
          deliveryId: body.deliveryId, expectedRecordVersion: body.expectedRecordVersion, channel: body.channel,
          manualHandoffDescription: body.manualHandoffDescription, protectedPdf, idempotencyKey: body.idempotencyKey, requestId }) };
        break;
      }
      case "document-delivery-acknowledge": {
        const client = findOwnedClient(actor, getAppState().clients);
        response = { ok: true, result: acknowledgeDocumentDelivery({ state: getAppState(), actor, clientId: client.id,
          deliveryId: body.deliveryId, expectedRecordVersion: body.expectedRecordVersion, idempotencyKey: body.idempotencyKey, requestId }) };
        break;
      }
      case "utility-evaluate":
        if (!canEvaluateCases(actor)) {
          return deny("This role cannot create utility evaluation snapshots.");
        }
        response = {
          ok: true,
          snapshot: createEvaluationSnapshot(body.caseId, body.floorId, body.snapshotName, body.zoneCodes, actor, body.expectedRecordVersion, body.idempotencyKey, body.utilityInputs)
        };
        break;
      case "utility-verdict":
        if (!canEvaluateCases(actor)) return deny("This role cannot frame Utility verdicts.");
        response = { ok: true, verdict: createUtilityVerdict({ ...body, actor }) };
        break;
      case "whatsapp-send":
        if (!canManageTemplates(actor)) {
          return deny("This role cannot send templates.");
        }
        response = { ok: true, log: sendWhatsAppTemplate(body.templateId, body.clientId, body.recipientPhone, actor) };
        break;
      case "template-toggle":
        if (!canManageTemplates(actor)) {
          return deny("This role cannot manage templates.");
        }
        response = { ok: true, template: toggleWhatsAppTemplate(body.templateId, Boolean(body.active), actor) };
        break;
      case "template-create":
        if (!canManageTemplates(actor)) {
          return deny("This role cannot manage templates.");
        }
        response = { ok: true, template: createWhatsAppTemplate(body, actor) };
        break;
      case "snapshot":
        if (!canReadClientSnapshots(actor)) {
          return deny("This role cannot read client snapshots.");
        }
        response = { ok: true, snapshot: getClientSnapshot(body.clientId) };
        break;
      case "client-outreach-send":
        if (!canTriggerDeliverables(actor)) {
          return deny("This role cannot send client outreach.");
        }
        response = {
          ok: true,
          result: recordClientOutreachSend({
            clientId: body.clientId,
            stepKey: String(body.stepKey ?? ""),
            channel: body.channel === "whatsapp" ? "whatsapp" : "email",
            title: String(body.title ?? "Client outreach"),
            sentBy: actor
          })
        };
        break;
      case "lead-draft":
        response = { ok: true };
        break;
      default:
        return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
    }

    timing.end("domain-action", domainStartedAt);
    if (globalRevisionStale) {
      const changed = JSON.stringify(getAppState()) !== JSON.stringify(rollbackState);
      if (changed) {
        setAppState(rollbackState!);
        return NextResponse.json({ ok: false, error: "The saved state changed. Refresh and try again." }, { status: 409 });
      }
      return NextResponse.json(response);
    }
    if (foundation && organisationStateBefore) {
      stampOrganisationOwnership(getAppState(), organisationStateBefore, foundation.organisation.id, actor.id);
    }
    const persistenceStartedAt = timing.start();
    await persistStateToDatabase(undefined, expectedGlobalRevision);
    timing.end("persistence-total", persistenceStartedAt);
    appStatePersisted = true;
    if (foundation && organisationStateBefore) {
      const beforeHash = deterministicContentHash(organisationStateBefore);
      const afterHash = deterministicContentHash(getAppState());
      if (beforeHash !== afterHash) {
        const entityId = [body.deliveryId, body.reportId, body.floorId, body.caseId, body.clientId, body.proposalId, body.recordId, body.leadId]
          .find((value) => typeof value === "string" && value) ?? foundation.organisation.id;
        const suppliedReason = [body.reason, body.correctionReason, body.note].find((value) => typeof value === "string" && value.trim().length >= 20);
        await appendImmutableAuditEvent({ organisationId: foundation.organisation.id, actor, action: `PROTECTED_ACTION_${action}`,
          entityType: "BUSINESS_WORKFLOW", entityId, reason: suppliedReason?.trim() ?? `Founder Edition protected action completed: ${action}.`,
          requestId, idempotencyKey: `protected-action:${action}:${String(body.idempotencyKey ?? requestId)}`,
          beforeHash, afterHash, ...(typeof body.caseId === "string" ? { caseId: body.caseId } : {}),
          ...(typeof body.floorId === "string" ? { floorId: body.floorId } : {}) });
      }
    }
    const responseStartedAt = timing.start();
    const finalResponse = NextResponse.json(response);
    timing.end("response-serialization", responseStartedAt);
    return withServerTiming(finalResponse, timing);
  } catch (error) {
    if (!appStatePersisted && createdImageObjectKeys.length) {
      await Promise.all(createdImageObjectKeys.map((key) => getRuntimeEnv().R2?.delete(key).catch(() => undefined)));
    }
    if (rollbackState) setAppState(rollbackState);
    if (error instanceof AuthenticationError) return authErrorResponse(error);
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = error instanceof FoundationAccessError ? error.statusCode
      : error && typeof error === "object" && "statusCode" in error && [400, 401, 403, 404, 409, 413, 428, 503].includes(Number(error.statusCode))
        ? Number(error.statusCode) : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
