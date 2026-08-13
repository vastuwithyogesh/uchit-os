import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file) => readFileSync(resolve(process.cwd(), file), "utf8");

test("report tools require explicit Case selection before continuing", () => {
  const route = read("app/reports/page.tsx");
  assert.match(route, /title="Reports"/);
  assert.match(route, /href: "\/founder\/continue"/);
  assert.match(route, /Select a case and continue/);
  assert.match(route, /<summary>Open advanced report console<\/summary>/);
  assert.match(route, /<ReportConsole \/>/);
});
