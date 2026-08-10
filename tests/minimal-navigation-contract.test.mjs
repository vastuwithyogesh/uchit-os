import test from "node:test";
import assert from "node:assert/strict";
import { source } from "./helpers/source-contracts.mjs";

test("the main navigation has one clear destination and an accessible More menu", () => {
  const header = source("components/site-header.tsx");
  assert.match(header, /item\.href === "\/client"/);
  assert.match(header, /item\.href === "\/workspace"/);
  assert.match(header, /<details className="nav-more">/);
  assert.match(header, /<summary aria-label="Open more pages">/);
  assert.match(header, /aria-current=/);
});

test("navigation labels use plain language", () => {
  const policy = source("lib/access-policy.ts");
  for (const label of ["My Case", "Workspace", "Clients", "History", "Case Setup", "Files", "Payments", "System Check"]) {
    assert.match(policy, new RegExp(`label: "${label}"`));
  }
  assert.doesNotMatch(policy, /label: "(?:CRM workbench|Ops|Proofs|Diagnostics|Integrity|State|Bootstrap)"/);
});

test("shared controls meet the minimum touch target and expose visible focus", () => {
  const css = source("app/globals.css");
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /:focus-visible/);
});
