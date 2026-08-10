import { AuthenticationError, authErrorResponse, resolveRequestActor } from "@/lib/auth";
import { ClientAccountUnlinkedError, ClientPortalAccessError, findOwnedClient } from "@/lib/client-portal";
import { loadStateFromPersistence } from "@/lib/persistence";
import { artifactStillMatches } from "@/lib/report-artifacts";
import { renderPrintableReport } from "@/lib/report-html";

export async function GET(request: Request, context: { params: Promise<{ reportId: string }> }) {
  try {
    const actor = await resolveRequestActor(request.headers);
    const state = await loadStateFromPersistence();
    const client = findOwnedClient(actor, state.clients);
    const { reportId } = await context.params;
    const report = state.reportVersions.find((item) => item.id === reportId);
    const caseRecord = report ? state.vastuCases.find((item) => item.id === report.caseId) : null;

    if (!report || !caseRecord || caseRecord.clientId !== client.id) return new Response("Report not found", { status: 404 });
    if (!report.isPreview && report.status !== "RELEASED") return new Response("This final report has not been released yet", { status: 403 });
    if (!report.artifact) return new Response("This report is not ready to open", { status: 409 });
    if (!await artifactStillMatches(state, report)) return new Response("This report could not be verified. Please contact the Uchit Vastu team.", { status: 409 });

    return new Response(renderPrintableReport(state, report), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "private, no-store",
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; base-uri 'none'; frame-ancestors 'none'",
        "x-content-type-options": "nosniff",
        "content-disposition": `inline; filename="${report.isPreview ? "preview" : "verdict"}-${report.id}.html"`
      }
    });
  } catch (error) {
    if (error instanceof AuthenticationError) return authErrorResponse(error);
    if (error instanceof ClientPortalAccessError) return new Response(error.message, { status: 403, headers: { "cache-control": "private, no-store" } });
    if (error instanceof ClientAccountUnlinkedError) return new Response(error.message, { status: 404, headers: { "cache-control": "private, no-store" } });
    throw error;
  }
}
