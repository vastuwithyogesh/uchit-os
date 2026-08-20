import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const readJson = (file) => JSON.parse(fs.readFileSync(path.resolve(root, file), "utf8"));
const exists = (file) => fs.existsSync(path.resolve(root, file));

const activation = readJson(".uchit/activation-readiness.json");
const certification = readJson(".uchit/buttery-smooth-certification.json");
const autonomy = readJson(".uchit/autonomy.json");
const dispatcher = readJson(".uchit/dispatcher.json");
const codex = readJson(".uchit/codex-dispatch-envelope.json");
const reviewer = readJson(".uchit/reviewer-execution.json");
const claim = readJson(".uchit/claim-lease.json");
const isolation = readJson(".uchit/isolation.json");
const provenance = readJson(".uchit/pr-provenance.json");
const ledger = readJson(".uchit/engineering-ledger.json");
const repair = readJson(".uchit/repair-loop.json");
const quarantine = readJson(".uchit/quarantine.json");
const continuation = readJson(".uchit/continuation.json");
const staging = readJson(".uchit/staging.json");
const rollback = readJson(".uchit/rollback.json");
const merge = readJson(".uchit/merge-readiness.json");
const postMerge = readJson(".uchit/post-merge-continuation.json");
const completion = readJson(".uchit/ledger-completion.json");

const dormantSwitches = {
  autonomyDispatch: autonomy.dispatchEnabled,
  autonomyAutoMerge: autonomy.autoMergeEnabled,
  autonomyAutoDeploy: autonomy.autoDeployEnabled,
  dispatcher: dispatcher.enabled,
  codexExecution: codex.executionEnabled,
  reviewerExecution: reviewer.executionEnabled,
  claimExecution: claim.claimExecutionEnabled,
  leaseMutation: claim.leaseMutationEnabled,
  branchCreation: isolation.branchCreationExecutionEnabled,
  worktreeCreation: isolation.worktreeCreationExecutionEnabled,
  provenanceWriting: provenance.provenanceWritingEnabled,
  ledgerWriting: ledger.writeExecutionEnabled,
  repairExecution: repair.repairExecutionEnabled,
  quarantineExecution: quarantine.quarantineExecutionEnabled,
  continuationExecution: continuation.continuationExecutionEnabled,
  stagingExecution: staging.executionEnabled,
  previewDeployment: staging.previewDeploymentEnabled,
  postDeploySmokeExecution: staging.postDeploySmokeEnabled,
  rollbackExecution: rollback.executionEnabled,
  automaticRollback: rollback.automaticRollbackEnabled,
  mergeExecution: merge.mergeExecutionEnabled,
  contractAutoMerge: merge.autoMergeEnabled,
  postMergeExecution: postMerge.executionEnabled,
  ledgerCompletionExecution: completion.completionExecutionEnabled,
  activationExecution: activation.activationExecutionEnabled,
  certificationExecution: certification.certificationExecutionEnabled
};

for (const [name, value] of Object.entries(dormantSwitches)) {
  assert.equal(value, false, `${name} must remain disabled before controlled activation`);
}

assert.equal(autonomy.r2RequiresOwnerApproval, true);
assert.equal(autonomy.r3AutonomousExecutionAllowed, false);
assert.equal(activation.activationRequiresOwnerApproval, true);
assert.equal(activation.activationRiskClass, "R2");
assert.equal(activation.invariants.autoDeployCannotEnableDuringM0Pilot, true);
assert.equal(certification.requiredCompletedPilotTickets, 10);
assert.equal(certification.certificationRules.certificationRequiresMachineReadableEvidence, true);

const missingContracts = activation.requiredControlPlaneContracts.filter((file) => !exists(file));
assert.deepEqual(missingContracts, [], `missing control-plane contracts: ${missingContracts.join(", ")}`);

const blockers = [];
const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
let repositoryPrivate = false;
let defaultBranchCorrect = false;
let mainProtected = false;
let directPushBlocked = false;
let forcePushBlocked = false;
let branchDeletionBlocked = false;
let requiredChecksEnforced = false;
let missingRequiredContexts = activation.requiredStatusChecks.map((item) => item.context);

if (repo) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
  const github = async (suffix) => {
    const response = await fetch(`https://api.github.com/repos/${repo}${suffix}`, { headers });
    if (!response.ok) throw new Error(`GitHub API ${suffix || "/"} returned ${response.status}`);
    return response.json();
  };

  const repository = await github("");
  const branchName = activation.requiredRepositoryState.defaultBranch;
  const branch = await github(`/branches/${branchName}`);
  repositoryPrivate = repository.private === activation.requiredRepositoryState.private;
  defaultBranchCorrect = repository.default_branch === branchName;
  mainProtected = branch.protected === activation.requiredRepositoryState.mainProtected;

  const contexts = new Set([
    ...(branch.protection?.required_status_checks?.contexts ?? []),
    ...(branch.protection?.required_status_checks?.checks ?? []).map((item) => item.context).filter(Boolean)
  ]);
  missingRequiredContexts = activation.requiredStatusChecks
    .map((item) => item.context)
    .filter((context) => !contexts.has(context));
  requiredChecksEnforced = mainProtected && missingRequiredContexts.length === 0;

  if (mainProtected) {
    try {
      const protection = await github(`/branches/${branchName}/protection`);
      directPushBlocked = protection.required_pull_request_reviews != null;
      forcePushBlocked = protection.allow_force_pushes?.enabled !== true;
      branchDeletionBlocked = protection.allow_deletions?.enabled !== true;
    } catch {
      // Rulesets can mark a branch protected even when the legacy protection endpoint is unavailable.
      // In that case these properties remain unverified and activation stays NO-GO.
    }
  }
} else {
  blockers.push("GITHUB_REPOSITORY unavailable for live readiness verification");
}

if (!repositoryPrivate) blockers.push("repository must be private");
if (!defaultBranchCorrect) blockers.push("default branch must be main");
if (!mainProtected) blockers.push("main must be protected");
if (!directPushBlocked) blockers.push("direct pushes to main must be blocked by PR policy");
if (!forcePushBlocked) blockers.push("force pushes to main must be blocked");
if (!branchDeletionBlocked) blockers.push("main deletion must be blocked");
if (!requiredChecksEnforced) blockers.push(`required status checks not enforced: ${missingRequiredContexts.join(", ") || "unverified"}`);

const technicalEvidenceMissing = Object.entries(activation.requiredTechnicalEvidence)
  .filter(([, value]) => value !== true)
  .map(([key]) => key);
for (const key of technicalEvidenceMissing) blockers.push(`technical evidence missing: ${key}`);

if (activation.requiredTechnicalEvidence.codexCredentialBindingVerified && !codex.credentialBindingConfigured) {
  throw new Error("activation evidence says Codex credentials are verified but Codex contract is not configured");
}
if (activation.requiredTechnicalEvidence.independentReviewerProviderVerified && !reviewer.providerConfigured) {
  throw new Error("activation evidence says reviewer provider is verified but reviewer contract is not configured");
}
if (activation.requiredTechnicalEvidence.independentReviewerIdentityVerified && !reviewer.reviewIdentityConfigured) {
  throw new Error("activation evidence says reviewer identity is verified but reviewer contract is not configured");
}

const activationReady = blockers.length === 0;

if ((autonomy.dispatchEnabled || activation.activationExecutionEnabled) && !activationReady) {
  throw new Error(`autonomous execution enabled while activation readiness is NO-GO: ${blockers.join("; ")}`);
}

let certified = false;
if (certification.certificationState === "CERTIFIED") {
  assert.equal(certification.certificationExecutionEnabled, true, "CERTIFIED requires certification execution to be explicitly enabled");
  assert.equal(activationReady, true, "CERTIFIED requires activation readiness GO");
  const evidencePath = certification.certificationEvidencePath;
  assert.ok(exists(evidencePath), `CERTIFIED requires ${evidencePath}`);
  const evidence = readJson(evidencePath);
  assert.ok(Array.isArray(evidence.completedTickets), "pilot evidence must contain completedTickets[]");
  assert.ok(evidence.completedTickets.length >= certification.requiredCompletedPilotTickets, "pilot must contain at least 10 completed tickets");
  const uniqueTickets = new Set(evidence.completedTickets.map((ticket) => ticket.ticketId));
  assert.ok(uniqueTickets.size >= certification.requiredCompletedPilotTickets, "pilot tickets must be unique");
  for (const ticket of evidence.completedTickets.slice(0, certification.requiredCompletedPilotTickets)) {
    assert.ok(certification.pilotRiskClasses.includes(ticket.riskClass), `pilot ticket ${ticket.ticketId} has ineligible risk`);
    assert.equal(ticket.realUchitTicket, true, `pilot ticket ${ticket.ticketId} must be a real Uchit ticket`);
    assert.equal(ticket.completedCorrectly, true, `pilot ticket ${ticket.ticketId} did not complete correctly`);
    assert.equal(ticket.ledgerComplete, true, `pilot ticket ${ticket.ticketId} lacks complete Ledger evidence`);
    assert.equal(ticket.independentReviewPassed, true, `pilot ticket ${ticket.ticketId} lacks independent review`);
    assert.equal(ticket.requiredChecksPassed, true, `pilot ticket ${ticket.ticketId} lacks required checks`);
    assert.equal(ticket.doneAfterVerifiedOutcome, true, `pilot ticket ${ticket.ticketId} marked DONE too early`);
  }
  for (const [metric, expected] of Object.entries(certification.zeroToleranceMetrics)) {
    assert.equal(evidence.zeroToleranceMetrics?.[metric], expected, `zero-tolerance metric ${metric} must equal ${expected}`);
  }
  for (const [behavior, expected] of Object.entries(certification.requiredSystemBehaviors)) {
    assert.equal(evidence.systemBehaviors?.[behavior], expected, `required system behavior ${behavior} must equal ${expected}`);
  }
  assert.ok(typeof evidence.ownerCertificationApprovalReference === "string" && evidence.ownerCertificationApprovalReference.length > 0, "final certification requires owner approval reference");
  certified = true;
} else {
  assert.ok(["NOT_STARTED", "PILOT_RUNNING", "PILOT_FAILED", "PILOT_COMPLETE_AWAITING_APPROVAL"].includes(certification.certificationState), "invalid certification state");
}

console.log("# Uchit M0 Activation / Certification Gate");
console.log(`Control-plane contracts present: ${missingContracts.length === 0 ? "PASS" : "FAIL"}`);
console.log(`Repository private: ${repositoryPrivate ? "PASS" : "FAIL"}`);
console.log(`Default branch main: ${defaultBranchCorrect ? "PASS" : "FAIL"}`);
console.log(`Main protected: ${mainProtected ? "PASS" : "FAIL"}`);
console.log(`Direct push blocked: ${directPushBlocked ? "PASS" : "FAIL"}`);
console.log(`Force push blocked: ${forcePushBlocked ? "PASS" : "FAIL"}`);
console.log(`Main deletion blocked: ${branchDeletionBlocked ? "PASS" : "FAIL"}`);
console.log(`Required status checks enforced: ${requiredChecksEnforced ? "PASS" : "FAIL"}`);
console.log(`Technical activation evidence: ${technicalEvidenceMissing.length === 0 ? "PASS" : "INCOMPLETE"}`);
console.log(`Activation readiness: ${activationReady ? "GO" : "NO-GO"}`);
console.log(`Buttery-Smooth certification: ${certified ? "CERTIFIED" : certification.certificationState}`);
console.log(`Autonomous dispatch: ${autonomy.dispatchEnabled ? "ENABLED" : "DISABLED"}`);
if (blockers.length) {
  console.log("Activation blockers:");
  for (const blocker of blockers) console.log(`- ${blocker}`);
}
console.log("Result: PASS (diagnostic gate is fail-closed if execution is enabled prematurely)");
