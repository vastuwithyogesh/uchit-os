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

test("Founder Continue never invents a Case or floor when context is absent", () => {
  const page = read("app/founder/continue/page.tsx");
  assert.match(page, /!scorecard\?\.caseRecord \|\| !scorecard\.selectedFloorId/);
  assert.match(page, /<FounderFlowHome scorecard=\{scorecard\}/);
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

test("V1 Continue skips non-authoritative Step 07 without creating a completion record", () => {
  const flow = read("lib/founder-flow.ts");
  const scorecard = read("lib/founder-scorecard.ts");
  assert.match(flow, /const progressionSteps = isV1 \? steps\.filter\(\(step\) => step\.id !== "manual-sheet"\) : steps/);
  assert.match(scorecard, /id: "manual-sheet"/);
  assert.match(scorecard, /legacy manual utility-sheet approval is not a V1 gate/);
  assert.doesNotMatch(flow, /manual-sheet.*status.*COMPLETE/);
});

test("Legacy Continue progression still includes the manual-sheet module", () => {
  const flow = read("lib/founder-flow.ts");
  assert.match(flow, /const progressionSteps = isV1 \? steps\.filter\(\(step\) => step\.id !== "manual-sheet"\) : steps/);
  assert.match(flow, /const isV1 = scorecard\.caseRecord\?\.evaluationArchitectureVersion === "V1"/);
});

test("V1 Step 07 remains directly reviewable but visibly optional", () => {
  const component = read("components/founder-flow.tsx");
  assert.match(component, /isOptionalV1ManualSheet = isV1 && step\.id === "manual-sheet"/);
  assert.match(component, /Optional V1 supporting evidence\. Continue skips this legacy-only surface/);
  assert.match(component, /isComplete \|\| isOptionalV1ManualSheet/);
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

test("required-input copy matches the approved complimentary and consent-free intake contracts", () => {
  const helper = read("lib/founder-flow.ts");
  assert.match(helper, /Confirmed advance or approved Internal Complimentary exception/);
  assert.doesNotMatch(helper, /Location and consent/);
});

test("Step 06 exposes the verified entrance recovery required by evaluation", () => {
  assert.match(read("lib/founder-flow.ts"), /At least one confirmed property or floor entrance zone/);
  const css = read("app/globals.css");
  assert.doesNotMatch(css, /spatial-focus-gridding[^\n]*nth-child\(6\)/);
  assert.doesNotMatch(css, /spatial-step-six article[^\n]*task-entrance-title[^\n]*display:\s*none/);
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

test("regeneration keeps its exact workspace visible without opening ordinary blocked steps", () => {
  const component = read("components/founder-flow.tsx");
  assert.match(component, /const isRegeneration = step\.status === "NEEDS_REGENERATION" && !isFuture/);
  assert.match(component, /Resolve regeneration/);
  assert.match(component, /!isBlocked \|\| isRegeneration/);
  assert.match(component, /step\.status === "BLOCKED" \|\| step\.status === "NEEDS_REGENERATION"/);
});

test("every Founder page keeps a visible context-preserving Next action with recovery copy", () => {
  const component = read("components/founder-flow.tsx");
  assert.match(component, /Next step/);
  assert.match(component, /founder-flow-next-reason/);
  assert.match(component, /next\.flowPath/);
  assert.match(component, /Delivery remains disabled/);
  assert.match(component, /const nextReason = .*step\.explanation/);
});

test("completed steps keep their real workspace available for review", () => {
  const component = read("components/founder-flow.tsx");
  assert.match(component, /!isBlocked \|\| isRegeneration \|\| step\.selfRemediableOnCurrentStep \? <div id="founder-step-workspace"/);
  assert.match(component, /Review current step/);
  assert.doesNotMatch(component, /!isBlocked && !isComplete \? <div id="founder-step-workspace"/);
});

test("Founder stage scroller clearly marks the route's current stage", () => {
  const component = read("components/founder-flow.tsx");
  const autoScroll = read("components/founder-progress-auto-scroll.tsx");
  const css = read("app/globals.css");
  assert.match(component, /data-current-stage=\{active \? "true" : undefined\}/);
  assert.match(component, /active \? "Current stage · " : ""/);
  assert.match(component, /aria-current=\{active \? "step" : undefined\}/);
  assert.match(css, /\.founder-flow-stepper-item\.active[\s\S]*background: var\(--accent-2\)/);
  assert.match(css, /\.founder-flow-stepper-item\.active > span[\s\S]*background: #fff/);
  assert.match(component, /FounderProgressAutoScroll/);
  assert.match(autoScroll, /data-current-stage="true"/);
  assert.match(autoScroll, /scrollIntoView\(\{ block: "nearest", inline: "center" \}\)/);
});

test("active module renders its real editing surface without the legacy ops console", () => {
  const workspace = read("components/founder-step-workspace.tsx");
  const flow = read("components/founder-flow.tsx");
  for (const component of ["FounderCaseSetupStep", "ClientIntakeForm", "SpatialWorkspace", "FilesDrawingsConsole", "EvaluationConsole", "FounderReportStep", "SiteAnalysisConsole", "PaymentProofConsole"]) assert.match(workspace, new RegExp(component));
  assert.match(workspace, /\.\.\.common/);
  assert.doesNotMatch(`${workspace}\n${flow}`, /href="\/ops"|CaseMasterConsole|WorkflowConsole/);
  assert.match(flow, /founder-flow-details/);
});

test("the local walkthrough never exposes Stage B mutation controls", () => {
  const workspace = read("components/founder-step-workspace.tsx");
  assert.match(workspace, /if \(walkthrough\) return <FounderWalkthroughWorkspace/);
  assert.doesNotMatch(workspace, /StageBRemedyWorkspaceVisualPreview/);
});

test("Stage B activates conditionally while report delivery uses the controlled domain", () => {
  const helper = read("lib/founder-scorecard.ts");
  assert.match(helper, /BLOCKED — METHOD INPUT REQUIRED/);
  assert.match(helper, /stageBComplete/);
  assert.match(helper, /stageBReady/);
  assert.match(helper, /Stage B · Disha Balancer/);
  assert.match(helper, /Prepare and record controlled client access/);
  assert.match(helper, /documentDeliveries/);
  assert.match(helper, /\/report-deliveries/);
  assert.doesNotMatch(helper, /Client delivery is intentionally disabled/);
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
