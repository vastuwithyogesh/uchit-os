import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file) => readFileSync(resolve(process.cwd(), file), "utf8");

test("Founder home is compact and Continue opens a dedicated module route", () => {
  const page = read("app/page.tsx");
  const home = read("components/founder-flow.tsx");
  assert.match(page, /FounderFlowHome/);
  assert.doesNotMatch(page, /<FounderScorecard/);
  assert.match(home, /founder-flow-home/);
  assert.match(home, /founder-flow-continue/);
  assert.match(home, /current\.flowPath/);
  assert.doesNotMatch(home, /founder-scorecard-modules/);
});

test("all twelve Founder modules have dedicated sequential paths and required inputs", () => {
  const helper = read("lib/founder-flow.ts");
  const route = read("app/founder/[step]/page.tsx");
  for (const id of ["client-commercial", "case-project", "floor-setup", "plans-evidence", "gridding", "evaluation", "site", "verdict", "balance", "report", "delivery", "remedial"]) {
    assert.match(helper, new RegExp(`(?:"${id}"|${id}\\s*:)`), id);
  }
  assert.match(helper, /\/founder\/\$\{module\.number/);
  assert.match(helper, /canOpenFounderFlowStep/);
  assert.match(helper, /getPreviousFounderFlowStep/);
  assert.match(helper, /getNextFounderFlowStep/);
  assert.match(route, /FounderFlowPage/);
  assert.match(route, /params/);
});

test("future gates stay closed while previous steps remain accessible", () => {
  const helper = read("lib/founder-flow.ts");
  const component = read("components/founder-flow.tsx");
  assert.match(helper, /number <= current\.number/);
  assert.match(component, /Previous steps/);
  assert.match(component, /getPreviousFounderFlowStep/);
  assert.match(component, /Go to required step/);
  assert.match(component, /Complete step/);
  assert.doesNotMatch(component, /next\/link|<Link\b|prefetch=/);
});

test("focused module pages expose one primary action and progressive technical details", () => {
  const component = read("components/founder-flow.tsx");
  assert.match(component, /founder-flow-primary/);
  assert.match(component, /founder-flow-details/);
  assert.match(component, /<details/);
  assert.match(component, /founder-flow-action-bar/);
  assert.match(component, /founder-flow-success/);
  assert.match(component, /founder-flow-status/);
});

test("Stage B and client delivery remain explicitly deferred", () => {
  const helper = read("lib/founder-scorecard.ts");
  const component = read("components/founder-flow.tsx");
  assert.match(helper, /BLOCKED[^\n]*METHOD INPUT REQUIRED/);
  assert.match(helper, /clientDelivery=DEFERRED/);
  assert.match(component, /Stage B remains reserved/);
  assert.match(component, /Future gated steps stay closed/);
});

test("sequential flow preserves mobile, focus and reduced-motion contracts", () => {
  const css = read("app/globals.css");
  assert.match(css, /\.founder-flow-home(?:,|\s*\{)/);
  assert.match(css, /\.founder-flow-page(?:\s*\{)/);
  assert.match(css, /\.founder-flow-progress/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /:where\(a, button, input, textarea, select, summary\):focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /overflow-x:\s*hidden/);
});
