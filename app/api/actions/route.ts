import { NextResponse } from "next/server";
import { AuthenticationError, authErrorResponse, isExplicitLocalDemo, isInitialOrganisationOwnerEmail, resolveRequestActor } from "@/lib/auth";
import { loadStateSnapshotFromPersistence, persistStateToDatabase } from "@/lib/persistence";
import { getAppState, setAppState, type AppState } from "@/lib/store";
import { appendImmutableAuditEvent, FoundationAccessError, resolveActiveOrganisationContext } from "@/lib/foundation.server";
import { assertOrganisationRequestScope, stampOrganisationOwnership } from "@/lib/organisation-scope";
import { deterministicContentHash } from "@/lib/evaluation-provenance";
import { createOpeningMapping, createPlanVersion, createSpatialEvidenceVersion, lockExactOrientation } from "@/lib/spatial-workflow";
import { createMethodologyVersion, publishMethodologyVersion, upsertMethodologyFixture, upsertMethodologyRule } from "@/lib/methodology-registry";
import { approveAouDisplayCopy, initializeCanonicalAouSource, saveAouDisplayDraft } from "@/lib/aou-methodology";
import { transitionFloorRegeneration } from "@/lib/founder-regeneration";
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
  upsertDeliveryMilestone,
  transitionClientPipeline,
  updateCommercialPolicy,
  upsertClientIntake,
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
  const body = await request.json().catch(() => ({}));
  const action = body.action as string;
  let actor: Awaited<ReturnType<typeof resolveRequestActor>>;
  let foundation: Awaited<ReturnType<typeof resolveActiveOrganisationContext>> | null = null;
  let organisationStateBefore: AppState | undefined;
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  const concurrencyActions = new Set(["case-service-configure", "case-rectification-request", "case-rectification-approve", "assessment-observation-upsert", "assessment-recommendation-upsert", "assessment-implementation-upsert", "case-document-upsert", "delivery-milestone-upsert", "site-analysis-upsert", "site-analysis-checkpoint", "post-site-findings-upsert", "post-site-findings-checkpoint", "manual-sheet-approve", "client-pipeline-transition", "commercial-policy-update", "client-intake-upsert", "proposal-create", "proposal-approve", "case-create", "advance-proof-verify", "preview-report", "stage-a-present", "balance-proof-verify", "final-report-prepare", "report-approve", "verdict-release", "utility-evaluate", "utility-verdict", "shakti-rank", "floor-create", "plan-version-create", "spatial-evidence-create", "orientation-version-lock", "opening-mapping-create", "space-mapping-create", "regeneration-transition", "methodology-version-create", "methodology-rule-upsert", "methodology-fixture-upsert", "methodology-version-publish", "aou-source-initialize", "aou-display-draft", "aou-display-approve"]);
  let expectedGlobalRevision: number | undefined;
  let rollbackState: AppState | undefined;
  let globalRevisionStale = false;

  function deny(message: string) {
    return NextResponse.json({ ok: false, error: message }, { status: 403 });
  }

  try {
    actor = await resolveRequestActor(request.headers, body.actorRole);
    foundation = isExplicitLocalDemo(request.headers) ? null
      : await resolveActiveOrganisationContext(actor, isInitialOrganisationOwnerEmail(actor.email));
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
      const latest = await loadStateSnapshotFromPersistence();
      rollbackState = structuredClone(latest.state);
      globalRevisionStale = body.expectedRevision !== latest.revision;
      expectedGlobalRevision = latest.revision ?? undefined;
    }

    const crmAllowedFields: Record<string, string[]> = {
      "client-pipeline-transition": ["action", "actorRole", "clientId", "pipelineStage", "nextAction", "nextActionDueAt", "correction", "correctionReason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "commercial-policy-update": ["action", "actorRole", "defaultProposalAmountInr", "minimumAdvanceInr", "qualificationCallTargetMinutes", "nextActionDueSoonHours", "defaultReviewCallMinutes", "reason", "idempotencyKey", "expectedPolicyVersion", "expectedRevision"]
      ,"client-intake-upsert": ["action", "actorRole", "clientId", "contactPreference", "businessContext", "decisionMakerStatus", "otherDecisionMakers", "propertyContext", "needs", "consent", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
      ,"proposal-create": ["action", "actorRole", "clientId", "amountInr", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
      ,"proposal-approve": ["action", "actorRole", "clientId", "proposalId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
      ,"case-create": ["action", "actorRole", "clientId", "proposalId", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]
    };
    if (crmAllowedFields[action]) {
      const allowed = new Set(crmAllowedFields[action]);
      const unknown = Object.keys(body).find((key) => !allowed.has(key));
      if (unknown) return NextResponse.json({ ok: false, error: `Unknown CRM field: ${unknown}.` }, { status: 400 });
    }

    const assessmentAllowedFields: Record<string, string[]> = {
      "assessment-observation-upsert": ["recordId", "floorId", "title", "observation", "alignmentStatus", "energyStatus", "placementStatus", "evidenceRefs"],
      "assessment-recommendation-upsert": ["recordId", "floorId", "title", "rationale", "recommendedAction", "decisionPriority", "attentionClass", "implementationHorizon", "level", "observationIds", "evidenceRefs"],
      "assessment-implementation-upsert": ["recordId", "floorId", "recommendationId", "title", "notes", "status", "implementationHorizon", "ownerRole", "ownerName", "evidenceRefs"]
      ,"case-document-upsert": ["recordId", "assetType", "floorLabel", "versionLabel", "documentDate", "isCurrent", "evidenceRef", "discrepancy", "blocker", "reviewObservation", "requiredChange", "preferredAlternative", "acceptableAlternative", "ownerRole", "ownerName", "revisionStatus"]
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
      "spatial-evidence-create": ["action", "actorRole", "caseId", "floorId", "planVersionId", "kind", "classification", "manualEvidencePurpose", "has32SectorChakra", "has16DirectionMapping", "evidenceRef", "fullColourConfirmed", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
      "orientation-version-lock": ["action", "actorRole", "caseId", "exactDegree", "googleEarthEvidenceVersionId", "reason", "idempotencyKey", "expectedRecordVersion", "expectedRevision"],
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
    };
    if (evaluationAllowedFields[action] && Object.keys(body).some((field) => !evaluationAllowedFields[action].includes(field))) return NextResponse.json({ ok: false, error: "Unsupported evaluation field." }, { status: 400 });
    if (["proposal-create", "proposal-approve", "case-create", "advance-proof-verify", "preview-report", "stage-a-present", "balance-proof-verify", "final-report-prepare", "report-approve", "verdict-release", "utility-evaluate", "utility-verdict", "shakti-rank", "floor-create", "plan-version-create", "spatial-evidence-create", "orientation-version-lock", "opening-mapping-create", "space-mapping-create", "regeneration-transition", "methodology-version-create", "methodology-rule-upsert", "methodology-fixture-upsert", "methodology-version-publish", "aou-source-initialize", "aou-display-draft", "aou-display-approve", "site-analysis-upsert", "site-analysis-checkpoint", "post-site-findings-upsert", "post-site-findings-checkpoint", "manual-sheet-approve"].includes(action)
      && (typeof body.idempotencyKey !== "string" || body.idempotencyKey.trim().length < 8 || body.idempotencyKey.length > 160)) {
      return NextResponse.json({ ok: false, error: "A stable idempotency key is required for this protected action." }, { status: 400 });
    }

    switch (action) {
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
      case "opening-mapping-create":
        if (!canEditFloorWorkspaces(actor)) return deny("This role cannot manage 32-direction opening mappings.");
        response = { ok: true, mapping: createOpeningMapping({ ...body, actor }) };
        break;
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
        response = { ok: true, floor: addFloorEvidence(body.floorId, body.fileName, actor) };
        break;
      case "floor-ready":
        if (!canEditFloorWorkspaces(actor)) {
          return deny("This role cannot mark floor workspaces ready.");
        }
        response = { ok: true, floor: markFloorWorkspaceReady(body.floorId, actor) };
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
    await persistStateToDatabase(undefined, expectedGlobalRevision);
    if (foundation && organisationStateBefore) {
      const beforeHash = deterministicContentHash(organisationStateBefore);
      const afterHash = deterministicContentHash(getAppState());
      if (beforeHash !== afterHash) {
        const entityId = [body.reportId, body.floorId, body.caseId, body.clientId, body.proposalId, body.recordId, body.leadId]
          .find((value) => typeof value === "string" && value) ?? foundation.organisation.id;
        const suppliedReason = [body.reason, body.correctionReason, body.note].find((value) => typeof value === "string" && value.trim().length >= 20);
        await appendImmutableAuditEvent({ organisationId: foundation.organisation.id, actor, action: `PROTECTED_ACTION_${action}`,
          entityType: "BUSINESS_WORKFLOW", entityId, reason: suppliedReason?.trim() ?? `Founder Edition protected action completed: ${action}.`,
          requestId, idempotencyKey: `protected-action:${action}:${String(body.idempotencyKey ?? requestId)}`,
          beforeHash, afterHash, ...(typeof body.caseId === "string" ? { caseId: body.caseId } : {}),
          ...(typeof body.floorId === "string" ? { floorId: body.floorId } : {}) });
      }
    }
    return NextResponse.json(response);
  } catch (error) {
    if (rollbackState) setAppState(rollbackState);
    if (error instanceof AuthenticationError) return authErrorResponse(error);
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = error instanceof FoundationAccessError ? error.statusCode
      : error && typeof error === "object" && "statusCode" in error && [400, 401, 403, 404, 409, 428, 503].includes(Number(error.statusCode))
        ? Number(error.statusCode) : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
