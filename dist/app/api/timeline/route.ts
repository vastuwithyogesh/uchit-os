import { NextResponse } from "next/server";
import { loadStateFromPersistence } from "@/lib/persistence";
import { buildPermanentTimeline } from "@/lib/workflows";

export async function GET() {
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
