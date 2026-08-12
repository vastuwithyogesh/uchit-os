import test from "node:test";
import assert from "node:assert/strict";
import {
  createFounderZoomServerToServerConnector,
  FOUNDER_ZOOM_HOST_EMAIL,
  FOUNDER_ZOOM_REQUIRED_SCOPES,
  FOUNDER_ZOOM_SMOKE_ACTIVATION,
  FounderZoomConfigurationError,
  getFounderZoomReadiness
} from "../lib/founder-zoom.server.ts";

const readyEnv = {
  ZOOM_ACCOUNT_ID: "synthetic-account-id",
  ZOOM_CLIENT_ID: "synthetic-client-id",
  ZOOM_CLIENT_SECRET: "synthetic-client-secret-that-is-long-enough",
  ZOOM_HOST_EMAIL: FOUNDER_ZOOM_HOST_EMAIL,
  ZOOM_INTEGRATION_ACTIVATION: FOUNDER_ZOOM_SMOKE_ACTIVATION
};

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

test("Zoom readiness is dormant by default and projects presence/length booleans only", () => {
  const dormant = getFounderZoomReadiness({});
  assert.equal(dormant.status, "DORMANT");
  assert.equal(dormant.liveActivationEnabled, false);
  const ready = getFounderZoomReadiness(readyEnv);
  assert.equal(ready.status, "READY_FOR_BOUNDED_SYNTHETIC_SMOKE");
  assert.deepEqual(ready.requiredScopes, FOUNDER_ZOOM_REQUIRED_SCOPES);
  const projection = JSON.stringify(ready);
  assert.equal(projection.includes(readyEnv.ZOOM_ACCOUNT_ID), false);
  assert.equal(projection.includes(readyEnv.ZOOM_CLIENT_ID), false);
  assert.equal(projection.includes(readyEnv.ZOOM_CLIENT_SECRET), false);
});

test("bounded synthetic connector validates the exact host, creates once per key and retires replacements", async () => {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  let meetingNumber = 0;
  const fetcher = async (url: string, init: RequestInit = {}) => {
    calls.push({ url, method: init.method ?? "GET", ...(typeof init.body === "string" ? { body: init.body } : {}) });
    if (url.startsWith("https://zoom.us/oauth/token")) return jsonResponse({ access_token: "synthetic-access-token", scope: FOUNDER_ZOOM_REQUIRED_SCOPES.join(" ") });
    if (url.includes("/v2/users/") && !url.endsWith("/meetings")) return jsonResponse({ email: FOUNDER_ZOOM_HOST_EMAIL, status: "active" });
    if (url.endsWith("/meetings") && init.method === "POST") {
      meetingNumber += 1;
      return jsonResponse({ id: `synthetic-meeting-${meetingNumber}`, join_url: `https://private.invalid/join/${meetingNumber}`, start_url: `https://private.invalid/start/${meetingNumber}`, password: "private" });
    }
    if (url.includes("/v2/meetings/") && init.method === "DELETE") return new Response(null, { status: 204 });
    return jsonResponse({}, 404);
  };
  const protectedInputs: string[] = [];
  const connector = createFounderZoomServerToServerConnector({
    env: readyEnv,
    fetcher,
    protectPrivateMetadata: async (metadata) => { protectedInputs.push(JSON.stringify(metadata)); return `ciphertext-${protectedInputs.length}`; }
  });
  const firstInput = { bookingId: "synthetic-booking-1", startsAt: "2026-08-20T10:00:00.000Z", durationMinutes: 30 as const, hostUserEmail: FOUNDER_ZOOM_HOST_EMAIL, idempotencyKey: "zoom-smoke-create-1" };
  const first = await connector.createUniqueMeeting(firstInput);
  const replay = await connector.createUniqueMeeting(firstInput);
  assert.deepEqual(replay, first);
  assert.equal(meetingNumber, 1);
  assert.equal(first.privateJoinMetadataCiphertext, "ciphertext-1");
  assert.equal(JSON.stringify(first).includes("private.invalid"), false);
  await connector.retireMeeting?.(first.providerMeetingId);
  const replacement = await connector.createUniqueMeeting({ ...firstInput, bookingId: "synthetic-booking-2", startsAt: "2026-08-22T10:00:00.000Z", idempotencyKey: "zoom-smoke-create-2" });
  assert.notEqual(replacement.providerMeetingId, first.providerMeetingId);
  assert.equal(meetingNumber, 2);
  await connector.retireMeeting?.(replacement.providerMeetingId);
  assert.equal(calls.filter((call) => call.method === "POST" && call.url.endsWith("/meetings")).length, 2);
  assert.equal(calls.filter((call) => call.method === "DELETE").length, 2);
  assert.equal(calls.every((call) => !call.url.includes(readyEnv.ZOOM_CLIENT_SECRET) && !call.body?.includes(readyEnv.ZOOM_CLIENT_SECRET)), true);
  assert.equal(calls.filter((call) => call.url.includes(`/users/${encodeURIComponent(FOUNDER_ZOOM_HOST_EMAIL)}`)).length >= 3, true);
  assert.match(calls.find((call) => call.method === "POST" && call.url.endsWith("/meetings"))?.body ?? "", /"duration":30/);
});

test("wrong host, missing activation and missing OAuth scope fail closed", async () => {
  assert.throws(() => createFounderZoomServerToServerConnector({ env: { ...readyEnv, ZOOM_HOST_EMAIL: "other@example.test" }, fetcher: async () => jsonResponse({}), protectPrivateMetadata: async () => "cipher" }), FounderZoomConfigurationError);
  assert.throws(() => createFounderZoomServerToServerConnector({ env: { ...readyEnv, ZOOM_INTEGRATION_ACTIVATION: undefined }, fetcher: async () => jsonResponse({}), protectPrivateMetadata: async () => "cipher" }), FounderZoomConfigurationError);
  const connector = createFounderZoomServerToServerConnector({
    env: readyEnv,
    fetcher: async () => jsonResponse({ access_token: "synthetic", scope: "meeting:write:admin" }),
    protectPrivateMetadata: async () => "cipher"
  });
  await assert.rejects(() => connector.createUniqueMeeting({ bookingId: "booking", startsAt: "2026-08-20T10:00:00Z", durationMinutes: 30, hostUserEmail: FOUNDER_ZOOM_HOST_EMAIL, idempotencyKey: "scope-check" }), FounderZoomConfigurationError);
  await assert.rejects(() => connector.createUniqueMeeting({ bookingId: "booking", startsAt: "2026-08-20T10:00:00Z", durationMinutes: 30, hostUserEmail: "other@example.test" as never, idempotencyKey: "host-check" }), FounderZoomConfigurationError);
});
