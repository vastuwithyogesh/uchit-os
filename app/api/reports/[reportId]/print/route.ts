import { resolveRequestActor } from "@/lib/auth";
import { canReadClientSnapshots } from "@/lib/permissions";
import { loadStateFromPersistence } from "@/lib/persistence";
import { artifactStillMatches } from "@/lib/report-artifacts";
import { renderPrintableReport } from "@/lib/report-html";

export async function GET(request: Request, context: { params: Promise<{ reportId: string }> }) {
  const actor = await resolveRequestActor(request.headers);
  if (!canReadClientSnapshots(actor)) return new Response("Not allowed", { status: 403 });
  const { reportId } = await context.params;
  const state = await loadStateFromPersistence();
  const report = state.reportVersions.find((item) => item.id === reportId);
  if (!report) return new Response("Report not found", { status: 404 });
  if (!report.artifact) return new Response("This legacy report has no printable immutable artifact", { status: 409 });
  if (!await artifactStillMatches(state, report)) return new Response("Artifact integrity check failed", { status: 409 });
  return new Response(renderPrintableReport(state, report), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; base-uri 'none'; frame-ancestors 'none'",
      "x-content-type-options": "nosniff",
      "content-disposition": `inline; filename="${report.isPreview ? "preview" : "verdict"}-${report.id}.html"`
    }
  });
}
