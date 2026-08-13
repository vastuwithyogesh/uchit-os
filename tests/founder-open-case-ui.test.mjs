import test from "node:test";
import assert from "node:assert/strict";
import { source } from "./helpers/source-contracts.mjs";

const ui = source("components/founder-open-case-sheet.tsx");
const css = source("app/globals.css");

test("new-case validation identifies required fields without showing duplicate-case confirmation", () => {
  assert.match(ui, /if \(!name\.trim\(\)\) next\.name/);
  assert.match(ui, /if \(!location\.trim\(\)\) next\.location/);
  assert.match(ui, /aria-invalid/);
  assert.match(ui, /aria-describedby/);
  assert.match(ui, /queueMicrotask\(\(\) => first\?\.current\?\.focus\(\)\)/);
  assert.match(ui, /const duplicateWarning = \/similar active case\/i\.test\(serverError\)/);
  assert.doesNotMatch(ui, /const duplicateWarning = .*validationSummary/);
});

test("new-case floor count is optional but a supplied value is a bounded positive integer", () => {
  assert.match(ui, /if \(floors\.trim\(\)\)/);
  assert.match(ui, /!Number\.isInteger\(count\) \|\| count < 1 \|\| count > 200/);
  assert.match(ui, /leave it blank to add later/);
  assert.match(ui, /const floorCount = floors\.trim\(\) \? Number\(floors\) : undefined/);
});

test("new-case duplicate awareness remains a server-confirmed independent-case action", () => {
  assert.match(ui, /confirmPossibleDuplicate: confirmed/);
  assert.match(ui, /response\.status === 409/);
  assert.match(ui, /This is an independent case/);
  assert.match(ui, /A similar active case exists/);
});

test("new-case validation and server failures have separate recovery summaries", () => {
  assert.match(ui, /validationSummary/);
  assert.match(ui, /serverError/);
  assert.match(ui, /setValidationSummary\(""\)/);
  assert.match(ui, /setServerError\(""\)/);
});

test("new-case sheet keeps every action reachable in short and mobile viewports", () => {
  const sheetRule = css.match(/\.lead-move-sheet \{[^}]+\}/)?.[0] ?? "";
  assert.match(sheetRule, /max-height: calc\(100dvh - 28px\)/);
  assert.match(sheetRule, /overflow-y: auto/);
  assert.match(sheetRule, /overscroll-behavior: contain/);
});
