import { NextResponse } from "next/server";
import { InboundEventError } from "../../../../../lib/inbound-optin-events.server.ts";
import { parseLovableIntegrationEvent, readBoundedRequestBody, verifyInboundSignature } from "../../../../../lib/lovable-integration-contract.ts";
import { assertLovableEnvironmentBinding, assertNoLiveActivation, readLovableWrapperConfig } from "../../../../../lib/lovable-wrapper.server.ts";

const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function POST(request: Request) {
  const config = readLovableWrapperConfig();
  if (!config.enabled || !config.activated || !config.secret || !config.environment || !config.sourceKey) {
    return NextResponse.json({ ok: false, error: "Lovable integration is not activated." }, { status: 503, headers });
  }
  try {
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new InboundEventError(400, "Content-Type must be application/json.");
    const rawBody = await readBoundedRequestBody(request, 64 * 1024);
    if (!rawBody.length) throw new InboundEventError(400, "Request body is required.");
    const now = Date.now();
    await verifyInboundSignature(rawBody, request.headers.get("x-uchit-timestamp"), request.headers.get("x-uchit-signature"), config.secret, now);
    let decoded: unknown;
    try { decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBody)); } catch { throw new InboundEventError(400, "Request body must be valid UTF-8 JSON."); }
    const event = parseLovableIntegrationEvent(decoded, now);
    assertLovableEnvironmentBinding(event, config, request.headers.get("x-uchit-source-key") ?? "");
    assertNoLiveActivation(config);
    return NextResponse.json({ ok: false, error: "Lovable integration is not activated." }, { status: 503, headers });
  } catch (error) {
    if (error instanceof InboundEventError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status, headers });
    return NextResponse.json({ ok: false, error: "Lovable integration is unavailable." }, { status: 503, headers });
  }
}
