import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const auth = fs.readFileSync(new URL("../lib/auth.ts", import.meta.url), "utf8");
const commercial = fs.readFileSync(new URL("../lib/founder-commercial.ts", import.meta.url), "utf8");

test("explicit local Founder owner fixture uses the existing owner-shaped identity", () => {
  assert.match(auth, /localAuthRuntimeValue\("UCHIT_VASTU_LOCAL_FOUNDER_OWNER_FIXTURE"\) === "true"/);
  assert.match(auth, /id: "local-founder-owner"/);
  assert.match(auth, /email: "iyogesh2020@gmail\.com"/);
  assert.match(auth, /role: "SUPER_ADMIN"/);
  assert.match(auth, /organisationId: "org_local_founder"/);
  assert.match(auth, /organisationCapability: "organisation_owner"/);
});

test("ordinary demo, cross-organisation and non-owner actors remain protected", () => {
  assert.match(auth, /const role = requestedRole && roles\.includes\(requestedRole as UserRole\) \? \(requestedRole as UserRole\) : "SUPER_ADMIN"/);
  assert.match(commercial, /input\.actor\.id !== input\.founderUserId/);
  assert.match(commercial, /input\.actor\.organisationId !== input\.organisationId/);
  assert.match(commercial, /input\.actor\.organisationCapability !== "organisation_owner"/);
  assert.match(commercial, /input\.actor\.role !== "SUPER_ADMIN"/);
});

test("the fixture is explicitly local/demo-gated and does not alter hosted resolution", () => {
  const branch = auth.slice(auth.indexOf("export async function resolveRequestActor"), auth.indexOf("export async function listStaffRoleAssignments"));
  assert.match(branch, /if \(isExplicitLocalDemo\(headers\)\)/);
  assert.match(branch, /UCHIT_VASTU_LOCAL_FOUNDER_OWNER_FIXTURE/);
  assert.match(branch, /const \{ id: authenticatedUserId, email: authenticatedEmail \} = readAuthenticatedIdentity\(headers\)/);
});
