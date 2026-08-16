import test from "node:test";
import assert from "node:assert/strict";
import { source } from "./helpers/source-contracts.mjs";

test("Founder operational pages resolve the canonical active organisation", () => {
  const access = source("lib/page-access.tsx");
  const step = source("app/founder/[step]/page.tsx");
  const continuePage = source("app/founder/continue/page.tsx");
  assert.match(access, /export async function requireFounderPageAccess/);
  assert.match(access, /resolveActiveOrganisationContext\(/);
  assert.match(access, /actor: \{ \.\.\.actor, organisationId: context\.organisation\.id \}/);
  assert.match(step, /requireFounderPageAccess\("SETTER"\)/);
  assert.match(continuePage, /requireFounderPageAccess\("SETTER"\)/);
  assert.doesNotMatch(step, /requirePageAccess\("SETTER"\)/);
  assert.doesNotMatch(continuePage, /requirePageAccess\("SETTER"\)/);
});

test("Founder query security remains case/floor paired and uses floorWorkspaces", () => {
  const step = source("app/founder/[step]/page.tsx");
  assert.match(step, /state\.vastuCases\.find/);
  assert.match(step, /canAccessFounderCase\(state, access\.actor, candidate\)/);
  assert.match(step, /state\.floorWorkspaces\.find/);
  assert.match(step, /floor\.caseId !== candidate\.id/);
  assert.match(step, /FLOOR_CASE_MISMATCH/);
  assert.match(step, /CASE_NOT_ACCESSIBLE/);
});

test("general page access remains separate from Founder tenant-scoped access", () => {
  const access = source("lib/page-access.tsx");
  const general = access.slice(access.indexOf("export async function requirePageAccess"), access.indexOf("/**\n * Founder commercial"));
  assert.doesNotMatch(general, /resolveActiveOrganisationContext/);
  assert.match(general, /resolveRequestActor/);
});
