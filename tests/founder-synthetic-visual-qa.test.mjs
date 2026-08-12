import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file) => readFileSync(resolve(process.cwd(), file), "utf8");

test("synthetic visual-QA harness is owner-scoped, no-write and context complete", () => {
  const script = read("scripts/prepare-founder-visual-qa.mjs");
  for (const token of ["buildReleaseableFounderPilotFixture", "syntheticOnly: true", "noWrites: true", "noExternalCommunication: true", "1440", "390", "/founder/08", "/founder/10", "/founder/11", "BLOCKED_METHOD_INPUT", "DEFERRED"]) {
    assert.match(script, new RegExp(token.replace(/[.*+?^${}()|[\\]\\]/g, "\\\\$&")), token);
  }
  assert.doesNotMatch(script, /fetch\(|POST|writeFileSync|real|client-data/i);
});

test("evaluation surface keeps technical context behind disclosure and one dominant save action", () => {
  const ui = read("components/evaluation-console.tsx");
  assert.match(ui, /<summary>Evaluation status details<\/summary>/);
  assert.match(ui, /<summary>Rule summary<\/summary>/);
  assert.match(ui, /className="button founder-action-primary"/);
  assert.match(ui, /className="button-secondary"/);
  assert.match(ui, /<summary>Release and payment context<\/summary>/);
});
