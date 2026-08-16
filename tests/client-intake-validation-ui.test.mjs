import test from "node:test";
import assert from "node:assert/strict";
import { source } from "./helpers/source-contracts.mjs";

test("Step 03 uses the shared validator, accessible inline errors and first-error focus", () => {
  const page = source("components/client-intake-form.tsx");
  assert.match(page, /validateClientIntake/);
  assert.match(page, /Ready to save/);
  assert.doesNotMatch(page, /\$\{completeness\.completed\}\/\$\{completeness\.total\} complete/);
  assert.match(page, /aria-invalid/);
  assert.match(page, /aria-describedby/);
  assert.match(page, /field-error/);
  assert.match(page, /document\.getElementById\(fieldIds\[first\]\)\?\.focus/);
  assert.match(page, /resolveClientIntakePrefill/);
  assert.match(page, /qualification form/);
  assert.match(page, /intakeComplete \? "Ready to save"/);
  assert.match(page, /window\.addEventListener\("beforeunload", warn\)/);
  assert.match(page, /draftSnapshot !== savedSnapshot/);
  assert.doesNotMatch(page, /tone="ready" status="Ready to save"/);
});
