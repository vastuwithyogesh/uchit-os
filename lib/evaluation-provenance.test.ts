import assert from "node:assert/strict";
import test from "node:test";
import { deterministicContentHash, validateShaktiInputs } from "./evaluation-provenance.ts";
import { parseUtilityRulesCsv } from "./utility-master.ts";
import { rankShakti } from "./workflows.ts";

const validCsv = `tabName,zoneCode,description,verdict,confidence
Residential,Z01,Door rule,GOOD,100
Residential,Z02,"Kitchen, corrected",OK-OK,0`;

test("utility CSV creates stable content-derived rule identifiers", () => {
  const first = parseUtilityRulesCsv(validCsv);
  const replay = parseUtilityRulesCsv(validCsv);
  assert.deepEqual(replay, first);
  assert.match(first[0].id, /^rule_csv_[a-f0-9]{16}$/);
  assert.equal(first[1].description, "Kitchen, corrected");
});

test("utility CSV rejects malformed headers, rows, verdicts, and numeric values", () => {
  assert.throws(() => parseUtilityRulesCsv("zoneCode,verdict\nZ01,GOOD"), /header must be exactly/);
  assert.throws(() => parseUtilityRulesCsv(validCsv.replace("GOOD,100", "MAYBE,100")), /invalid verdict/);
  assert.throws(() => parseUtilityRulesCsv(validCsv.replace("GOOD,100", "GOOD,NaN")), /finite number/);
  assert.throws(() => parseUtilityRulesCsv(validCsv.replace("GOOD,100", "GOOD,101")), /0 to 100/);
  assert.throws(() => parseUtilityRulesCsv(`${validCsv}\nResidential,Z01,Duplicate,BAD,50`), /duplicates zone/);
  assert.throws(() => parseUtilityRulesCsv(validCsv.replace('"Kitchen, corrected"', '"Kitchen, corrected')), /unterminated/);
});

test("canonical hash is stable across object key order and changes with content", () => {
  assert.equal(deterministicContentHash({ b: 2, a: 1 }), deterministicContentHash({ a: 1, b: 2 }));
  assert.notEqual(deterministicContentHash({ a: 1 }), deterministicContentHash({ a: 2 }));
  assert.equal(deterministicContentHash("abc"), "sha256:6cc43f858fbb763301637b5af970e2a46b46f461f27e5a0f41e009c59b827b25");
});

test("Shakti replay is deterministic and preserves explicit tie ordering", () => {
  const values = Array(16).fill(8);
  assert.deepEqual(rankShakti(values), rankShakti([...values]));
  assert.deepEqual(rankShakti(values).ranked.map(({ element }) => element), ["Air", "Fire", "Water", "Earth", "Space"]);
  assert.equal(rankShakti(values).tieBreakUsed, true);
});

test("Shakti preserves the existing two-point boundary and rejects unsafe inputs", () => {
  const boundary = [10, 8, 0, 0, 0, 10, 8, 0, 0, 0, 10, 8, 0, 0, 0, 0];
  assert.deepEqual(rankShakti(boundary).ranked.slice(0, 2).map(({ element }) => element), ["Air", "Fire"]);
  assert.throws(() => validateShaktiInputs(Array(15).fill(1)), /exactly 16/);
  assert.throws(() => validateShaktiInputs([...Array(15).fill(1), Number.NaN]), /finite numbers/);
  assert.throws(() => validateShaktiInputs([...Array(15).fill(1), Number.POSITIVE_INFINITY]), /finite numbers/);
});
