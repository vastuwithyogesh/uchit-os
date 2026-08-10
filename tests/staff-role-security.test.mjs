import test from "node:test";
import assert from "node:assert/strict";
import { functionBody, source } from "./helpers/source-contracts.mjs";

const auth = source("lib/auth.ts");
const route = source("app/api/staff-roles/route.ts");
const migration = source("db/migrations.ts");
const admin = source("components/admin-console.tsx");

test("production roles resolve only from durable assignments or the initial owner", () => {
  const resolver = functionBody(auth, "resolveRequestActor");
  assert.match(resolver, /getRoleForAuthenticatedEmail\(authenticatedEmail\)/);
  assert.match(resolver, /initialOwnerEmails\.has\(authenticatedEmail\)/);
  assert.doesNotMatch(resolver, /matchedUser|users\.find/);
  assert.match(functionBody(auth, "getRoleForAuthenticatedEmail"), /return null/);
  assert.doesNotMatch(functionBody(auth, "getRoleForAuthenticatedEmail"), /users\.find/);
});

test("listing roles never populates demo staff in production", () => {
  const list = functionBody(auth, "listStaffRoleAssignments");
  assert.match(list, /if \(!db\) return \[\]/);
  assert.doesNotMatch(list, /seeded|users\s*\./);
  assert.match(migration, /DELETE FROM staff_role_assignments/);
  for (const email of ["aarav@uchitvastu.in", "nandini@uchitvastu.in", "rishi@uchitvastu.in", "meera@uchitvastu.in"]) {
    assert.match(migration, new RegExp(email.replace(".", "\\.")));
  }
});

test("staff role writes are owner-only, validated, private, and exclude Super-Admin", () => {
  assert.match(functionBody(route, "GET"), /requireRouteActor\(request, "ADMIN"\)/);
  assert.match(functionBody(route, "POST"), /requireRouteActor\(request, "SUPER_ADMIN"\)/);
  assert.match(functionBody(route, "DELETE"), /requireRouteActor\(request, "SUPER_ADMIN"\)/);
  assert.match(route, /assignableStaffRoles = \["SETTER", "CONSULTANT", "ADMIN"\]/);
  assert.match(functionBody(route, "POST"), /Unknown staff assignment field/);
  assert.match(functionBody(route, "DELETE"), /Unknown staff revocation field/);
  assert.match(route, /private, no-store/);
});

test("role changes and revocations create immutable actor audit records", () => {
  const upsert = functionBody(auth, "upsertStaffRoleAssignment");
  const revoke = functionBody(auth, "revokeStaffRoleAssignment");
  assert.match(upsert, /staff_role_assignment_audit/);
  assert.match(upsert, /actor\.id, actor\.email, actor\.fullName, actor\.role/);
  assert.match(upsert, /Additional Super-Admin access must be configured/);
  assert.match(upsert, /initial owner cannot be demoted/i);
  assert.match(revoke, /DELETE FROM staff_role_assignments/);
  assert.match(revoke, /'CLIENT'/);
  assert.match(revoke, /initial owner cannot be revoked/i);
});

test("admin UI confirms access changes, supports revocation, and shows the audit", () => {
  assert.match(admin, /window\.confirm\(`Give/);
  assert.match(admin, /window\.confirm\(`Remove staff access/);
  assert.match(admin, /Recent role changes/);
  assert.match(admin, /Permanent production access audit/);
  assert.match(admin, /\["SETTER", "CONSULTANT", "ADMIN"\]/);
  assert.doesNotMatch(admin.match(/<select value=\{staffDraft\.role\}[\s\S]*?<\/select>/)?.[0] ?? "", /SUPER_ADMIN/);
});
