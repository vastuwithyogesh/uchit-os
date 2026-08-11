import test from "node:test";
import assert from "node:assert/strict";
import { buildLovableIntegrationDryRun } from "../lib/lovable-integration-dry-run.ts";

test("private integration rehearsal is synthetic, independent and side-effect free", () => {
  const plan = buildLovableIntegrationDryRun();
  assert.equal(plan.externalWrites, false);
  assert.equal(plan.migrationExecuted, false);
  assert.equal(plan.webhookActive, false);
  assert.equal(plan.backfillExecuted, false);
  assert.equal(plan.clientDeliveryEnabled, false);
  assert.deepEqual(plan.identityModes, ["EXACT_MATCH", "NEW_CLIENT", "REVIEW_REQUIRED"]);
  assert.equal(plan.independentEnvironmentBindings, true);
  assert.equal(plan.crossEnvironmentEventsRejected, true);
});
