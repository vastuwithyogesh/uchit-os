import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("../", import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), "utf8");

test("V1 Step 04 is self-remediable without changing its blocked status", () => {
  const flow = read("lib/founder-flow.ts");
  const page = read("components/founder-flow.tsx");
  assert.match(flow, /selfRemediableOnCurrentStep: boolean/);
  assert.match(flow, /\["direction", "gridding"\]\.includes\(module\.id\)/);
  assert.match(page, /isBlocked \|\| isRegeneration \|\| step\.selfRemediableOnCurrentStep/);
  assert.match(page, /isBlocked && !step\.selfRemediableOnCurrentStep/);
});

test("blocked downstream and security/access paths remain fail-closed", () => {
  const page = read("components/founder-flow.tsx");
  const route = read("app/founder/[step]/page.tsx");
  assert.match(page, /!isBlocked \|\| isRegeneration \|\| step\.selfRemediableOnCurrentStep/);
  assert.match(route, /CASE_NOT_ACCESSIBLE/);
  assert.match(route, /FLOOR_NOT_ACCESSIBLE/);
  assert.match(route, /FLOOR_CASE_MISMATCH/);
});

test("Step 04 still delegates to the canonical spatial workspace", () => {
  const workspace = read("components/founder-step-workspace.tsx");
  assert.match(workspace, /if \(stepNumber === 4\) return <SpatialWorkspace focus="orientation"/);
});

test("V1 Step 06 remains reachable for native D16 self-remediation", () => {
  const flow = read("lib/founder-flow.ts");
  assert.match(flow, /\["direction", "gridding"\]\.includes\(module\.id\)/);
});

test("V1 Step 08 exposes only its native workspace for directional review remediation", () => {
  const flow = read("lib/founder-flow.ts");
  const workspace = read("components/founder-step-workspace.tsx");
  assert.match(flow, /module\.id === "evaluation" && module\.status === "BLOCKED" && module\.explanation === "DIRECTIONAL_REVIEW_REQUIRED"/);
  assert.match(workspace, /stepNumber === 8.*DirectionalEvaluationConsoleV1/s);
});

test("V1 Step 10 exposes only the native Site workspace for SITE_EVIDENCE_REQUIRED", () => {
  const flow = read("lib/founder-flow.ts");
  const scorecard = read("lib/founder-scorecard.ts");
  const page = read("components/founder-flow.tsx");
  const workspace = read("components/founder-step-workspace.tsx");
  const siteWorkspace = read("components/v1-site-elemental-workspace.tsx");
  assert.match(scorecard, /blockerCodes: !facts\.site && v1\.postSite === "BLOCKED" \? \["SITE_EVIDENCE_REQUIRED"\]/);
  assert.match(flow, /module\.id === "site" && module\.status === "BLOCKED" && module\.blockerCodes\?\.length === 1 && module\.blockerCodes\[0\] === "SITE_EVIDENCE_REQUIRED"/);
  assert.match(page, /!isBlocked \|\| isRegeneration \|\| step\.selfRemediableOnCurrentStep/);
  assert.match(workspace, /stepNumber === 10.*V1SiteElementalWorkspace focus="site"/s);
  assert.match(siteWorkspace, /if \(focus === "site"\)/);
  assert.doesNotMatch(siteWorkspace.match(/if \(focus === "site"\)[\s\S]*?return ([\s\S]*?);\n  return/)?.[1] ?? "", /Natural Light|Ventilation|Energy Bar|Elemental Evaluation/);
});

test("V1 Step 10 self-remediation does not broaden to downstream or security blockers", () => {
  const flow = read("lib/founder-flow.ts");
  const page = read("components/founder-flow.tsx");
  const route = read("app/founder/[step]/page.tsx");
  assert.match(flow, /module\.id === "site" && module\.status === "BLOCKED" && module\.blockerCodes\?\.length === 1/);
  assert.match(page, /isBlocked && !step\.selfRemediableOnCurrentStep/);
  assert.match(route, /CASE_NOT_ACCESSIBLE/);
  assert.match(route, /FLOOR_NOT_ACCESSIBLE/);
  assert.match(route, /FLOOR_CASE_MISMATCH/);
});
