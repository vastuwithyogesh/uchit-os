import { AuthenticationError, authErrorResponse, resolveRequestActor } from "@/lib/auth";
import { ClientAccountUnlinkedError, ClientPortalAccessError, findOwnedClient } from "@/lib/client-portal";
import { appendDocumentDeliveryAccess } from "@/lib/document-delivery";
import { FinalPdfError, readDeliveredProtectedPdf } from "@/lib/final-pdf.server";
import { loadStateSnapshotFromPersistence, persistStateToDatabase, PersistenceConflictError } from "@/lib/persistence";

export async function GET(request: Request, context: { params: Promise<{ reportId: string }> }) {
  try {
    const actor = await resolveRequestActor(request.headers);
    const { state, revision } = await loadStateSnapshotFromPersistence();
    const client = findOwnedClient(actor, state.clients);
    const { reportId } = await context.params;
    const url = new URL(request.url); const deliveryId = url.searchParams.get("deliveryId") ?? "";
    const mode = url.searchParams.get("mode") === "view" ? "view" : "download";
    const delivery = state.documentDeliveries.find((item) => item.id === deliveryId && item.reportId === reportId
      && item.recipientClientId === client.id && item.organisationId === client.organisationId
      && (item.status === "DELIVERED" || item.status === "ACKNOWLEDGED"));
    if (!delivery) return new Response("Delivered report not found", { status: 404, headers: { "cache-control": "private, no-store" } });

    const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
    const exact = await readDeliveredProtectedPdf({ state, delivery, actor, mode, requestId });
    appendDocumentDeliveryAccess({ state, delivery, actor, eventType: mode === "view" ? "VIEWED" : "DOWNLOADED", requestId });
    await persistStateToDatabase(state, revision ?? undefined);

    return new Response(exact.bytes, { headers: {
      "content-type": "application/pdf", "cache-control": "private, no-store", "x-content-type-options": "nosniff",
      "content-disposition": `${mode === "view" ? "inline" : "attachment"}; filename="${exact.fileName}"`,
      "x-uchit-delivery-id": delivery.id, "x-uchit-artifact-sha256": delivery.protectedPdfChecksumSha256
    } });
  } catch (error) {
    if (error instanceof AuthenticationError) return authErrorResponse(error);
    if (error instanceof ClientPortalAccessError) return new Response(error.message, { status: 403, headers: { "cache-control": "private, no-store" } });
    if (error instanceof ClientAccountUnlinkedError) return new Response(error.message, { status: 404, headers: { "cache-control": "private, no-store" } });
    if (error instanceof PersistenceConflictError) return new Response("Access history changed. Retry the secure download.", { status: 409, headers: { "cache-control": "private, no-store" } });
    if (error instanceof FinalPdfError) return new Response(error.message, { status: error.statusCode, headers: { "cache-control": "private, no-store" } });
    throw error;
  }
}
