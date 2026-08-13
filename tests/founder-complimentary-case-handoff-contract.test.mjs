import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync(new URL("../app/api/actions/route.ts", import.meta.url), "utf8");
const editor = fs.readFileSync(new URL("../components/founder-commercial-proposal-editor.tsx", import.meta.url), "utf8");

test("complimentary case handoff is an explicit protected Founder action", () => {
  assert.match(route, /founder-complimentary-case-handoff/);
  assert.match(route, /createFounderComplimentaryCaseHandoff/);
  assert.match(route, /expectedRecordVersion/);
  assert.match(editor, /Create Case & Project/);
  assert.match(editor, /INTERNAL_COMPLIMENTARY/);
  assert.match(editor, /founder\/01\?caseId=/);
});
