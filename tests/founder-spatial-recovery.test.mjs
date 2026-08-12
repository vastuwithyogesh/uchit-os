import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const source = fs.readFileSync(path.join(root, "components", "spatial-workspace.tsx"), "utf8");

test("spatial Founder recovery stays in the canonical sequential flow", () => {
  assert.match(source, /href="\/founder\/continue"/);
  assert.match(source, /Continue to evaluation readiness/);
  assert.doesNotMatch(source, /href="\/evaluation"/);
});
