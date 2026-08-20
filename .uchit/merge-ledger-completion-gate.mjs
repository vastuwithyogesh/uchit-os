import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));

const autonomy = readJson(".uchit/autonomy.json");
const dispatcher = readJson(".uchit/dispatcher.json");
const provenance = readJson(".uchit/pr-provenance.json");
const ledger = readJson(".uchit/engineering-ledger.json");
const rollback = readJson(".uchit/rollback.json");
const staging = readJson(".uchit/staging.json");
const merge = readJson(".uchit/merge-readiness.json");
const postMerge = readJson(".uchit/post-merge-continuation.json");
const completion = readJson(".uchit/ledger-completion.json");

assert.equal(autonomy.autoMergeEnabled, false, "autonomy auto-merge must remain disabled");
assert.equal(dispatcher.enabled, false, "dispatcher must remain dormant");
assert.equal(merge.mergeExecutionEnabled, false, "merge execution must remain disabled");
assert.equal(merge.autoMergeEnabled, false, "merge auto-execution must remain disabled");
assert.equal(postMerge.executionEnabled, false, "post-merge continuation execution must remain disabled");
assert.equal(completion.completionExecutionEnabled, false, "Ledger completion execution must remain disabled");
assert.equal(ledger.writeExecutionEnabled, false, "Engineering Ledger writer must remain contract-only");
assert.equal(rollback.executionEnabled, false, "rollback execution must remain disabled");
assert.equal(staging.executionEnabled, false, "staging execution must remain disabled");
assert.equal(merge.invariants.mergeDoesNotEqualDone, true);
assert.equal(postMerge.invariants.doneCannotBeSetFromPrMergeEventAlone, true);
assert.equal(completion.invariants.doneRequiresVerifiedOutcome, true);
assert.equal(ledger.invariants.doneRequiresVerifiedOutcome, true);
assert.equal(provenance.invariants.implementerCannotMergeOwnPr, true);

function hasEvidence(value) {
  return value === true || (typeof value === "string" && value.length > 0);
}

function mergeReady(evidence) {
  const required = merge.requiredEvidence;
  if (!required.every((key) => evidence[key] === true)) return false;
  if (evidence.riskClass === "R3") return false;
  if (evidence.riskClass === "R2") {
    return merge.r2AdditionalEvidence.every((key) => evidence[key] === true);
  }
  return merge.allowedRiskForFutureAutoMerge.includes(evidence.riskClass);
}

function doneReady(record) {
  if (!completion.allowedProductionOutcomes.includes(record.productionOutcome)) return false;
  if (!hasEvidence(record.mergeSha)) return false;
  if (record.implementerIdentity === record.reviewerIdentity) return false;
  const required = record.deployingChange === true
    ? postMerge.deployingChangeCompletionRequires
    : postMerge.nonDeployingChangeCompletionRequires;
  if (!required.every((key) => hasEvidence(record[key]))) return false;
  if (record.riskClass === "R2" && !hasEvidence(record.ownerApprovalReference)) return false;
  return true;
}

const baseMergeEvidence = {
  taskPacketQualityGatePassed: true,
  claimIdentityCurrent: true,
  branchIsolationValid: true,
  prProvenanceComplete: true,
  diffRiskRecalculated: true,
  independentReviewApproved: true,
  policyGatePassed: true,
  releaseGatePassed: true,
  requiredDomainTestsPassed: true,
  stagingPassedWhenRequired: true,
  allReviewThreadsResolved: true,
  noFailedRequiredCheck: true,
  headShaMatchesReviewedCommit: true,
  baseIsCurrentEnoughForPolicy: true,
  riskClass: "R1"
};

assert.equal(mergeReady(baseMergeEvidence), true, "complete R1 evidence should be merge-ready in dry run");
assert.equal(mergeReady({ ...baseMergeEvidence, independentReviewApproved: false }), false, "missing review must block merge readiness");
assert.equal(mergeReady({ ...baseMergeEvidence, headShaMatchesReviewedCommit: false }), false, "stale reviewed SHA must block merge readiness");
assert.equal(mergeReady({ ...baseMergeEvidence, riskClass: "R2" }), false, "R2 without owner approval must block merge readiness");
assert.equal(mergeReady({ ...baseMergeEvidence, riskClass: "R2", ownerApprovalRecorded: true, protectedDecisionReferenceRecorded: true }), true, "R2 with protected approval evidence may become merge-ready but is never auto-merged by this contract");
assert.equal(mergeReady({ ...baseMergeEvidence, riskClass: "R3" }), false, "R3 cannot be merge-ready autonomously");

const nonDeployDone = {
  mergeSha: "abc123",
  implementerIdentity: "codex-implementer",
  reviewerIdentity: "independent-reviewer",
  riskClass: "R1",
  deployingChange: false,
  mergeShaRecorded: true,
  requiredChecksRecorded: true,
  independentReviewRecorded: true,
  productionImpactClassifiedNone: true,
  productionOutcome: "NO_PRODUCTION_IMPACT"
};
assert.equal(doneReady(nonDeployDone), true, "verified non-deploying change may complete");
assert.equal(doneReady({ ...nonDeployDone, mergeSha: "" }), false, "missing merge SHA must block DONE");
assert.equal(doneReady({ ...nonDeployDone, reviewerIdentity: "codex-implementer" }), false, "self-reviewed work must block DONE");

const deployDone = {
  mergeSha: "def456",
  implementerIdentity: "codex-implementer",
  reviewerIdentity: "independent-reviewer",
  riskClass: "R1",
  deployingChange: true,
  mergeShaRecorded: true,
  deploymentReleaseIdRecorded: "release-1",
  deployedShaMatchesMergeSha: true,
  postDeploySmokePassed: true,
  healthCheckPassed: true,
  authBoundaryCheckPassed: true,
  founderBootstrapCheckPassed: true,
  integrityCheckPassed: true,
  productionOutcomeRecorded: true,
  productionOutcome: "VERIFIED_HEALTHY"
};
assert.equal(doneReady(deployDone), true, "verified deploying change may complete");
assert.equal(doneReady({ ...deployDone, postDeploySmokePassed: false }), false, "failed/missing post-deploy smoke must block DONE");
assert.equal(doneReady({ ...deployDone, riskClass: "R2" }), false, "R2 completion requires owner approval reference");
assert.equal(doneReady({ ...deployDone, riskClass: "R2", ownerApprovalReference: "decision-123" }), true, "R2 completion may close only with approval traceability");

console.log("# Uchit Merge / Ledger Completion Gate");
console.log("Merge execution: DISABLED");
console.log("Auto-merge: DISABLED");
console.log("Post-merge continuation execution: DISABLED");
console.log("Ledger completion execution: DISABLED");
console.log("MERGED != DONE: ENFORCED");
console.log("Result: PASS");
