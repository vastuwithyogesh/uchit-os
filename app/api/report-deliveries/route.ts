import { NextResponse } from "next/server";
import { AuthenticationError, authErrorResponse, isExplicitLocalDemo, isInitialOrganisationOwnerEmail, resolveRequestActor } from "@/lib/auth";
import { deliveryHealth, listDocumentDeliveryEvents, projectVastuRemedyDeliveryReadiness } from "@/lib/document-delivery";
import { hasOrganisationCapability } from "@/lib/foundation";
import { FoundationAccessError, resolveActiveOrganisationContext } from "@/lib/foundation.server";
import { inspectProtectedPdfForDelivery, type ProtectedPdfDeliveryDescriptor } from "@/lib/final-pdf.server";
import { loadStateSnapshotFromPersistence } from "@/lib/persistence";

export async function GET(request: Request) {
  try {
    const actor = await resolveRequestActor(request.headers);
    const foundation = await resolveActiveOrganisationContext(actor, isInitialOrganisationOwnerEmail(actor.email) || isExplicitLocalDemo(request.headers));
    if (!foundation || !hasOrganisationCapability(foundation.membership, "DELIVERY")) {
      return NextResponse.json({ ok: false, error: "The active organisation membership does not permit final report delivery." }, { status: 403 });
    }
    const { state, revision } = await loadStateSnapshotFromPersistence(); const organisationId = foundation.organisation.id;
    const reports = state.reportVersions.filter((item) => item.organisationId === organisationId && !item.isPreview
      && item.artifact?.templateVersion === "uchit-verdict/v5" && item.artifact.immutable);
    const rows = await Promise.all(reports.map(async (report) => {
      let protectedPdf: ProtectedPdfDeliveryDescriptor | undefined; let protectedPdfError: string | undefined;
      try { protectedPdf = await inspectProtectedPdfForDelivery({ state, organisationId, reportId: report.id }); }
      catch (error) { protectedPdfError = error instanceof Error ? error.message : "Protected PDF unavailable."; }
      const delivery = [...state.documentDeliveries].reverse().find((item) => item.organisationId === organisationId && item.reportId === report.id);
      const caseRecord = state.vastuCases.find((item) => item.id === report.caseId);
      const client = caseRecord && state.clients.find((item) => item.id === caseRecord.clientId);
      const project = caseRecord?.projectId ? state.projects.find((item) => item.id === caseRecord.projectId) : undefined;
      const floor = report.floorId ? state.floorWorkspaces.find((item) => item.id === report.floorId) : undefined;
      return {
        report: { id: report.id, versionLabel: report.versionLabel, status: report.status, recordVersion: report.recordVersion ?? 0,
          canonicalHash: report.artifact!.contentHash, templateSnapshotHash: report.artifact!.documentTemplateSnapshot?.snapshotHash ?? null },
        context: { caseNumber: caseRecord?.caseNumber ?? "Unknown case", clientName: client?.displayName ?? "Unknown client",
          clientEmail: client?.email ?? "", projectName: project?.propertyName ?? "Unknown project", floorLabel: floor?.floorLabel ?? "Unknown floor" },
        protectedPdf: protectedPdf ?? null, protectedPdfError: protectedPdfError ?? null,
        readiness: projectVastuRemedyDeliveryReadiness({ state, organisationId, reportId: report.id, protectedPdf }),
        delivery: delivery ?? null, events: delivery ? listDocumentDeliveryEvents(state, delivery.id) : [],
        health: delivery ? deliveryHealth(state, delivery, protectedPdf) : { healthy: true, issues: [] }
      };
    }));
    return NextResponse.json({ ok: true, revision, rows }, { headers: { "Cache-Control": "private, no-store", Vary: "oai-authenticated-user-id, oai-authenticated-user-email" } });
  } catch (error) {
    if (error instanceof AuthenticationError) return authErrorResponse(error);
    if (error instanceof FoundationAccessError) return NextResponse.json({ ok: false, error: error.message }, { status: error.statusCode });
    throw error;
  }
}
