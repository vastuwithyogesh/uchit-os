import test from "node:test";
import assert from "node:assert/strict";
import { source } from "./helpers/source-contracts.mjs";

test("the main navigation has one clear destination and an accessible More menu", () => {
  const header = source("components/site-header.tsx");
  assert.match(header, /item\.href === "\/client"/);
  assert.match(header, /item\.href === "\/workspace"/);
  assert.match(header, /<details className="nav-more">/);
  assert.match(header, /<summary aria-label="Open navigation menu">/);
  assert.match(header, /nav-more-label">Menu/);
  assert.match(header, /aria-current=/);
});

test("framework links disable speculative RSC prefetching", () => {
  for (const file of [
    "components/site-header.tsx",
    "components/case-workspace.tsx",
    "components/access-denied-panel.tsx"
  ]) {
    assert.doesNotMatch(source(file), /<Link\b(?![^>]*\bprefetch=\{false\})/);
  }
});

test("the mobile menu stays above browser controls and remains scrollable", () => {
  const css = source("app/globals.css");
  assert.match(css, /inset:\s*12px 12px max\(12px, env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /z-index:\s*1000/);
  assert.match(css, /overflow-y:\s*auto/);
  assert.match(css, /overscroll-behavior:\s*contain/);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*?\.topbar\s*\{[\s\S]*?backdrop-filter:\s*none/);
  assert.match(css, /\.nav-more\[open\] > summary\s*\{[\s\S]*?position:\s*fixed[\s\S]*?z-index:\s*1001/);
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*?\.nav-more-menu\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
});

test("navigation labels use plain language", () => {
  const policy = source("lib/access-policy.ts");
  for (const label of ["My Case", "Workspace", "Clients", "History", "Case Setup", "Files & Drawings", "Report Charts", "Payments", "System Check"]) {
    assert.match(policy, new RegExp(`label: "${label}"`));
  }
  assert.doesNotMatch(policy, /label: "(?:CRM workbench|Ops|Proofs|Diagnostics|Integrity|State|Bootstrap)"/);
});

test("shared controls meet the minimum touch target and expose visible focus", () => {
  const css = source("app/globals.css");
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /:focus-visible/);
});
