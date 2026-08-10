import test from "node:test";
import assert from "node:assert/strict";
import { functionBody, source } from "./helpers/source-contracts.mjs";

const consoleSource = source("components/state-console.tsx");
const route = source("app/api/state/route.ts");

test("state exports preserve source revision and restore uses current CAS token", () => {
  assert.match(consoleSource, /sourceRevision: payload\.revision/);
  assert.match(functionBody(consoleSource, "importState"), /expectedRevision/);
  assert.match(functionBody(consoleSource, "runImport"), /payload\?\.revision \?\? null/);
  assert.match(functionBody(route, "POST"), /expectedRevision is required for full-state replacement/);
  assert.match(functionBody(route, "POST"), /PersistenceConflictError/);
});

test("full-state replacement requires an explicit warning and accepts versioned exports", () => {
  assert.match(functionBody(consoleSource, "runImport"), /window\.confirm/);
  assert.match(functionBody(consoleSource, "runImport"), /parsed\.formatVersion === 1/);
  assert.match(functionBody(consoleSource, "downloadSnapshot"), /formatVersion: 1/);
  assert.match(functionBody(consoleSource, "downloadSnapshot"), /sourceRevision/);
});
