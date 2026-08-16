import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file) => readFileSync(resolve(process.cwd(), file), "utf8");

test("Founder home opens a command center before the sequential flow", () => {
  const page = read("app/page.tsx");
  const home = read("components/founder-flow.tsx");
  assert.match(page, /FounderFlowHome/);
  assert.match(page, /buildFounderScorecard/);
  assert.match(page, /Founder Command Center/);
  assert.match(page, /searchParams/);
  assert.match(home, /No active cases yet/);
  assert.match(home, /Start New Client/);
  assert.match(home, /Continue current work/);
  assert.doesNotMatch(page, /<FounderScorecard|founder-scorecard-modules/);
});

test("scorecard projection exposes the canonical seventeen-step workflow", () => {
  const helper = read("lib/founder-scorecard.ts");
  for (const title of [
    "Case and project creation", "Floor setup", "Intake complete", "Direction verification", "Layout preparation",
    "Gridding and 32D/16D evidence", "Manual utility mapping", "Utility and Shakti evaluation",
    "Stage A verdict and presentation", "Site Analysis", "Post-Site Findings and Layout Review", "Full balance clearance",
    "Stage B · Disha Balancer", "Report assembly", "Founder review and approval", "Protected PDF", "Delivery history"
  ]) assert.match(helper, new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), title);
  assert.match(helper, /selectedFloorId/);
  assert.match(helper, /caseId/);
});

test("floor-ready writes the exact state consumed by the Founder scorecard", () => {
  const service = read("lib/workflow-service.ts");
  assert.match(service, /workspace\.locked\s*=\s*true/);
  assert.match(service, /workspace\.status\s*=\s*"LOCKED"/);
});

test("scorecard preserves regeneration, methodology, floor and controlled delivery gates", () => {
  const helper = read("lib/founder-scorecard.ts");
  assert.match(helper, /NEEDS_REGENERATION/);
  assert.match(helper, /openRegenerations/);
  assert.match(helper, /evaluationRegeneration/);
  assert.match(helper, /BLOCKED — METHOD INPUT REQUIRED/);
  assert.match(helper, /Prepare and record controlled client access/);
  assert.match(helper, /documentDeliveries/);
  assert.doesNotMatch(helper, /Client delivery is intentionally disabled/);
  assert.match(helper, /one immutable report for this floor/i);
  assert.match(helper, /contextPath/);
});

test("Step 06 includes the confirmed entrance-zone gate and Step 08 shares engine readiness", () => {
  const scorecard = read("lib/founder-scorecard.ts");
  assert.match(scorecard, /facts\.propertyMainGateZone \|\| facts\.floorGateZone/);
  assert.match(scorecard, /getCaseEvaluationBlockers/);
  assert.match(scorecard, /evaluationBlockers\.length/);
  assert.match(scorecard, /Complete evaluation readiness/);
});

test("case cards resolve Continue from the exact case and floor projection", () => {
  const component = read("components/client-case-pipeline.tsx");
  assert.match(component, /state\.vastuCases\.filter\(\(caseRecord\) => canAccessFounderCase\(state, actor, caseRecord\)\)/);
  assert.match(component, /buildFounderScorecard\(state, \{ role: actorRole \}, card\.client\?\.id, card\.caseRecord\.id, floor\.id\)/);
  assert.match(component, /getCurrentFounderFlowStep/);
  assert.match(component, /Continue case/);
  assert.match(component, /Partial floor completion never closes this project/);
});

test("reference-parity shell and workflow stay mobile and accessible", () => {
  const css = read("app/globals.css");
  assert.match(css, /\.app-sidebar/);
  assert.match(css, /\.mobile-appbar/);
  assert.match(css, /\.lead-profile-drawer/);
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /prefers-reduced-motion/);
});
