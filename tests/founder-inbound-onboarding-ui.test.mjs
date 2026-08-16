import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const workspace = fs.readFileSync(new URL("../components/unified-leads-workspace.tsx", import.meta.url), "utf8");
const route = fs.readFileSync(new URL("../app/api/actions/route.ts", import.meta.url), "utf8");

test("converted modal exposes the single inbound Founder onboarding action", () => {
  assert.match(workspace, /Converted — ready to onboard/);
  assert.match(workspace, /Create proposal & start Case/);
  assert.match(workspace, /founder-inbound-onboarding-create/);
  assert.match(workspace, /Advance received/);
  assert.match(workspace, /Internal complimentary/);
  assert.doesNotMatch(workspace, /The proposal remains a draft until the existing Founder review, approval, artifact and client-acceptance gates complete\./);
});

test("inbound action remains allowlisted and routed through the governed service", () => {
  assert.match(route, /"founder-inbound-onboarding-create"/);
  assert.match(route, /createFounderInboundOnboarding\(/);
  assert.doesNotMatch(route, /case "founder-inbound-onboarding-create"[\s\S]*?getAppState\(\)\.(?:vastuCases|projects)\.push/);
});
