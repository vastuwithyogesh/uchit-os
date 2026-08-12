import test from "node:test";
import assert from "node:assert/strict";
import { source } from "./helpers/source-contracts.mjs";

test("the main navigation has one clear destination and an accessible More menu", () => {
  const header = source("components/site-header.tsx");
  assert.match(header, /primaryHrefs/);
  assert.match(header, /activeUser\.role === "CLIENT"/);
  assert.match(header, /<details className="sidebar-more">/);
  assert.match(header, /<summary>More<\/summary>/);
  assert.match(header, /<summary aria-label="Open navigation">Menu<\/summary>/);
  assert.match(header, /aria-current=/);
});

test("shared navigation uses reliable native links", () => {
  for (const file of [
    "components/site-header.tsx",
    "components/case-workspace.tsx",
    "components/access-denied-panel.tsx"
  ]) {
    const content = source(file);
    assert.doesNotMatch(content, /next\/link|<Link\b|prefetch=/);
    assert.match(content, /<a\b[^>]*href=/);
  }
});

test("workspace primary actions use direct href navigation", () => {
  const workspace = source("components/case-workspace.tsx");
  assert.match(workspace, /<a className=\{index === 0 \? "button" : "button-secondary"\} href=\{link\.href\}/);
  assert.match(workspace, /Do this: \$\{item\.nextAction\}/);
});

test("the mobile menu stays above browser controls and remains scrollable", () => {
  const css = source("app/globals.css");
  assert.match(css, /\.mobile-appbar[\s\S]*z-index:\s*90/);
  assert.match(css, /\.mobile-nav-menu nav[\s\S]*inset:\s*62px 0 0 0/);
  assert.match(css, /overflow-y:\s*auto/);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*?\.app-sidebar\s*\{\s*display:\s*none/);
  assert.match(css, /\.mobile-nav-menu nav a[\s\S]*min-height:\s*48px/);
});

test("navigation labels use plain language", () => {
  const policy = source("lib/access-policy.ts");
  for (const label of ["My Case", "Workspace", "Overview", "Leads", "Lead Pipeline", "Clients & Cases", "Evaluation", "History", "Legacy technical console", "Files & Drawings", "Report Charts", "Payments", "System Check"]) {
    assert.match(policy, new RegExp(`label: "${label}"`));
  }
  assert.doesNotMatch(policy, /label: "(?:CRM workbench|Ops|Proofs|Diagnostics|Integrity|State|Bootstrap)"/);
});

test("shared controls meet the minimum touch target and expose visible focus", () => {
  const css = source("app/globals.css");
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /:focus-visible/);
});
