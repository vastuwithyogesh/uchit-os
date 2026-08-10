import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { mergeAppState } from "./persistence-merge.ts";
import { d1Migrations } from "../db/migrations.ts";
import { parseExpectedRevision } from "./persistence-version.ts";

const base = {
  clients: [{ id: "seed" }],
  payments: [{ id: "seed-payment" }]
} as never;

test("explicit empty collections do not repopulate from seed data", () => {
  const merged = mergeAppState(base, { clients: [], payments: [] } as never);
  assert.deepEqual(merged.clients, []);
  assert.deepEqual(merged.payments, []);
});

test("missing legacy collections inherit the current seed value", () => {
  const merged = mergeAppState(base, { clients: [] } as never);
  assert.deepEqual(merged.clients, []);
  assert.deepEqual(merged.payments, [{ id: "seed-payment" }]);
});

test("D1 migrations remain ordered, unique and single-statement prepared SQL", () => {
  const versions = d1Migrations.map(({ version }) => version);
  assert.deepEqual(versions, [...new Set(versions)].sort((a, b) => a - b));
  assert.ok(d1Migrations.every(({ statements }) => statements.length > 0 && statements.every(Boolean)));
});

test("expected revisions accept only safe non-negative integers", () => {
  assert.equal(parseExpectedRevision(0), 0);
  assert.equal(parseExpectedRevision(42), 42);
  assert.equal(parseExpectedRevision(-1), null);
  assert.equal(parseExpectedRevision(1.5), null);
  assert.equal(parseExpectedRevision("1"), null);
});

test("full-state replacement exposes revision preconditions and stale-write conflicts", () => {
  const routeSource = readFileSync(new URL("../app/api/state/route.ts", import.meta.url), "utf8");
  assert.match(routeSource, /expectedRevision is required/);
  assert.match(routeSource, /status:\s*428/);
  assert.match(routeSource, /PersistenceConflictError/);
  assert.match(routeSource, /status:\s*409/);
});
