import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file) => readFileSync(resolve(process.cwd(), file), "utf8");

test("legacy report tools keep the Founder report assembly step as primary recovery", () => {
  const route = read("app/reports/page.tsx");
  assert.match(route, /Legacy Report Tools/);
  assert.match(route, /href: "\/founder\/15"/);
  assert.match(route, /Continue Founder report assembly/);
  assert.match(route, /<summary>Open legacy report console<\/summary>/);
  assert.match(route, /<ReportConsole \/>/);
});
