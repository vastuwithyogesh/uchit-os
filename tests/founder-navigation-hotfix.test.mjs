import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file) => readFileSync(resolve(process.cwd(), file), "utf8");

test("Founder navigation hotfix exposes a persistent command-center shell", () => {
  const page = read("app/page.tsx");
  const header = read("components/site-header.tsx");
  assert.match(page, /Founder Command Center/);
  assert.doesNotMatch(page, /SiteHeader[^\n]+minimal/);
  for (const href of ["/crm", "/clients-cases", "/founder/continue", "/reports"]) assert.match(header, new RegExp(href.replace("/", "\\/")));
});

test("empty production-shaped state has no fabricated case and a canonical start action", () => {
  const scorecard = read("lib/founder-scorecard.ts");
  const home = read("components/founder-flow.tsx");
  assert.match(scorecard, /availableCaseCount/);
  assert.match(home, /No active cases yet/);
  assert.match(home, /Start New Client/);
  assert.match(home, /href="\/crm"/);
  assert.match(home, /No case or floor has been fabricated/);
});

test("workflow pages retain case context, locked-step explanations, and safe navigation", () => {
  const flow = read("components/founder-flow.tsx");
  const step = read("app/founder/[step]/page.tsx");
  const continuePage = read("app/founder/continue/page.tsx");
  assert.match(flow, /founder-flow-stepper/);
  assert.match(flow, /Locked ·/);
  assert.match(flow, /founder-flow-save-guidance/);
  assert.match(flow, /Continue current work/);
  assert.doesNotMatch(step, /SiteHeader[^\n]+minimal/);
  assert.doesNotMatch(continuePage, /SiteHeader[^\n]+minimal/);
  assert.match(step, /canAccessFounderCase/);
  assert.match(step, /FLOOR_CASE_MISMATCH/);
});
