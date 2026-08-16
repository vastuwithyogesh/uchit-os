import test from "node:test";
import assert from "node:assert/strict";
import { source, functionBody } from "./helpers/source-contracts.mjs";

test("manual utility sheet is a required, Founder-approved, versioned document", () => {
  const domain = source("lib/domain.ts"); const service = source("lib/service-framework.ts"); const workflow = source("lib/workflow-service.ts");
  assert.match(domain, /MANUAL_UTILITY_SHEET/); assert.match(domain, /founderApprovalStatus/); assert.match(domain, /ManualSheetApprovalRecord/);
  assert.match(service, /MANUAL_UTILITY_SHEET/); assert.match(service, /founderApprovalStatus === "APPROVED"/);
  assert.match(workflow, /assetType === "MANUAL_UTILITY_SHEET"/);
  assert.match(workflow, /founderApprovalStatus: existing\?\.founderApprovalStatus \?\? "PENDING"/);
  assert.match(workflow, /founderApprovedAt: existing\?\.founderApprovedAt/);
  assert.match(workflow, /founderApprovedByActorUserId: existing\?\.founderApprovedByActorUserId/);
});

test("report composition places the approved manual sheet before evaluation and binds it to the artifact", () => {
  const artifacts = source("lib/report-artifacts.ts"); const html = source("lib/report-html.ts"); const pdf = source("lib/final-pdf.server.ts");
  assert.match(artifacts, /manualUtilitySheetDocumentId/); assert.match(artifacts, /currentApprovedManualUtilitySheet/);
  assert.match(html, /5\. Original manual utility sheet/); assert.match(html, /6\. Utility and Element evaluation/);
  assert.match(pdf, /manualSheet/); assert.match(pdf, /manual utility sheet checksum/); assert.match(pdf, /manualEvidence/);
});

test("manual-sheet approval route and workflow fail closed on scope, evidence and Founder authority", () => {
  const actions = source("app/api/actions/route.ts"); const workflow = source("lib/site-workflow.ts");
  assert.match(actions, /case "manual-sheet-approve"/); assert.match(actions, /Only the Founder organisation owner/);
  assert.match(functionBody(workflow, "approveManualUtilitySheet"), /MANUAL_UTILITY_SHEET/);
  assert.match(functionBody(workflow, "approveManualUtilitySheet"), /revisionStatus !== "VERIFIED"/);
  assert.match(functionBody(workflow, "approveManualUtilitySheet"), /founderApprovalStatus = "APPROVED"/);
});
