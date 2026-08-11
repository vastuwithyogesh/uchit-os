import test from "node:test";
import assert from "node:assert/strict";
import { source } from "./helpers/source-contracts.mjs";

test("diagnostics makes a Founder-only pilot decision without exposing identities", () => {
  const route = source("app/api/diagnostics/route.ts");
  assert.match(route, /scope: "FOUNDER_INTERNAL_PILOT"/);
  assert.match(route, /access\.actor\.role === "SUPER_ADMIN"/);
  assert.match(route, /key: "pdf-owner-secret"/);
  assert.match(route, /PDF_OWNER_SECRET/);
  assert.doesNotMatch(route, /staff-roles|listStaffRoleAssignments|CONSULTANT/);
  assert.match(route, /key: "integrity"/);
  assert.match(route, /inspectIntegrity\(state\)\.ok/);
  assert.doesNotMatch(route, /email|fullName|counts:/);
});

test("Founder sign-off covers the critical internal journey and defers client access", () => {
  const ui = source("components/diagnostics-console.tsx");
  for (const text of ["Founder Edition staging", "protected files", "Stage A review", "Founder Approved", "phone and tablet", "production state backup", "save the final report as PDF"]) assert.match(ui, new RegExp(text, "i"));
  assert.match(ui, /Team roles and client-facing delivery remain deferred/);
  assert.doesNotMatch(ui, /two approvals|different authorized person/i);
  assert.doesNotMatch(ui, /client portal test|client sign-in test/i);
});

test("production backup packaging is explicit, read-only and revision-bound", () => {
  const backup = source("scripts/state-backup.mjs");
  assert.match(backup, /acknowledge-production-read-only/);
  assert.match(backup, /never connects to live services/i);
  assert.match(backup, /Requested revision does not match the authenticated export envelope/);
  assert.doesNotMatch(backup, /fetch\(|persistState|R2\.put/);
});
