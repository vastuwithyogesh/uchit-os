import test from "node:test";
import assert from "node:assert/strict";
import { source } from "./helpers/source-contracts.mjs";

test("qualification invalid-link recovery has a named page, status and retry", () => {
  const ui = source("components/qualification-form-client.tsx");
  assert.match(ui, /<h1>Qualification form unavailable<\/h1>/);
  assert.match(ui, /role="status"/);
  assert.match(ui, /Retry securely/);
});
