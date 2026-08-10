import test from "node:test";
import assert from "node:assert/strict";
import { source } from "./helpers/source-contracts.mjs";

test("diagnostics makes a staff-only pilot decision without exposing identities", () => {
  const route = source("app/api/diagnostics/route.ts");
  assert.match(route, /scope: "STAFF_INTERNAL_PILOT"/);
  assert.match(route, /key: "staff-roles"/);
  assert.match(route, /item\.role === "ADMIN" \|\| item\.role === "SUPER_ADMIN"/);
  assert.match(route, /item\.role === "CONSULTANT"/);
  assert.match(route, /key: "integrity"/);
  assert.match(route, /inspectIntegrity\(state\)\.ok/);
  assert.doesNotMatch(route, /email|fullName|counts:/);
});

test("staff sign-off covers the critical internal journey and defers client access", () => {
  const ui = source("components/diagnostics-console.tsx");
  for (const text of ["internal team only", "protected files", "evaluation and action plan", "two approvals", "phone and tablet", "production state backup", "save the final report as PDF"]) assert.match(ui, new RegExp(text, "i"));
  assert.match(ui, /Client access and client-facing delivery are intentionally outside this pilot/);
  assert.doesNotMatch(ui, /client portal test|client sign-in test/i);
});

test("production backup packaging is explicit, read-only and revision-bound", () => {
  const backup = source("scripts/state-backup.mjs");
  assert.match(backup, /acknowledge-production-read-only/);
  assert.match(backup, /never connects to live services/i);
  assert.match(backup, /Requested revision does not match the authenticated export envelope/);
  assert.doesNotMatch(backup, /fetch\(|persistState|R2\.put/);
});
