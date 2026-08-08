import { NextResponse } from "next/server";
import { requireRouteActor } from "@/lib/auth";
import { loadStateFromPersistence } from "@/lib/persistence";
import { buildPermanentTimeline } from "@/lib/workflows";

export async function GET(request: Request) {
  const access = await requireRouteActor(request, "SETTER");
  if (!access.ok) {
    return access.response;
  }
  const state = await loadStateFromPersistence();
  const events = buildPermanentTimeline(state.timelineEvents);

  return NextResponse.json({
    events,
    countsByClient: state.clients.map((client) => ({
      clientId: client.id,
      clientName: client.displayName,
      totalEvents: events.filter((event) => event.clientId === client.id).length
    })),
    totalEvents: events.length
  });
}
