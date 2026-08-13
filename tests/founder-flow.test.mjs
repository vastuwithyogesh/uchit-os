import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file) => readFileSync(resolve(process.cwd(), file), "utf8");

test("Founder home remains compact and Continue opens the exact current module", () => {
  const page = read("app/page.tsx");
  const home = read("components/founder-flow.tsx");
  assert.match(page, /FounderFlowHome/);
  assert.match(home, /founder-flow-home/);
  assert.match(home, /current\.flowPath/);
  assert.match(home, /Continue/);
  assert.doesNotMatch(page, /<FounderScorecard|operations spine|CaseMasterConsole/);
});

test("all seventeen Founder modules have dedicated server-derived paths", () => {
  const scorecard = read("lib/founder-scorecard.ts");
  const flow = read("lib/founder-flow.ts");
  const route = read("app/founder/[step]/page.tsx");
  for (const number of Array.from({ length: 17 }, (_, index) => index + 1)) assert.match(scorecard, new RegExp(`number: ${number},`), `step ${number}`);
  for (const id of ["case-project", "floor-setup", "intake", "direction", "layout", "gridding", "manual-sheet", "evaluation", "stage-a", "site", "post-site", "balance", "remedial", "report-assembly", "founder-approval", "protected-pdf", "delivery"]) assert.match(flow, new RegExp(`(?:(?:\"${id}\")|(?:${id}\\s*:))`), id);
  assert.match(flow, /contextQuery/);
  assert.match(route, /searchParams/);
  assert.match(route, /caseId/);
  assert.match(route, /floorId/);
});

test("continue preserves exact case and floor context for the server-derived next step", () => {
  const continuePage = read("app/founder/continue/page.tsx");
  assert.match(continuePage, /searchParams/);
  assert.match(continuePage, /context\.caseId/);
  assert.match(continuePage, /context\.floorId/);
});

test("FE-SITE order is Stage A presentation then Site and Post-Site then balance", () => {
  const scorecard = read("lib/founder-scorecard.ts");
  const stageA = scorecard.indexOf('id: "stage-a"');
  const site = scorecard.indexOf('id: "site"');
  const postSite = scorecard.indexOf('id: "post-site"');
  const balance = scorecard.indexOf('id: "balance"');
  assert.ok(stageA > -1 && stageA < site && site < postSite && postSite < balance);
  assert.match(scorecard, /Stage A must be generated, verified and presented first/);
  assert.match(scorecard, /blocked: !stageAReady/);
  assert.match(scorecard, /Post-Site Findings must be approved first/);
});

test("future gates stay closed while previous steps and exact recovery remain accessible", () => {
  const helper = read("lib/founder-flow.ts");
  const component = read("components/founder-flow.tsx");
  assert.match(helper, /number <= current\.number/);
  assert.match(component, /Previous steps/);
  assert.match(component, /Go to required step/);
  assert.match(component, /FounderStepWorkspace/);
  assert.doesNotMatch(component, /next\/link|<Link\b|prefetch=/);
});

test("every Founder page keeps a visible context-preserving Next action with recovery copy", () => {
  const component = read("components/founder-flow.tsx");
  assert.match(component, /Next step/);
  assert.match(component, /founder-flow-next-reason/);
  assert.match(component, /next\.flowPath/);
  assert.match(component, /Delivery remains disabled/);
  assert.match(component, /Complete the current action above to unlock the next step/);
});

test("active module renders its real editing surface without the legacy ops console", () => {
  const workspace = read("components/founder-step-workspace.tsx");
  const flow = read("components/founder-flow.tsx");
  for (const component of ["FounderCaseSetupStep", "ClientIntakeForm", "SpatialWorkspace", "FilesDrawingsConsole", "EvaluationConsole", "FounderReportStep", "SiteAnalysisConsole", "PaymentProofConsole"]) assert.match(workspace, new RegExp(component));
  assert.match(workspace, /\.\.\.common/);
  assert.doesNotMatch(`${workspace}\n${flow}`, /href="\/ops"|CaseMasterConsole|WorkflowConsole/);
  assert.match(flow, /founder-flow-details/);
});

test("Stage B and delivery remain explicitly blocked", () => {
  const helper = read("lib/founder-scorecard.ts");
  assert.match(helper, /BLOCKED — METHOD INPUT REQUIRED/);
  assert.match(helper, /Client delivery is intentionally disabled/);
  assert.match(helper, /status: "BLOCKED"/);
});

test("sequential flow preserves mobile, focus and reduced-motion contracts", () => {
  const css = read("app/globals.css");
  assert.match(css, /\.founder-flow-home/);
  assert.match(css, /\.founder-flow-page/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /:where\(a, button, input, textarea, select, summary\):focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /overflow-x:\s*hidden/);
});
