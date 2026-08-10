import test from "node:test";
import assert from "node:assert/strict";
import { source } from "./helpers/source-contracts.mjs";

test("printable reports follow the approved eight-part resource architecture", () => {
  const report = source("lib/report-html.ts");
  for (const heading of [
    "Executive summary and client objective",
    "Agreed scope and verified inputs",
    "Method and version",
    "Findings and evidence-backed report card",
    "Annotated recommendations and alternatives",
    "Prioritised implementation plan",
    "Responsibilities, limitations, and professional disclaimer",
    "Appendices"
  ]) assert.match(report, new RegExp(heading));
  assert.match(report, /Understand<\/li><li>Verify<\/li><li>Map<\/li><li>Evaluate<\/li><li>Prioritise<\/li><li>Recommend<\/li><li>Implement/);
});

test("missing structured facts are disclosed instead of invented", () => {
  const report = source("lib/report-html.ts");
  assert.match(report, /Not recorded for this report version/);
  assert.match(report, /client objective was not recorded/i);
  assert.match(report, /does not invent a numerical Vastu score/);
  assert.match(report, /Action owner, feasibility, implementation horizon, and target date/);
});

test("report includes professional boundaries and no-guarantee language", () => {
  const report = source("lib/report-html.ts");
  assert.match(report, /appropriately qualified professionals/);
  assert.match(report, /does not guarantee financial, medical, personal, relationship, or business outcomes/);
  assert.match(report, /Artifact evidence/);
  assert.match(report, /SHA-256/);
});
