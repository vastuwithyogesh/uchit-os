import test from "node:test";
import assert from "node:assert/strict";
import { source } from "./helpers/source-contracts.mjs";

test("global action feedback is accessible, deduplicated, and mounted at the root", () => {
  const feedback = source("components/action-feedback.tsx");
  const layout = source("app/layout.tsx");
  const commercial = source("components/founder-commercial-proposal-editor.tsx");
  assert.match(layout, /ActionFeedbackProvider/);
  assert.match(feedback, /aria-live="polite"/);
  assert.match(feedback, /aria-atomic="true"/);
  assert.match(feedback, /current\.some\(\(notice\) => notice\.kind === kind && notice\.message === message\)/);
  assert.match(feedback, /Dismiss notification/);
  assert.match(commercial, /notify\("success"/);
  assert.match(commercial, /notify\("error"/);
  assert.match(commercial, /Advance recorded/);
});
