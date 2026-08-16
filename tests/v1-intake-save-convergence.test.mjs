import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("../", import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), "utf8");

test("V1 browser intake submits property context and needs through one composite action", () => {
  const source = read("components/client-intake-form.tsx");
  assert.match(source, /action: "client-intake-save-v1"/);
  assert.match(source, /propertyContextExpectedRecordVersion/);
  assert.match(source, /clientExpectedRecordVersion/);
  assert.match(source, /needs: \{ mainChallenge: challenge \|\| undefined, desiredOutcome: outcome \|\| undefined/);
  assert.match(source, /V1 case property context and client intake saved\./);
});

test("V1 composite action is protected, allowlisted, and routed to the domain service", () => {
  const source = read("app/api/actions/route.ts");
  assert.match(source, /concurrencyActions\.add\("client-intake-save-v1"\)/);
  assert.match(source, /"client-intake-save-v1": \[/);
  assert.match(source, /case "client-intake-save-v1":/);
  assert.match(source, /saveClientIntakeV1\(\{ \.\.\.body, actor/);
});

test("V1 composite service preserves domain separation and calls both V1 upserts", () => {
  const source = read("lib/workflow-service.ts");
  const composite = source.slice(source.indexOf("export function saveClientIntakeV1"));
  assert.match(composite, /upsertCasePropertyContextV1\(/);
  assert.match(composite, /upsertClientIntakeProfileV1\(/);
  assert.match(source, /deterministicContentHash\(current\.propertyContext\)/);
  assert.match(source, /different property context/);
  assert.match(source, /different client-intake body/);
});

test("V1 readiness combines the two authoritative domains without relocating fields", () => {
  const intake = read("lib/client-intake.ts");
  const scorecard = read("lib/founder-scorecard.ts");
  assert.match(intake, /propertyContextOverride\?: PropertyContext/);
  assert.match(scorecard, /resolveEffectivePropertyContext\(\{ state, caseId: caseRecord\.id, clientId: client\.id \}\)\.propertyContext/);
  assert.match(scorecard, /getClientIntakeCompleteness\(intakeProfile, v1PropertyContext\)/);
});
