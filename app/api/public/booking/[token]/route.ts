import { NextResponse } from "next/server";
import { loadStateSnapshotFromPersistence, PersistenceConflictError, persistStateToDatabase } from "@/lib/persistence";
import { FounderEngagementError, resolveSecureGrant, respondToBooking } from "@/lib/founder-engagement";
import { setAppState } from "@/lib/store";

const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const snapshot = await loadStateSnapshotFromPersistence();
    const rollback = structuredClone(snapshot.state);
    const openedAt = new Date();
    const grant = await resolveSecureGrant(snapshot.state, (await context.params).token, "BOOKING_RESPONSE", openedAt);
    const booking = snapshot.state.founderReviewBookings.find((item) => item.id === grant.bookingId && item.organisationId === grant.organisationId);
    if (!booking) throw new FounderEngagementError(404, "This booking response is unavailable.");
    let persistenceRevision = snapshot.revision;
    if (grant.openedAt === openedAt.toISOString()) {
      try {
        setAppState(snapshot.state); await persistStateToDatabase(snapshot.state, snapshot.revision ?? undefined);
        persistenceRevision = (await loadStateSnapshotFromPersistence()).revision;
      } catch (error) { setAppState(rollback); throw error; }
    }
    return NextResponse.json({ ok: true, booking: { renderedClientTime: booking.renderedClientTime, renderedIstTime: booking.renderedIstTime, durationMinutes: booking.durationMinutes, mode: "Zoom", status: booking.status, recordVersion: booking.recordVersion }, persistenceRevision, actions: ["CONFIRM_THIS_TIME", "REQUEST_ANOTHER_TIME"] }, { headers: privateHeaders });
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "This booking response is unavailable." }, { status: error instanceof PersistenceConflictError ? 409 : error instanceof FounderEngagementError ? error.statusCode : 404, headers: privateHeaders }); }
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const body = await request.json().catch(() => ({}));
  try {
    if (!["CONFIRM_THIS_TIME", "REQUEST_ANOTHER_TIME"].includes(body.action)) return NextResponse.json({ ok: false, error: "Choose one permitted booking response." }, { status: 400, headers: privateHeaders });
    const snapshot = await loadStateSnapshotFromPersistence();
    if (snapshot.revision !== body.expectedRevision) return NextResponse.json({ ok: false, error: "The booking changed. Reload before responding." }, { status: 409, headers: privateHeaders });
    const rollback = structuredClone(snapshot.state);
    try {
      const grant = await resolveSecureGrant(snapshot.state, (await context.params).token, "BOOKING_RESPONSE");
      const booking = respondToBooking({ state: snapshot.state, bookingId: grant.bookingId!, action: body.action });
      setAppState(snapshot.state); await persistStateToDatabase(snapshot.state, snapshot.revision ?? undefined);
      return NextResponse.json({ ok: true, status: booking.status }, { headers: privateHeaders });
    } catch (error) { setAppState(rollback); throw error; }
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "The booking response could not be saved." }, { status: error instanceof FounderEngagementError ? error.statusCode : 400, headers: privateHeaders }); }
}
