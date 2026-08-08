import { NextResponse } from "next/server";
import { resolveRequestActor } from "@/lib/auth";
import { persistStateToDatabase } from "@/lib/persistence";
import {
  canApproveCommercialProposal,
  canApproveReport,
  canEditFloorWorkspaces,
  canManageTemplates,
  canReleaseVerdict,
  canTriggerDeliverables
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
  generatePreviewReport,
  getClientSnapshot,
  lockOrientation,
  markFloorWorkspaceReady,
  prepareFinalReport,
  rankShaktiValues,
  recordShaktiSnapshot,
  recordLeadQualification,
  recordClientOutreachSend,
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

  function deny(message: string) {
    return NextResponse.json({ ok: false, error: message }, { status: 403 });
  }

  try {
    let response: unknown;

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
        if (!canTriggerDeliverables(actor)) {
          return deny("This role cannot approve payments.");
        }
        response = { ok: true, payment: approveAdvancePayment(body.clientId, body.proposalId, body.amountInr, actor) };
        break;
      case "advance-proof-verify":
        if (!canTriggerDeliverables(actor)) {
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
        if (!canTriggerDeliverables(actor)) {
          return deny("This role cannot approve payments.");
        }
        response = { ok: true, payment: approveBalancePayment(body.clientId, body.caseId, body.amountInr, actor) };
        break;
      case "balance-proof-verify":
        if (!canTriggerDeliverables(actor)) {
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
        response = { ok: true, report: generatePreviewReport(body.caseId) };
        break;
      case "final-report-prepare":
        if (!canEditFloorWorkspaces(actor)) {
          return deny("This role cannot prepare final reports.");
        }
        response = { ok: true, report: prepareFinalReport(body.caseId, actor) };
        break;
      case "report-approve":
        if (!canApproveReport(actor)) {
          return deny("This role cannot approve reports.");
        }
        response = { ok: true, report: approveReport(body.reportId, actor) };
        break;
      case "verdict-release":
        if (!canReleaseVerdict(actor)) {
          return deny("This role cannot release verdicts.");
        }
        response = { ok: true, report: releaseVerdict(body.reportId, actor) };
        break;
      case "shakti-rank":
        response = { ok: true, ranking: rankShaktiValues(body.values ?? []), snapshot: body.caseId ? recordShaktiSnapshot(body.caseId, body.values ?? []) : null };
        break;
      case "utility-evaluate":
        response = {
          ok: true,
          snapshot: createEvaluationSnapshot(body.caseId, body.snapshotName, body.zoneCodes ?? [])
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

    await persistStateToDatabase();
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
