import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file) => readFileSync(resolve(process.cwd(), file), "utf8");

test("Founder step exposes one calm status and current requirements", () => {
  const flow = read("components/founder-flow.tsx");
  assert.match(flow, /aria-label="Selected client, project and floor"/);
  assert.match(flow, /role=\{isBlocked \? "alert" : "status"\}/);
  assert.match(flow, /Current status/);
  assert.match(flow, /<summary>Required now<\/summary>/);
  assert.match(flow, /open=\{!isBlocked && !isComplete\}/);
  assert.equal((flow.match(/founder-flow-primary/g) ?? []).length, 1);
});

test("Founder visual system has restrained semantic states and a single dominant action", () => {
  const css = read("app/globals.css");
  assert.match(css, /Founder production polish/);
  assert.match(css, /\.founder-flow-status\.status-ready/);
  assert.match(css, /\.founder-flow-status\.status-warning/);
  assert.match(css, /\.founder-flow-status\.status-blocked/);
  assert.match(css, /\.founder-flow-primary[\s\S]*background:\s*#242321/);
  assert.match(css, /\.founder-flow-action-bar \.button-secondary[\s\S]*background:\s*transparent/);
  assert.doesNotMatch(css.slice(css.indexOf("Founder production polish")), /linear-gradient|radial-gradient/);
});

test("Founder and CRM sheets preserve accessible interaction states", () => {
  const css = read("app/globals.css");
  assert.match(css, /\.lead-profile-drawer button,[\s\S]*min-height:\s*44px/);
  assert.match(css, /button:disabled,[\s\S]*cursor:\s*not-allowed/);
  assert.match(css, /:where\(a, button, input, select, textarea, summary\):focus-visible/);
  assert.match(css, /@media \(max-width:\s*820px\)[\s\S]*\.lead-profile-drawer,[\s\S]*width:\s*100%/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
});
