import test from "node:test";
import assert from "node:assert/strict";
import { source, functionBody, switchCaseBody } from "./helpers/source-contracts.mjs";

test("Site Analysis is downstream of presented Stage A and exact floor evidence", () => {
  const workflow = source("lib/site-workflow.ts");
  assert.match(workflow, /stageAVerdictStatus !== "PRESENTED"/);
  assert.match(workflow, /stageAVerdictReportId/);
  assert.match(workflow, /item\.floorId === floor\.id/);
  assert.match(workflow, /evaluationSnapshots\.some/);
  assert.match(workflow, /assertCaseFileEvidenceScope/);
  assert.match(workflow, /without rerunning evaluation|evaluation was not rerun/);
});

test("Site and Post-Site lifecycles are Founder checkpoints with regeneration blocking", () => {
  const workflow = source("lib/site-workflow.ts");
  for (const name of ["checkpointSiteAnalysis", "checkpointPostSiteFindings"]) assert.match(workflow, new RegExp(name));
  assert.match(workflow, /function siteCheckpoint[\s\S]*FOUNDER_REVIEWED/);
  assert.match(workflow, /function siteCheckpoint[\s\S]*FOUNDER_APPROVED/);
  assert.match(workflow, /function siteCheckpoint[\s\S]*needsRegeneration/);
  assert.match(workflow, /function postSiteCheckpoint[\s\S]*linked Site Analysis/);
  assert.match(workflow, /function postSiteCheckpoint[\s\S]*needsRegeneration/);
  assert.match(workflow, /same presented Stage A verdict/);
});

test("site action route is allowlisted, concurrent, Founder-only and has no automatic engine action", () => {
  const actions = source("app/api/actions/route.ts");
  for (const action of ["site-analysis-upsert", "site-analysis-checkpoint", "post-site-findings-upsert", "post-site-findings-checkpoint", "manual-sheet-approve"]) {
    assert.match(actions, new RegExp(`case "${action}"`));
    assert.match(actions, new RegExp(`"${action}"`));
  }
  assert.match(actions, /Unsupported site workflow field/);
  assert.match(actions, /expectedRevision/);
  assert.match(actions, /organisation_owner/);
  assert.doesNotMatch(switchCaseBody(actions, "site-analysis-upsert"), /createEvaluationSnapshot|recordShaktiSnapshot|generateUtilityEvaluation/);
});

test("site records and persistence collections are additive and organisation scoped", () => {
  const domain = source("lib/domain.ts"); const store = source("lib/store.ts"); const merge = source("lib/persistence-merge.ts");
  for (const value of ["SiteAnalysisRecord", "SiteAnalysisApprovalRecord", "PostSiteFindingsRecord", "PostSiteFindingsApprovalRecord", "ManualSheetApprovalRecord"]) assert.match(domain, new RegExp(value));
  for (const value of ["siteAnalyses", "siteAnalysisApprovals", "postSiteFindings", "postSiteFindingsApprovals", "manualSheetApprovals"]) { assert.match(store, new RegExp(value)); assert.match(merge, new RegExp(value)); }
  assert.match(domain, /organisationId/);
});
