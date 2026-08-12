import test from "node:test";
import assert from "node:assert/strict";
import { runFounderPreStagingRehearsal } from "../scripts/rehearse-founder-pre-staging.mjs";

test("disposable SQLite rehearses clean and upgrade v13 paths with recovery evidence", async () => {
  const result = await runFounderPreStagingRehearsal();
  assert.equal(result.scope, "DISPOSABLE_LOCAL_ONLY");
  assert.equal(result.persistentEnvironmentTouched, false);
  assert.equal(result.disposed, true);
  assert.deepEqual(result.cleanPath, { from: 1, to: 13, markerCount: 13, idempotent: true });
  assert.equal(result.upgradePath.syntheticDataPreserved, true);
  assert.equal(result.upgradePath.integrity, "ok");
  assert.equal(result.backupRestore.backupCreated, true);
  assert.equal(result.backupRestore.syntheticDataPreserved, true);
  assert.equal(result.backupRestore.integrity, "ok");
  assert.deepEqual(result.interruptionRecovery, { injectedFailure: true, noPartialMarker: true, noPartialTable: true, forwardFixed: true });
  assert.equal(result.schema.requiredIndexesPresent, true);
  assert.equal(result.schema.v13PolicyColumnsPresent, true);
  assert.equal(result.schema.constraintFailuresObserved.length, 3);
});
