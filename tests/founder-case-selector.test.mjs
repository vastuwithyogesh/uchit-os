import test from "node:test";
import assert from "node:assert/strict";
import { source } from "./helpers/source-contracts.mjs";
import { canAccessFounderCase } from "../lib/founder-case-access.ts";

const caseRecord = { id: "case-1", organisationId: "org-1", clientId: "client-1", projectId: "project-1" };
const state = {
  clients: [{ id: "client-1", organisationId: "org-1", assignedSetterId: "setter-1" }],
  projects: [{ id: "project-1", organisationId: "org-1", assignedConsultantUserId: "consultant-1" }]
};

test("Founder case access is organisation and assignment scoped", () => {
  assert.equal(canAccessFounderCase(state, { id: "owner-1", role: "SUPER_ADMIN", organisationId: "org-1" }, caseRecord), true);
  assert.equal(canAccessFounderCase(state, { id: "admin-1", role: "ADMIN", organisationId: "org-1" }, caseRecord), true);
  assert.equal(canAccessFounderCase(state, { id: "consultant-1", role: "CONSULTANT", organisationId: "org-1" }, caseRecord), true);
  assert.equal(canAccessFounderCase(state, { id: "consultant-2", role: "CONSULTANT", organisationId: "org-1" }, caseRecord), false);
  assert.equal(canAccessFounderCase(state, { id: "setter-1", role: "SETTER", organisationId: "org-1" }, caseRecord), true);
  assert.equal(canAccessFounderCase(state, { id: "setter-2", role: "SETTER", organisationId: "org-1" }, caseRecord), false);
  assert.equal(canAccessFounderCase(state, { id: "owner-2", role: "SUPER_ADMIN", organisationId: "org-2" }, caseRecord), false);
});

test("case selector consumes a narrow server projection and exposes the approved views", () => {
  const ui = source("components/founder-case-selector.tsx");
  assert.match(ui, /fetch\("\/api\/founder\/cases"/);
  assert.doesNotMatch(ui, /fetch\("\/api\/bootstrap"/);
  for (const label of ["My cases", "All permitted", "Needs my action", "Recent"]) assert.match(ui, new RegExp(label));
  assert.match(ui, /propertyLocation/);
  assert.match(ui, /recentCaseIds/);
  assert.match(ui, /Try again/);
  assert.match(ui, /headers: buildActionHeaders\(activeUser\.role\)/);
});

test("disposable role switching is server-visible only on the guarded local demo", () => {
  const auth = source("lib/auth.ts");
  const session = source("components/session-provider.tsx");
  assert.match(auth, /isExplicitLocalDemo\(headers\)[\s\S]*uchit-vastu-demo-role/);
  assert.match(auth, /request\.headers\.get\("x-uchit-demo-role"\)/);
  assert.match(session, /document\.cookie = `uchit-vastu-demo-role=/);
  assert.match(auth, /process\.env\.NODE_ENV !== "production"/);
});

test("case selection and deep links both use the same server access rule", () => {
  const api = source("app/api/founder/cases/route.ts");
  const scorecard = source("lib/founder-scorecard.ts");
  assert.match(api, /resolveActiveOrganisationContext\(access\.actor/);
  assert.match(api, /organisationId: foundation\.organisation\.id/);
  assert.match(api, /canAccessFounderCase\(state, actor, item\)/);
  assert.match(scorecard, /canAccessFounderCase\(state, actor, candidateCase\)/);
});

test("selector keeps short and mobile viewports scrollable with 44px controls", () => {
  const css = source("app/globals.css");
  assert.match(css, /\.founder-case-selector-panel \{[^}]*max-height:[^}]*overflow-y: auto/);
  assert.match(css, /\.case-selector-views button \{ min-height: 44px; \}/);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*\.founder-case-selector-panel \{ position: fixed; inset: 0/);
});

test("selector closes with Escape and returns focus to its trigger", () => {
  const ui = source("components/founder-case-selector.tsx");
  assert.match(ui, /const triggerRef = useRef<HTMLButtonElement>\(null\)/);
  assert.match(ui, /event\.key === "Escape"/);
  assert.match(ui, /window\.requestAnimationFrame\(\(\) => triggerRef\.current\?\.focus\(\)\)/);
  assert.match(ui, /autoFocus/);
  assert.match(ui, /onClick=\{closeSelector\}>Close/);
  assert.doesNotMatch(ui, /event\.key === "Tab"/);
});
