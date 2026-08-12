import test from "node:test";
import assert from "node:assert/strict";
import { runFounderStatutoryV12Rehearsal } from "../scripts/rehearse-founder-statutory-v12.mjs";

test("disposable v12 statutory rehearsal preserves timing rules and all activation blockers", async () => {
  const report = await runFounderStatutoryV12Rehearsal();
  assert.equal(report.contract, "FE-INVOICE-STATUTORY-CONFIG/v1.1-readiness");
  assert.equal(report.migration.migrationsDeclared, 12);
  assert.equal(report.migration.cleanPath.idempotent, true);
  assert.equal(report.migration.upgradePath.syntheticDataPreserved, true);
  assert.equal(report.migration.interruptionRecovery.forwardFixed, true);
  assert.equal(report.migration.disposed, true);
  assert.equal(report.rules.acceptanceAloneCreatesNoDocument, true);
  assert.equal(report.rules.receiptVoucherWithinSixtyMinutes, true);
  assert.equal(report.rules.receiptVoucherReplayIsIdempotent, true);
  assert.equal(report.rules.balanceDeadlineSevenDays, true);
  assert.equal(report.rules.finalInvoiceOnlyAfterFullPayment, true);
  assert.equal(report.rules.finalInvoiceStatus, "REVIEW_REQUIRED");
  assert.equal(report.readiness.status, "REVIEW_REQUIRED");
  assert.deepEqual(report.readiness.missingRequiredBlockers, [
    "Activate an accountant-approved place-of-supply and service-timing policy.",
    "Activate a Founder-approved Media Library logo image.",
    "Activate a private Founder-approved signature image."
  ]);
  assert.equal(report.safety.persistentEnvironmentTouched, false);
  assert.equal(report.safety.deployedMigrationExecuted, false);
  assert.equal(report.safety.objectStorageTouched, false);
  assert.equal(report.safety.assetVersionCount, 0);
  assert.equal(report.safety.issuedDocumentCount, 0);
  assert.equal(report.safety.sequenceReservationCount, 0);
  assert.equal(report.safety.artifactBytesGenerated, false);
  assert.equal(report.safety.deploymentExecuted, false);
});
