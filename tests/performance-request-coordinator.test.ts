import assert from "node:assert/strict";
import test from "node:test";
import { createClientReadCoordinator } from "../lib/client-read-coordinator.ts";

test("concurrent bootstrap reads share one network request", async () => {
  let calls = 0;
  const coordinator = createClientReadCoordinator(async () => {
    calls += 1;
    await Promise.resolve();
    return new Response(JSON.stringify({ ok: true, calls }), { status: 200, headers: { "content-type": "application/json" } });
  }, () => 100);

  const [first, second] = await Promise.all([
    coordinator.fetch("http://localhost/api/bootstrap"),
    coordinator.fetch("http://localhost/api/bootstrap")
  ]);

  assert.equal(calls, 1);
  assert.deepEqual(await first.json(), { ok: true, calls: 1 });
  assert.deepEqual(await second.json(), { ok: true, calls: 1 });
});

test("successful mutations invalidate short-lived cached reads", async () => {
  let calls = 0;
  const coordinator = createClientReadCoordinator(async (input) => {
    calls += 1;
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.pathname === "/api/actions") return new Response(JSON.stringify({ ok: true }), { status: 200 });
    return new Response(JSON.stringify({ calls }), { status: 200 });
  }, () => 100);

  await coordinator.fetch("http://localhost/api/bootstrap");
  await coordinator.fetch("http://localhost/api/bootstrap");
  assert.equal(calls, 1);
  await coordinator.fetch("http://localhost/api/actions", { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
  await coordinator.fetch("http://localhost/api/bootstrap");
  assert.equal(calls, 3);
});

test("different request headers do not share organisation or role-scoped reads", async () => {
  let calls = 0;
  const coordinator = createClientReadCoordinator(async () => {
    calls += 1;
    return new Response(JSON.stringify({ calls }), { status: 200 });
  }, () => 100);

  await coordinator.fetch("http://localhost/api/founder/cases", { headers: { "x-uchit-demo-role": "SUPER_ADMIN" } });
  await coordinator.fetch("http://localhost/api/founder/cases", { headers: { "x-uchit-demo-role": "CONSULTANT" } });
  assert.equal(calls, 2);
});

test("session and branding reads share single-flight while logout invalidates session state", async () => {
  let calls = 0;
  const coordinator = createClientReadCoordinator(async (input) => {
    calls += 1;
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.pathname === "/api/logout") return new Response("{}", { status: 200 });
    return new Response(JSON.stringify({ path: url.pathname, calls }), { status: 200 });
  }, () => 100);

  const [sessionA, sessionB] = await Promise.all([
    coordinator.fetch("http://localhost/api/session"),
    coordinator.fetch("http://localhost/api/session")
  ]);
  assert.equal(calls, 1);
  assert.deepEqual(await sessionA.json(), await sessionB.json());

  await Promise.all([
    coordinator.fetch("http://localhost/api/branding"),
    coordinator.fetch("http://localhost/api/branding")
  ]);
  assert.equal(calls, 2);
  await coordinator.fetch("http://localhost/api/logout", { method: "POST" });
  await coordinator.fetch("http://localhost/api/session");
  assert.equal(calls, 4);
});
