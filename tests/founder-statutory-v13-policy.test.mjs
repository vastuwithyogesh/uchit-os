import test from "node:test";
import assert from "node:assert/strict";
import { runFounderStatutoryV13Rehearsal } from "../scripts/rehearse-founder-statutory-v13.mjs";

test("v13 records the exact v1.2 owner policy and remains fail closed", async () => {
  const report = await runFounderStatutoryV13Rehearsal();
  assert.equal(report.contract, "FE-INVOICE-STATUTORY-CONFIG/v1.2-readiness");
  assert.equal(report.migration.migrationsDeclared, 13);
  assert.equal(report.migration.cleanPath.idempotent, true);
  assert.equal(report.migration.upgradePath.syntheticDataPreserved, true);
  assert.equal(report.migration.interruptionRecovery.forwardFixed, true);
  assert.equal(report.migration.schema.v13PolicyColumnsPresent, true);
  assert.equal(report.ownerPolicy.operationalPlaceOfSupplySelection, "CLIENT_LOCATION_ONLY");
  assert.equal(report.ownerPolicy.receiptVoucherTrigger, "CONFIRMED_ADVANCE");
  assert.equal(report.ownerPolicy.receiptVoucherSlaMinutes, 60);
  assert.equal(report.ownerPolicy.proformaPolicy, "AFTER_CONFIRMED_ADVANCE_ONLY");
  assert.equal(report.ownerPolicy.taxInvoiceTrigger, "CONFIRMED_FULL_PAYMENT");
  assert.equal(report.ownerPolicy.refundPolicy, "NO_REFUNDS");
  assert.equal(report.ownerPolicy.correctionPosture, "EXCEPTION_ONLY_ACCOUNTANT_APPROVAL");
  assert.equal(report.ownerPolicy.correctionPolicyApproval, "REVIEW_REQUIRED_ACCOUNTANT");
  assert.equal(report.ownerPolicy.purchaseSideDebitNotesInScope, false);
  assert.equal(report.ownerPolicy.opexTrackingScope, "OUTSIDE_CLIENT_INVOICE_MODULE");
  assert.equal(report.ownerPolicy.locationsStoredSeparately, true);
  assert.equal(report.rules.receiptVoucherWithinSixtyMinutes, true);
  assert.equal(report.rules.finalInvoiceOnlyAfterFullPayment, true);
  assert.equal(report.safety.issuedDocumentCount, 0);
  assert.equal(report.safety.deployedMigrationExecuted, false);
});
