import test from "node:test";
import assert from "node:assert/strict";
import { getOptInIntegrationReadiness, ingestInboundOptinEvent, parseInboundOptinEvent, readBoundedRequestBody, verifyInboundSignature } from "../lib/inbound-optin-events.server.ts";
import { source } from "./helpers/source-contracts.mjs";

const now = Date.parse("2026-08-10T10:00:00.000Z");
const base = { schemaVersion: "uchit-optin/v1", eventId: "11111111-1111-4111-8111-111111111111", occurredAt: "2026-08-10T09:59:00.000Z", source: "Website form", contact: { fullName: "A Valid Person", email: "person@example.test", phone: "+919876543210" }, consent: { contact: true, version: "uchit-intake/v1" }, attribution: { utmSource: "search", utmCampaign: "summer" }, message: "Please contact me" };
const bytes = (value) => new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value));
async function signature(secret, timestamp, body) { const key = await crypto.subtle.importKey("raw", bytes(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); const signed = new Uint8Array(bytes(`${timestamp}.`).length + body.length); signed.set(bytes(`${timestamp}.`)); signed.set(body, bytes(`${timestamp}.`).length); return `sha256=${[...new Uint8Array(await crypto.subtle.sign("HMAC", key, signed))].map(x=>x.toString(16).padStart(2,"0")).join("")}`; }

test("strict v1 schema accepts canonical contact and rejects unsafe or unknown data", () => {
  assert.equal(parseInboundOptinEvent(base, now).contact.phone, "+919876543210");
  for (const invalid of [{ ...base, attackerSuppliedPrivateKey: "secret" }, { ...base, contact: { ...base.contact, phone: "09876543210" } }, { ...base, contact: { ...base.contact, email: "bad" } }, { ...base, message: "https://tracking.example/private" }, { ...base, source: "<b>site</b>" }, { ...base, consent: { ...base.consent, contact: false } }, { ...base, occurredAt: "2026-08-10T10:06:00.000Z" }]) {
    try { parseInboundOptinEvent(invalid, now); assert.fail("expected rejection"); } catch (error) { assert.doesNotMatch(error.message, /attackerSuppliedPrivateKey|secret/); }
  }
});

test("raw-body HMAC is exact and timestamp bounded", async () => {
  const raw = bytes(base); const timestamp = String(now / 1000); const secret = "test-only-secret-not-production"; const signed = await signature(secret, timestamp, raw);
  await verifyInboundSignature(raw, timestamp, signed, secret, now);
  await assert.rejects(() => verifyInboundSignature(bytes({ ...base, source: "changed" }), timestamp, signed, secret, now), /signature/i);
  await assert.rejects(() => verifyInboundSignature(raw, String(now / 1000 - 301), "sha256=" + "0".repeat(64), secret, now), /window/i);
});

test("bounded reader rejects oversized input before parsing", async () => {
  const request = new Request("https://internal.test", { method: "POST", body: "x".repeat(9), headers: { "content-length": "9" } });
  await assert.rejects(() => readBoundedRequestBody(request, 8), (error) => error.status === 413);
});

class FakeStatement { constructor(db,sql){this.db=db;this.sql=sql;this.values=[];} bind(...values){this.values=values;return this;} async run(){if(/INSERT OR IGNORE INTO schema_migrations/i.test(this.sql))this.db.versions.add(Number(this.values[0]));return{meta:{changes:1}};} async all(){if(/SELECT version FROM schema_migrations/i.test(this.sql))return{results:[...this.db.versions].map(version=>({version})),meta:{}};if(/PRAGMA table_info/i.test(this.sql))return{results:[{name:"revision"}],meta:{}};return{results:[],meta:{}};} async first(){if(/WHERE event_id/i.test(this.sql))return this.db.events.get(this.values[0])??null;if(/WHERE identity_key/i.test(this.sql)){const lead=this.db.leads.get(this.values[0]);return lead?{payload:JSON.stringify(lead)}:null;}if(/COUNT\(\*\)/i.test(this.sql))return{count:this.db.events.size};if(/ORDER BY received_at/i.test(this.sql))return[...this.db.events.values()].at(-1)??null;return null;} }
class FakeD1 { versions=new Set();events=new Map();leads=new Map();prepare(sql){return new FakeStatement(this,sql);}async batch(statements){for(const statement of statements){if(/INSERT INTO optin_leads/i.test(statement.sql)){const [,identityKey,,payload]=statement.values;this.leads.set(identityKey,JSON.parse(payload));}else if(/INSERT INTO inbound_optin_events/i.test(statement.sql)){const [eventId,,,payload_hash,,received_at,outcome,submission_count]=statement.values;this.events.set(eventId,{payload_hash,outcome,submission_count,received_at});}else await statement.run();}return statements.map(()=>({meta:{changes:1}}));} }

test("first event initializes empty D1, dedupes identity, and replay has no side effects", async () => {
  const db=new FakeD1();const raw=bytes(base);const parsed=parseInboundOptinEvent(base,now);
  assert.deepEqual(await ingestInboundOptinEvent(db,parsed,raw,"2026-08-10T10:00:00.000Z"),{outcome:"CREATED",submissionCount:1,replayed:false});
  assert.deepEqual(await ingestInboundOptinEvent(db,parsed,raw,"2026-08-10T10:01:00.000Z"),{outcome:"CREATED",submissionCount:1,replayed:true});assert.equal(db.leads.size,1);assert.equal(db.events.size,1);
  const second={...base,eventId:"22222222-2222-4222-8222-222222222222"};await ingestInboundOptinEvent(db,parseInboundOptinEvent(second,now),bytes(second),"2026-08-10T10:02:00.000Z");assert.equal(db.leads.size,1);assert.equal([...db.leads.values()][0].submissionCount,2);
  await assert.rejects(()=>ingestInboundOptinEvent(db,parsed,bytes({...base,source:"Other"}),"2026-08-10T10:03:00.000Z"),error=>error.status===409);
});

test("a concurrent identical winner is returned as replay without partial local lead mutation", async () => {
  class ConcurrentD1 extends FakeD1 { async batch(statements) { const ledger=statements.find(statement=>/INSERT INTO inbound_optin_events/i.test(statement.sql)); if (ledger) { const [eventId,,,payload_hash,,received_at,outcome,submission_count]=ledger.values; this.events.set(eventId,{payload_hash,outcome,submission_count,received_at}); throw new Error("unique event race"); } return super.batch(statements); } }
  const db=new ConcurrentD1();const raw=bytes(base);const result=await ingestInboundOptinEvent(db,parseInboundOptinEvent(base,now),raw,"2026-08-10T10:00:00.000Z");
  assert.deepEqual(result,{outcome:"CREATED",submissionCount:1,replayed:true});
  assert.equal(db.leads.size,0);
  assert.equal(db.events.size,1);
});

test("readiness and audit contracts reveal no secret, PII, source value, or hashes", async () => {
  assert.deepEqual(await getOptInIntegrationReadiness(undefined,undefined),{enabled:false,configured:false,schemaVersion:"uchit-optin/v1",lastReceivedAt:null,lastOutcome:null,eventCount:0});
  const route=source("app/api/optin-leads/events/route.ts");assert.match(route,/OPTIN_WEBHOOK_SECRET.*verifyInboundSignature/s);assert.doesNotMatch(route,/requireRouteActor/);
  const helper=source("lib/inbound-optin-events.server.ts");assert.match(helper,/"SIGNED_WEBHOOK"/);assert.doesNotMatch(source("lib/store.ts"),/OPTIN_WEBHOOK_SECRET/);assert.doesNotMatch(source("lib/domain.ts"),/OPTIN_WEBHOOK_SECRET/);
  assert.doesNotMatch(source("app/api/optin-leads/route.ts"),/verifyInboundSignature|OPTIN_WEBHOOK_SECRET/);
});
