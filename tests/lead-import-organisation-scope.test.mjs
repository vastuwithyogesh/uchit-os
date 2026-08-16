import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Founder lead import derives its organisation from the active Founder context in local mode", async () => {
  const route = await read("app/api/optin-leads/route.ts");
  assert.equal((route.match(/resolveActiveOrganisationContext\(access\.actor, isInitialOrganisationOwnerEmail\(access\.actor\.email\) \|\| localDemo\)/g) ?? []).length, 2);
  assert.match(route, /const organisationId = context\?\.organisation\.id/);
  assert.doesNotMatch(route, /context = localDemo \? null/);
});
