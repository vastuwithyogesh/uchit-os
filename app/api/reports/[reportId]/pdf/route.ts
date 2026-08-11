import { AuthenticationError, authErrorResponse, isInitialOrganisationOwnerEmail, resolveRequestActor } from "@/lib/auth";
import { FinalPdfError, generateFinalPdf, readFinalPdfStatus, readReleasedFinalPdf, releaseFinalPdf, verifyFinalPdf } from "@/lib/final-pdf.server";
import { FoundationAccessError, resolveActiveOrganisationContext } from "@/lib/foundation.server";
import { loadStateSnapshotFromPersistence } from "@/lib/persistence";

const privateHeaders = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };

async function context(request: Request) {
  let actor = await resolveRequestActor(request.headers);
  const foundation = await resolveActiveOrganisationContext(actor, isInitialOrganisationOwnerEmail(actor.email));
  if (foundation.membership.role === "SPECIALIST") throw new FinalPdfError(403, "Specialist access remains deferred until Team Edition.");
  actor = { ...actor, role: foundation.membership.role, organisationId: foundation.organisation.id,
    organisationCapability: foundation.membership.capability };
  return { actor, foundation };
}

function errorResponse(error: unknown) {
  if (error instanceof AuthenticationError) return authErrorResponse(error);
  const status = error instanceof FinalPdfError || error instanceof FoundationAccessError ? error.statusCode : 500;
  const message = error instanceof Error && status !== 500 ? error.message : "Protected PDF operation failed safely.";
  return Response.json({ ok: false, error: message }, { status, headers: privateHeaders });
}

export async function POST(request: Request, routeContext: { params: Promise<{ reportId: string }> }) {
  try {
    const { reportId } = await routeContext.params; const body = await request.json().catch(() => ({}));
    const allowed = new Set(["action", "expectedRecordVersion", "expectedRevision", "expectedArtifactVersion", "idempotencyKey"]);
    if (Object.keys(body).some((field) => !allowed.has(field))) return Response.json({ ok: false, error: "Unsupported protected PDF field." }, { status: 400, headers: privateHeaders });
    if (!["generate", "verify", "release"].includes(body.action)) return Response.json({ ok: false, error: "Choose generate, verify, or release." }, { status: 400, headers: privateHeaders });
    const { actor, foundation } = await context(request); const snapshot = await loadStateSnapshotFromPersistence();
    const shared = { state: snapshot.state, revision: snapshot.revision, context: foundation, actor, reportId,
      expectedRecordVersion: body.expectedRecordVersion, expectedRevision: body.expectedRevision,
      idempotencyKey: body.idempotencyKey, requestId: request.headers.get("x-request-id") || crypto.randomUUID() };
    const result = body.action === "generate" ? await generateFinalPdf(shared)
      : body.action === "verify" ? await verifyFinalPdf({ ...shared, expectedArtifactVersion: body.expectedArtifactVersion })
      : await releaseFinalPdf({ ...shared, expectedArtifactVersion: body.expectedArtifactVersion });
    return Response.json({ ok: true, result }, { headers: privateHeaders });
  } catch (error) { return errorResponse(error); }
}

export async function GET(request: Request, routeContext: { params: Promise<{ reportId: string }> }) {
  try {
    const mode = new URL(request.url).searchParams.get("mode");
    const { reportId } = await routeContext.params; const { actor, foundation } = await context(request);
    const snapshot = await loadStateSnapshotFromPersistence(); const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
    if (mode === "status") {
      const artifact = await readFinalPdfStatus({ state: snapshot.state, context: foundation, actor, reportId });
      return Response.json({ ok: true, artifact }, { headers: privateHeaders });
    }
    if (mode !== "export" && mode !== "print") return Response.json({ ok: false, error: "Choose mode=status, mode=export, or mode=print." }, { status: 400, headers: privateHeaders });
    const result = await readReleasedFinalPdf({ state: snapshot.state, context: foundation, actor, reportId, mode, requestId });
    return new Response(result.bytes, { headers: { ...privateHeaders, "content-type": "application/pdf",
      "content-disposition": `${mode === "print" ? "inline" : "attachment"}; filename="${result.fileName}"`,
      "content-length": String(result.bytes.length) } });
  } catch (error) { return errorResponse(error); }
}
