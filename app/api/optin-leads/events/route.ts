import { NextResponse } from "next/server";
import { getRuntimeEnv } from "../../../../lib/runtime-env.ts";
import { ingestInboundOptinEvent, InboundEventError, parseInboundOptinEvent, readBoundedRequestBody, verifyInboundSignature } from "../../../../lib/inbound-optin-events.server.ts";

export async function POST(request: Request) {
  const env = getRuntimeEnv();
  if (!env.DB || !env.OPTIN_WEBHOOK_SECRET) return NextResponse.json({ ok: false, error: "Inbound integration is not configured." }, { status: 503 });
  try {
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new InboundEventError(400, "Content-Type must be application/json.");
    const rawBody = await readBoundedRequestBody(request);
    if (!rawBody.length) throw new InboundEventError(400, "Request body is required.");
    const now = Date.now();
    await verifyInboundSignature(rawBody, request.headers.get("x-uchit-timestamp"), request.headers.get("x-uchit-signature"), env.OPTIN_WEBHOOK_SECRET, now);
    let decoded: unknown;
    try { decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBody)); } catch { throw new InboundEventError(400, "Request body must be valid UTF-8 JSON."); }
    const event = parseInboundOptinEvent(decoded, now);
    const result = await ingestInboundOptinEvent(env.DB, event, rawBody, new Date(now).toISOString());
    return NextResponse.json({ ok: true, eventId: event.eventId, ...result }, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    if (error instanceof InboundEventError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    return NextResponse.json({ ok: false, error: "Inbound event could not be stored." }, { status: 503 });
  }
}
