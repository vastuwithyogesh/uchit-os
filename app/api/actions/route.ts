import { NextResponse } from "next/server";
import { resolveRequestActor } from "@/lib/auth";
import { loadStateSnapshotFromPersistence, persistStateToDatabase } from "@/lib/persistence";
import { getAppState, setAppState, type AppState } from "@/lib/store";
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
  approveAdvancePayment,
  approveBalancePayment,
  approveCommercialProposal,
  approveReport,
  bookQualificationCall,
  createCommercialProposal,
  createEvaluationSnapshot,
  createWhatsAppTemplate,
  createVastuCase,
  bookReviewCall,
  completeReviewCall,
  configureCaseService,
  approveCaseRectification,
  generatePreviewReport,
  getClientSnapshot,
  lockOrientation,
  markFloorWorkspaceReady,
  prepareFinalReport,
  rankShaktiValues,
  recordShaktiSnapshot,
  recordLeadQualification,
  recordClientOutreachSend,
  requestCaseRectification,
  upsertAssessmentObservation,
  upsertRecommendation,
  upsertImplementationTask,
  upsertCaseDocument,
  upsertDeliveryMilestone,
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
  const actor = await resolveRequestActor(request.headers, body.actorRole);
  const concurrencyActions = new Set(["case-service-configure", "case-rectification-request", "case-rectification-approve", "assessment-observation-upsert", "assessment-recommendation-upsert", "assessment-implementation-upsert", "case-document-upsert", "delivery-milestone-upsert"]);
  let expectedGlobalRevision: number | undefined;
  let rollbackState: AppState | undefined;
  let globalRevisionStale = false;

  function deny(message: string) {
    return NextResponse.json({ ok: false, error: message }, { status: 403 });
  }

  try {
    let response: unknown;

    if (concurrencyActions.has(action)) {
      if (!("expectedRecordVersion" in body) || !("expectedRevision" in body)) {
        return NextResponse.json({ ok: false, error: "The latest case and state versions are required. Refresh and try again." }, { status: 428 });
      }
      const latest = await loadStateSnapshotFromPersistence();
      rollbackState = structuredClone(latest.state);
      globalRevisionStale = body.expectedRevision !== latest.revision;
      expectedGlobalRevision = latest.revision ?? undefined;
    }

    const assessmentAllowedFields: Record<string, string[]> = {
      "assessment-observation-upsert": ["recordId", "title", "observation", "alignmentStatus", "energyStatus", "placementStatus", "evidenceRefs"],
      "assessment-recommendation-upsert": ["recordId", "title", "rationale", "recommendedAction", "decisionPriority", "attentionClass", "implementationHorizon", "level", "observationIds", "evidenceRefs"],
      "assessment-implementation-upsert": ["recordId", "recommendationId", "title", "notes", "status", "implementationHorizon", "ownerRole", "ownerName", "evidenceRefs"]
      ,"case-document-upsert": ["recordId", "assetType", "floorLabel", "versionLabel", "documentDate", "isCurrent", "evidenceRef", "discrepancy", "blocker", "reviewObservation", "requiredChange", "preferredAlternative", "acceptableAlternative", "ownerRole", "ownerName", "revisionStatus"]
      ,"delivery-milestone-upsert": ["recordId", "kind", "sequence", "roundLabel", "title", "status", "dueDate", "ownerRole", "ownerName", "drawingRef", "observationSummary", "actionSummary", "reason", "evidenceRefs"]
    };
    if (assessmentAllowedFields[action]) {
      const allowed = new Set(["action", "actorRole", "caseId", "idempotencyKey", "expectedRecordVersion", "expectedRevision", ...assessmentAllowedFields[action]]);
      const unknown = Object.keys(body).find((key) => !allowed.has(key));
      if (unknown) return NextResponse.json({ ok: false, error: `Unknown assessment field: ${unknown}.` }, { status: 400 });
    }

    switch (action) {
      case "reset":
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
        response = { ok: true, proposal: createCommercialProposal(body.clientId, body.amountInr) };
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
            durationMinutes: Number(body.durationMinutes ?? 30),
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
        response = { ok: true, proposal: approveCommercialProposal(body.proposalId, actor) };
        break;
      case "case-create":
        if (!canTriggerDeliverables(actor)) {
          return deny("This role cannot create cases.");
        }
        response = { ok: true, caseRecord: createVastuCase(body.clientId, body.proposalId) };
        break;
      case "orientation-lock":
        if (!canEditFloorWorkspaces(actor)) {
          return deny("This role cannot lock floor workspaces.");
        }
        response = { ok: true, result: lockOrientation(body.caseId, body.reason, actor) };
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
      case "delivery-milestone-upsert":
        if (!canEvaluateCases(actor)) return deny("Only a consultant or administrator can manage service delivery milestones.");
        response = { ok: true, milestone: await upsertDeliveryMilestone({ ...body, actor }) };
        break;
      case "floor-create":
        if (!canEditFloorWorkspaces(actor)) {
          return deny("This role cannot create floor workspaces.");
        }
        response = { ok: true, floor: addFloorWorkspace(body.caseId, body.floorLabel, actor) };
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
        response = { ok: true, payment: approveAdvancePayment(body.clientId, body.proposalId, body.amountInr, actor) };
        break;
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
            referenceScreenshotUrl: String(body.referenceScreenshotUrl ?? ""),
            referenceScreenshotFileName: String(body.referenceScreenshotFileName ?? ""),
            actor
          })
        };
        break;
      case "balance-pay":
        if (!canVerifyPayments(actor)) {
          return deny("This role cannot approve payments.");
        }
        response = { ok: true, payment: approveBalancePayment(body.clientId, body.caseId, body.amountInr, actor) };
        break;
      case "balance-proof-verify":
        if (!canVerifyPayments(actor)) {
          return deny("This role cannot verify balance proof.");
        }
        response = {
          ok: true,
          result: verifyBalanceProof({
            clientId: body.clientId,
            caseId: body.caseId,
            amountInr: Number(body.amountInr ?? 0),
            referenceScreenshotUrl: String(body.referenceScreenshotUrl ?? ""),
            referenceScreenshotFileName: String(body.referenceScreenshotFileName ?? ""),
            actor
          })
        };
        break;
      case "preview-report":
        if (!canEditFloorWorkspaces(actor)) {
          return deny("This role cannot generate report previews.");
        }
        response = { ok: true, report: await generatePreviewReport(body.caseId, actor) };
        break;
      case "final-report-prepare":
        if (!canEditFloorWorkspaces(actor)) {
          return deny("This role cannot prepare final reports.");
        }
        response = { ok: true, report: await prepareFinalReport(body.caseId, actor) };
        break;
      case "report-approve":
        if (!canApproveReport(actor)) {
          return deny("This role cannot approve reports.");
        }
        response = { ok: true, report: approveReport(body.reportId, actor, typeof body.comment === "string" ? body.comment : undefined) };
        break;
      case "verdict-release":
        if (!canReleaseVerdict(actor)) {
          return deny("This role cannot release verdicts.");
        }
        response = { ok: true, report: releaseVerdict(body.reportId, actor) };
        break;
      case "shakti-rank":
        if (!canEvaluateCases(actor)) {
          return deny("This role cannot run or save Shakti evaluations.");
        }
        response = { ok: true, ranking: rankShaktiValues(body.values ?? []), snapshot: body.caseId ? recordShaktiSnapshot(body.caseId, body.values ?? [], actor) : null };
        break;
      case "utility-evaluate":
        if (!canEvaluateCases(actor)) {
          return deny("This role cannot create utility evaluation snapshots.");
        }
        response = {
          ok: true,
          snapshot: createEvaluationSnapshot(body.caseId, body.snapshotName, body.zoneCodes, actor)
        };
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
    await persistStateToDatabase(undefined, expectedGlobalRevision);
    return NextResponse.json(response);
  } catch (error) {
    if (rollbackState) setAppState(rollbackState);
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = error && typeof error === "object" && "statusCode" in error && (error.statusCode === 409 || error.statusCode === 428) ? error.statusCode : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
