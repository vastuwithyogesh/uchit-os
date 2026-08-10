import test from "node:test";
import assert from "node:assert/strict";
import { parseInboundOptinEvent, verifyInboundSignature } from "../lib/inbound-optin-events.server.ts";
import { source } from "./helpers/source-contracts.mjs";

const encoder = new TextEncoder();
const now = Date.parse("2026-08-10T06:30:00.000Z");
const valid = {
  schemaVersion: "uchit-optin/v1",
  eventId: "123e4567-e89b-42d3-a456-426614174000",
  occurredAt: "2026-08-10T06:29:00.000Z",
  source: "Website form",
  contact: { fullName: "Example Person", email: "person@example.test" },
  consent: { contact: true, version: "uchit-intake/v1" }
};

async function signature(secret, timestamp, raw) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const prefix = encoder.encode(`${timestamp}.`);
  const signed = new Uint8Array(prefix.length + raw.length);
  signed.set(prefix); signed.set(raw, prefix.length);
  const digest = await crypto.subtle.sign("HMAC", key, signed);
  return `sha256=${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

test("signature covers exact raw bytes and enforces timestamp replay window", async () => {
  const raw = encoder.encode(JSON.stringify(valid));
  const timestamp = String(Math.floor(now / 1000));
  const signed = await signature("secret", timestamp, raw);
  await verifyInboundSignature(raw, timestamp, signed, "secret", now);
  await assert.rejects(() => verifyInboundSignature(encoder.encode(`${JSON.stringify(valid)} `), timestamp, signed, "secret", now), /Invalid signature/);
  await assert.rejects(() => verifyInboundSignature(raw, String(Math.floor(now / 1000) - 301), signed, "secret", now), /outside the allowed window/);
});

test("payload is exact, consent-bound, and has no DOB or arbitrary export path", () => {
  assert.equal(parseInboundOptinEvent(valid, now).contact.email, "person@example.test");
  for (const mutation of [
    { ...valid, dateOfBirth: "1990-01-01" },
    { ...valid, consent: { contact: false, version: "uchit-intake/v1" } },
    { ...valid, contact: { ...valid.contact, signature: "data:image/png;base64,private" } }
  ]) assert.throws(() => parseInboundOptinEvent(mutation, now));
  try { parseInboundOptinEvent({ ...valid, "person@example.test": "private" }, now); assert.fail("unknown field accepted"); }
  catch (error) { assert.doesNotMatch(String(error.message), /person@example\.test/); }
});

test("route fails closed and event audit stores hashes plus a fixed source classification", () => {
  const route = source("app/api/optin-leads/events/route.ts");
  const service = source("lib/inbound-optin-events.server.ts");
  assert.match(route, /!env\.DB \|\| !env\.OPTIN_WEBHOOK_SECRET/);
  assert.match(route, /readBoundedRequestBody\(request\)/);
  assert.match(route, /verifyInboundSignature\(rawBody/);
  assert.doesNotMatch(route, /send|fetch\(|whatsapp|email/i);
  assert.match(service, /event_id.*payload_hash.*identity_hash/s);
  assert.match(service, /"SIGNED_WEBHOOK"/);
  assert.doesNotMatch(service.match(/INSERT INTO inbound_optin_events[\s\S]*?\n\s*\]/)?.[0] ?? "", /event\.contact|event\.message/);
});
