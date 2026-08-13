import test from "node:test";
import assert from "node:assert/strict";
import { source } from "./helpers/source-contracts.mjs";

for (const file of [
  "components/founder-case-setup-step.tsx",
  "components/files-drawings-console.tsx",
  "components/evaluation-console.tsx",
  "components/site-analysis-console.tsx",
  "components/payment-proof-console.tsx",
  "components/founder-report-step.tsx"
]) {
  test(`${file} never falls back to the first Case, Client or floor`, () => {
    const ui = source(file);
    assert.doesNotMatch(ui, /clients\[0\]|floors\[0\]|getActiveCaseForClient/);
  });
}

test("successful Founder mutations refresh the server-derived scorecard shell", () => {
  for (const file of [
    "components/files-drawings-console.tsx",
    "components/evaluation-console.tsx",
    "components/site-analysis-console.tsx",
    "components/payment-proof-console.tsx",
    "components/founder-report-step.tsx"
  ]) assert.match(source(file), /router\.refresh\(\)/, file);
});

test("floor setup never treats a missing selection as permission to create a duplicate floor", () => {
  const ui = source("components/founder-case-setup-step.tsx");
  const scorecard = source("lib/founder-scorecard.ts");
  assert.match(ui, /!floor && floors\.length === 0/);
  assert.match(ui, /Select an existing floor/);
  assert.match(ui, /Adding another floor is a separate deliberate action/);
  assert.match(scorecard, /Select an existing floor to continue, or deliberately add another floor/);
});
