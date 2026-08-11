import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file) => readFileSync(resolve(process.cwd(), file), "utf8");

test("Founder home is a scorecard, not a dense dashboard", () => {
  const page = read("app/page.tsx");
  assert.match(page, /FounderScorecard/);
  assert.match(page, /buildFounderScorecard/);
  assert.doesNotMatch(page, /Other work areas|Common tasks/);
});

test("scorecard exposes the canonical twelve modules and one next action", () => {
  const helper = read("lib/founder-scorecard.ts");
  const component = read("components/founder-scorecard.tsx");
  for (const title of [
    "Client and commercial readiness", "Case and project setup", "Floor setup", "Plans, evidence and orientation",
    "Gridding, 32D/16D and manual sheet", "Utility and Shakti evaluation", "Site analysis and post-site findings",
    "Stage A verdict and Founder review", "Balance and payment clearance", "Founder approval and protected report",
    "Delivery history and follow-up", "Stage B remedial handoff"
  ]) assert.match(helper, new RegExp(title.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")), title);
  assert.match(component, /recommendedModuleId/);
  assert.match(component, /founder-scorecard-module-active/);
  assert.match(component, /founder-action-primary/);
  assert.match(component, /Technical details/);
});

test("scorecard states preserve gates, floor isolation and deferred delivery", () => {
  const helper = read("lib/founder-scorecard.ts");
  const component = read("components/founder-scorecard.tsx");
  assert.match(helper, /NEEDS_REGENERATION/);
  assert.match(helper, /floorHasOpenRegeneration/);
  assert.match(component, /One floor per report|one floor per report/);
  assert.match(helper, /BLOCKED — METHOD INPUT REQUIRED/);
  assert.match(helper, /clientDelivery=DEFERRED/);
  assert.match(helper, /status: \"BLOCKED\"/);
});

test("scorecard is mobile-first and keeps status semantics accessible", () => {
  const css = read("app/globals.css");
  assert.match(css, /\.founder-scorecard\s*\{/);
  assert.match(css, /\.founder-scorecard-header\s*\{/);
  assert.match(css, /\.founder-floor-chips\s*\{/);
  assert.match(css, /\.founder-scorecard-module-active/);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*\.founder-scorecard-header/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /prefers-reduced-motion/);
});

test("scorecard navigation remains native and every module has recovery or a direct workspace", () => {
  const component = read("components/founder-scorecard.tsx");
  assert.doesNotMatch(component, /next\/link|<Link\\b|prefetch=/);
  assert.match(component, /href=\{module\.primaryAction\.href\}/);
  assert.match(component, /module\.recoveryAction/);
  assert.match(component, /href=\{`\/spatial\?floorId=/);
});
