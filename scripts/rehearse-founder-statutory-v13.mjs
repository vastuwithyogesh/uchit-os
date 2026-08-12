import { pathToFileURL } from "node:url";
import { runFounderStatutoryV12Rehearsal } from "./rehearse-founder-statutory-v12.mjs";

export async function runFounderStatutoryV13Rehearsal() {
  const report = await runFounderStatutoryV12Rehearsal({
    migrationLevel: 13,
    contract: "FE-INVOICE-STATUTORY-CONFIG/v1.2-readiness"
  });
  if (!report.migration.schema.v13PolicyColumnsPresent) throw new Error("D1 v13 policy columns are incomplete.");
  if (report.ownerPolicy.operationalPlaceOfSupplySelection !== "CLIENT_LOCATION_ONLY") throw new Error("Place-of-supply policy drifted.");
  if (report.ownerPolicy.refundPolicy !== "NO_REFUNDS") throw new Error("Commercial refund policy drifted.");
  if (report.ownerPolicy.correctionPolicyApproval !== "REVIEW_REQUIRED_ACCOUNTANT") throw new Error("Correction exception stopped failing closed.");
  return report;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const report = await runFounderStatutoryV13Rehearsal();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
