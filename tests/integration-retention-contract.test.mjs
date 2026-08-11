import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const contract = await readFile(new URL("../docs/lovable-uchit-integration-contract.md", import.meta.url), "utf8");
const migrations = await readFile(new URL("../db/migrations.ts", import.meta.url), "utf8");

test("integration retention is permanent and legal-hold authority is explicit", () => {
  assert.match(contract, /retained permanently/i);
  assert.match(contract, /No automatic deletion/i);
  assert.match(contract, /Yogesh personally.*sole legal-hold authority/i);
  assert.match(contract, /Other `SUPER_ADMIN`-labelled accounts, Admins and staff must not/i);
  assert.match(contract, /source tombstone\/revocation event/i);
  assert.match(contract, /internal immutable audit\/hash records remain retained/i);
  assert.match(contract, /first approved backfill includes Lovable `lead_activities` and `lead_followups`/i);
  assert.match(contract, /canonical `client-pipeline-transition` API/);
  assert.match(contract, /not Uchit audit events/);
  assert.match(contract, /integration operations are Yogesh\/SUPER_ADMIN-only/i);
  assert.match(contract, /one server-side integration service identity/i);
  assert.match(contract, /never becomes an Uchit actor, owner or assignee/i);
  assert.match(contract, /no Admin, setter, consultant or staff integration controls/i);
  assert.match(contract, /Lovable sends only signed events to the Uchit service wrapper/i);
  assert.match(contract, /Uchit publishes only signed canonical projections back to Lovable/i);
  assert.match(contract, /Direct canonical API access is permitted only after both systems are co-hosted/i);
});

test("v9 schema has no destructive deletion or payload-storage path", () => {
  const v9 = migrations.slice(migrations.indexOf("version: 9"));
  assert.doesNotMatch(v9, /DELETE\s+FROM/i);
  assert.doesNotMatch(v9, /DROP\s+TABLE/i);
  assert.doesNotMatch(v9, /payload\s+TEXT\s+NOT\s+NULL/i);
});
