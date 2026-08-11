import { NextResponse } from "next/server";
import { AuthenticationError, authErrorResponse, isInitialOrganisationOwnerEmail, resolveRequestActor } from "@/lib/auth";
import { FoundationAccessError, listUserAccessRequests, mutateUserAccessRequest, resolveActiveOrganisationContext } from "@/lib/foundation.server";
import { loadStateSnapshotFromPersistence } from "@/lib/persistence";

const actions = {
  "user-access-create": "CREATE", "user-access-submit": "SUBMIT", "user-access-approve": "APPROVE",
  "user-access-activate": "ACTIVATE", "user-access-reject": "REJECT", "user-access-cancel": "CANCEL",
  "user-access-revoke": "REVOKE"
} as const;
const shared = ["action", "accessRequestId", "reason", "idempotencyKey", "expectedOrganisationVersion", "expectedRecordVersion", "expectedRevision"];
const fields: Record<keyof typeof actions, readonly string[]> = {
  "user-access-create": [...shared, "targetUserId", "targetEmail", "proposedRole", "proposedCapabilities"],
  "user-access-submit": shared, "user-access-approve": [...shared, "finalRole", "finalCapabilities"],
  "user-access-activate": shared, "user-access-reject": shared, "user-access-cancel": shared, "user-access-revoke": shared
};

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

export async function GET(request: Request) {
  try {
    const actor = await resolveRequestActor(request.headers);
    const context = await resolveActiveOrganisationContext(actor, isInitialOrganisationOwnerEmail(actor.email));
    const limit = Number(new URL(request.url).searchParams.get("limit") ?? 50);
    return privateJson({ ok: true, requests: await listUserAccessRequests(context, actor, limit) });
  } catch (error) {
    if (error instanceof AuthenticationError) return authErrorResponse(error);
    if (error instanceof FoundationAccessError) return privateJson({ ok: false, error: error.message }, error.statusCode);
    return privateJson({ ok: false, error: "User-access requests could not be loaded safely." }, 500);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await resolveRequestActor(request.headers);
    const context = await resolveActiveOrganisationContext(actor, isInitialOrganisationOwnerEmail(actor.email));
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = body.action as keyof typeof actions;
    if (!actions[action]) return privateJson({ ok: false, error: "Unknown user-access action." }, 400);
    if (Object.keys(body).some((key) => !fields[action].includes(key))) return privateJson({ ok: false, error: "The user-access request contains unsupported fields." }, 400);
    if (!("expectedOrganisationVersion" in body) || !("expectedRevision" in body)
      || (action !== "user-access-create" && !("expectedRecordVersion" in body))) {
      return privateJson({ ok: false, error: "The latest organisation, request and state versions are required." }, 428);
    }
    const snapshot = await loadStateSnapshotFromPersistence();
    if (body.expectedRevision !== snapshot.revision) return privateJson({ ok: false, error: "The saved state changed. Reload before changing access." }, 409);
    const result = await mutateUserAccessRequest({ context, actor, action: actions[action],
      accessRequestId: typeof body.accessRequestId === "string" ? body.accessRequestId : undefined,
      targetUserId: body.targetUserId, targetEmail: body.targetEmail, proposedRole: body.proposedRole,
      proposedCapabilities: body.proposedCapabilities, finalRole: body.finalRole, finalCapabilities: body.finalCapabilities,
      reason: body.reason, idempotencyKey: body.idempotencyKey,
      requestId: request.headers.get("x-request-id") || crypto.randomUUID(),
      expectedOrganisationVersion: Number(body.expectedOrganisationVersion),
      expectedRecordVersion: body.expectedRecordVersion === undefined ? undefined : Number(body.expectedRecordVersion) });
    return privateJson({ ok: true, ...result });
  } catch (error) {
    if (error instanceof AuthenticationError) return authErrorResponse(error);
    if (error instanceof FoundationAccessError) return privateJson({ ok: false, error: error.message }, error.statusCode);
    return privateJson({ ok: false, error: "User-access governance failed safely." }, 500);
  }
}
