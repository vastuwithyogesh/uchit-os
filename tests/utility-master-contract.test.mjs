import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { source } from "./helpers/source-contracts.mjs";

const master = JSON.parse(fs.readFileSync(new URL("../data/utility-master.v1.json", import.meta.url), "utf8"));

test("UtilityMaster is the pinned 737-row, 46-utility source and preserves exact outcomes", () => {
  assert.equal(master.sourceVersion, "uchit-utilitymaster/v1");
  assert.equal(master.workbookHash, "e7be4e5d76290b9556fbc396d851ba3fe6634fc0b26fd058a4e53818e775644c");
  assert.equal(master.rows.length, 737);
  assert.equal(new Set(master.rows.map((row) => row.utilityName)).size, 46);
  assert.ok(master.rows.every((row) => ["GOOD", "BAD", "OK-OK"].includes(row.outcome)));
  assert.ok(master.rows.every((row) => row.attributeText && row.directionCode && row.utilityName));
});

test("UtilityMaster adapter keeps unresolved source semantics and conflicts reviewable", () => {
  const body = source("lib/utility-master.ts");
  for (const code of ["E1", "S1", "W1", "N1", "BRAHMSTHAN", "ENW"]) assert.match(body, new RegExp(code));
  for (const utility of ["SERVANT ROOM", "BAR", "BOREWELL"]) assert.match(body, new RegExp(utility));
  assert.match(body, /REVIEW_REQUIRED/);
  assert.match(body, /BLOCKED_METHOD_INPUT/);
  assert.match(body, /do not deduplicate|conflicting/i);
  assert.doesNotMatch(body, /AOU|aou/i);
});

test("Utility evaluation binds the workbook hash/version and rejects guessed inputs", () => {
  const body = source("lib/workflow-service.ts");
  assert.match(body, /UTILITY_MASTER_WORKBOOK_HASH/);
  assert.match(body, /UTILITY_MASTER_SOURCE_VERSION/);
  assert.match(body, /resolveUtilityMasterRows/);
  assert.match(body, /BLOCKED_METHOD_INPUT/);
  assert.match(body, /REVIEW_REQUIRED/);
  assert.match(body, /utilityInputs/);
});
