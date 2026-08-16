import test from "node:test";
import assert from "node:assert/strict";
import { getClientIntakeCompleteness, validateClientIntake, validateClientIntakeForEvaluation } from "../lib/client-intake.ts";

const valid = { challenge: "Entry flow", outcome: "Calm home", service: "EXISTING_SPACE", propertyType: "Residential", propertyStatus: "Existing", cityCountry: "Ludhiana, India", locationLink: "https://maps.google.com/?q=30.9,75.8" };

test("required-only Step 03 input is complete and optional blanks do not reduce readiness", () => {
  assert.deepEqual(validateClientIntake(valid), {});
  const status = getClientIntakeCompleteness({ needs: { mainChallenge: valid.challenge, desiredOutcome: valid.outcome }, propertyContext: { serviceInterest: "EXISTING_SPACE", propertyType: "Residential", propertyStatus: "Existing", cityCountry: "Ludhiana, India" } } as any);
  assert.deepEqual({ completed: status.completed, total: status.total, complete: status.complete }, { completed: 2, total: 2, complete: true });
});

test("partial drafts save while supplied values remain validated", () => {
  assert.deepEqual(validateClientIntake({}), {});
  assert.match(validateClientIntake({ ...valid, service: "OTHER" }).service!, /Existing Space/i);
  assert.match(validateClientIntakeForEvaluation({}).challenge!, /before running the evaluation/i);
  assert.match(validateClientIntakeForEvaluation({}).cityCountry!, /before running the evaluation/i);
});

test("supplied URL and coordinate values receive exact validation errors", () => {
  assert.match(validateClientIntake({ ...valid, service: "OTHER" }).service!, /Existing Space/i);
  assert.match(validateClientIntake({ ...valid, locationLink: "http://localhost/private" }).locationLink!, /HTTPS|safe/i);
  assert.match(validateClientIntake({ ...valid, latitude: "91", longitude: "0" }).latitude!, /-90 and 90/);
  assert.match(validateClientIntake({ ...valid, latitude: "0" }).longitude!, /latitude/i);
  assert.match(validateClientIntake({ ...valid, floorCount: "0" }).floorCount!, /1 to 200/);
});

test("zero coordinates are accepted only when both values are explicit", () => {
  assert.deepEqual(validateClientIntake({ ...valid, latitude: "0", longitude: "0" }), {});
});
