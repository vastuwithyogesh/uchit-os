import { NextResponse } from "next/server";
import { loadStateSnapshotFromPersistence, PersistenceConflictError, persistStateToDatabase } from "@/lib/persistence";
import { resolveQualificationInvitation, saveQualificationResponse, FounderEngagementError } from "@/lib/founder-engagement";
import { setAppState } from "@/lib/store";

const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const snapshot = await loadStateSnapshotFromPersistence();
    const rollback = structuredClone(snapshot.state);
    const openedAt = new Date();
    const resolved = await resolveQualificationInvitation(snapshot.state, token, openedAt);
    const grant = snapshot.state.secureAccessGrants.find((item) => item.id === resolved.invitation.grantId);
    let persistenceRevision = snapshot.revision;
    if (grant?.openedAt === openedAt.toISOString()) {
      try {
        setAppState(snapshot.state);
        await persistStateToDatabase(snapshot.state, snapshot.revision ?? undefined);
        persistenceRevision = (await loadStateSnapshotFromPersistence()).revision;
      } catch (error) { setAppState(rollback); throw error; }
    }
    return NextResponse.json({
      ok: true,
      invitation: { id: resolved.invitation.id, expiresAt: resolved.invitation.expiresAt, status: resolved.invitation.status, selectedServices: resolved.invitation.selectedServices, recordVersion: resolved.invitation.recordVersion },
      definition: { id: resolved.definition.id, kind: resolved.definition.kind, version: resolved.definition.version, title: resolved.definition.title, definitionHash: resolved.definition.definitionHash, questions: resolved.definition.questions },
      draft: resolved.latestResponse?.status === "DRAFT" ? { answers: resolved.latestResponse.answers, selectedServices: resolved.latestResponse.selectedServices, recordVersion: resolved.latestResponse.recordVersion } : undefined,
      persistenceRevision
    }, { headers: privateHeaders });
  } catch (error) {
    const status = error instanceof PersistenceConflictError ? 409 : error instanceof FounderEngagementError ? error.statusCode : 404;
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "This secure form is unavailable." }, { status, headers: privateHeaders });
  }
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const body = await request.json().catch(() => ({}));
  try {
    if (typeof body.expectedRevision !== "number" && body.expectedRevision !== null) return NextResponse.json({ ok: false, error: "Reload the current form before saving." }, { status: 428, headers: privateHeaders });
    const { token } = await context.params;
    const snapshot = await loadStateSnapshotFromPersistence();
    if (snapshot.revision !== body.expectedRevision) return NextResponse.json({ ok: false, error: "The form changed. Reload without losing your draft." }, { status: 409, headers: privateHeaders });
    const rollback = structuredClone(snapshot.state);
    try {
      const resolved = await resolveQualificationInvitation(snapshot.state, token);
      const response = saveQualificationResponse({ state: snapshot.state, invitationId: resolved.invitation.id, answers: body.answers ?? {}, selectedServices: body.selectedServices ?? [], submit: body.action === "SUBMIT", expectedRecordVersion: Number(body.expectedRecordVersion) });
      setAppState(snapshot.state);
      await persistStateToDatabase(snapshot.state, snapshot.revision ?? undefined);
      return NextResponse.json({ ok: true, status: response.status, recordVersion: response.recordVersion }, { headers: privateHeaders });
    } catch (error) { setAppState(rollback); throw error; }
  } catch (error) {
    const status = error instanceof FounderEngagementError ? error.statusCode : 400;
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "The form could not be saved." }, { status, headers: privateHeaders });
  }
}
