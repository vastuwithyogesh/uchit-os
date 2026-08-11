import { NextResponse } from "next/server";
import { AuthenticationError, authErrorResponse, isInitialOrganisationOwnerEmail, resolveRequestActor } from "@/lib/auth";
import { FoundationAccessError, publishFoundationPolicies, resolveActiveOrganisationContext } from "@/lib/foundation.server";
import { loadStateSnapshotFromPersistence } from "@/lib/persistence";

const allowedFields = new Set(["action", "workflowPolicy", "approvalPolicy", "reason", "idempotencyKey", "expectedOrganisationVersion", "expectedRevision"]);

export async function POST(request: Request) {
  try {
    const actor = await resolveRequestActor(request.headers);
    const context = await resolveActiveOrganisationContext(actor, isInitialOrganisationOwnerEmail(actor.email));
    const body = await request.json().catch(() => ({}));
    if (Object.keys(body).some((key) => !allowedFields.has(key))) return NextResponse.json({ ok: false, error: "The policy request contains unsupported fields." }, { status: 400 });
    if (body.action !== "foundation-policy-update") return NextResponse.json({ ok: false, error: "Unknown foundation policy action." }, { status: 400 });
    if (!("expectedOrganisationVersion" in body) || !("expectedRevision" in body)) return NextResponse.json({ ok: false, error: "Organisation and state versions are required." }, { status: 428 });
    const snapshot = await loadStateSnapshotFromPersistence();
    if (body.expectedRevision !== snapshot.revision) return NextResponse.json({ ok: false, error: "The saved state changed. Reload before publishing policy." }, { status: 409 });
    const result = await publishFoundationPolicies({ context, actor, workflowPolicy: body.workflowPolicy,
      approvalPolicy: body.approvalPolicy, reason: String(body.reason ?? ""), idempotencyKey: String(body.idempotencyKey ?? ""),
      requestId: request.headers.get("x-request-id") || crypto.randomUUID(), expectedOrganisationVersion: Number(body.expectedOrganisationVersion) });
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationError) return authErrorResponse(error);
    if (error instanceof FoundationAccessError) return NextResponse.json({ ok: false, error: error.message }, { status: error.statusCode, headers: { "Cache-Control": "private, no-store" } });
    return NextResponse.json({ ok: false, error: "Policy publication failed safely." }, { status: 500, headers: { "Cache-Control": "private, no-store" } });
  }
}
