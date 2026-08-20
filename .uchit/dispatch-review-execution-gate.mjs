import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));

const autonomy = readJson(".uchit/autonomy.json");
const dispatcher = readJson(".uchit/dispatcher.json");
const taskPacket = readJson(".uchit/task-packet.json");
const claim = readJson(".uchit/claim-lease.json");
const isolation = readJson(".uchit/isolation.json");
const provenance = readJson(".uchit/pr-provenance.json");
const reviewer = readJson(".uchit/reviewer.json");
const dispatch = readJson(".uchit/codex-dispatch-envelope.json");
const reviewExec = readJson(".uchit/reviewer-execution.json");

assert.equal(autonomy.dispatchEnabled, false, "autonomous dispatch must remain disabled");
assert.equal(dispatcher.enabled, false, "dispatcher must remain dormant");
assert.equal(dispatch.executionEnabled, false, "Codex execution must remain disabled");
assert.equal(dispatch.credentialBindingConfigured, false, "Codex credentials must not be configured by this bootstrap PR");
assert.equal(reviewer.active, false, "independent reviewer must remain inactive until execution is explicitly activated");
assert.equal(reviewExec.executionEnabled, false, "review execution must remain disabled");
assert.equal(reviewExec.providerConfigured, false, "review provider must remain unconfigured");
assert.equal(reviewExec.reviewIdentityConfigured, false, "review identity must remain unconfigured");
assert.equal(claim.claimExecutionEnabled, false, "claim execution must remain disabled");
assert.equal(isolation.branchCreationExecutionEnabled, false, "branch execution must remain disabled");
assert.equal(provenance.provenanceWritingEnabled, false, "PR provenance writing must remain disabled");
assert.equal(taskPacket.generationEnabled, false, "Task Packet generation must remain disabled");
assert.deepEqual(dispatch.allowedRiskClasses, ["R0", "R1"]);
assert.deepEqual(dispatch.protectedRiskClasses, ["R2"]);
assert.deepEqual(dispatch.prohibitedRiskClasses, ["R3"]);
assert.equal(reviewExec.mustBeDistinctFromImplementer, true);
assert.deepEqual(reviewExec.allowedDecisions, reviewer.allowedDecisions);
assert.ok(reviewExec.requiredInputs.includes("claimId"));
assert.ok(reviewExec.requiredInputs.includes("headSha"));
assert.ok(reviewExec.requiredInputs.includes("changedPaths"));
assert.ok(dispatch.requiredEnvelopeFields.includes("forbiddenScope"));
assert.ok(dispatch.requiredEnvelopeFields.includes("stopConditions"));
assert.ok(dispatch.stopConditions.includes("claim lease is stale or lost"));
assert.ok(dispatch.forbidden.includes("direct push to main"));
assert.ok(reviewExec.forbidden.includes("reviewer equals implementer"));

function validateDispatchEnvelope(envelope, currentClaim) {
  if (!dispatch.allowedRiskClasses.includes(envelope.riskClass)) return false;
  if (envelope.ticketId !== currentClaim.ticketId) return false;
  if (envelope.taskPacketId !== currentClaim.taskPacketId) return false;
  if (envelope.claimId !== currentClaim.claimId) return false;
  if (envelope.claimVersion !== currentClaim.claimVersion) return false;
  if (envelope.baseSha !== currentClaim.baseSha) return false;
  if (envelope.branch !== currentClaim.branch) return false;
  if (!/^agent\/UCHIT-\d+-[a-z0-9-]+$/.test(envelope.branch)) return false;
  if (!Array.isArray(envelope.forbiddenScope) || envelope.forbiddenScope.length === 0) return false;
  if (!Array.isArray(envelope.requiredTests) || envelope.requiredTests.length === 0) return false;
  return true;
}

function validateReviewInput(input) {
  if (!reviewExec.allowedDecisions.includes(input.proposedDecision)) return false;
  if (input.reviewerIdentity === input.implementerIdentity) return false;
  if (!Array.isArray(input.changedPaths) || input.changedPaths.length === 0) return false;
  if (!Array.isArray(input.testResults) || input.testResults.length === 0) return false;
  if (!input.headSha || !input.baseSha || !input.claimId || !input.taskPacketId) return false;
  return true;
}

const activeClaim = {
  ticketId: "UCHIT-201",
  taskPacketId: "TP-201",
  claimId: "CLM-201",
  claimVersion: 3,
  baseSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  branch: "agent/UCHIT-201-safe-copy-fix"
};

const goodEnvelope = {
  ticketId: "UCHIT-201",
  taskPacketId: "TP-201",
  claimId: "CLM-201",
  claimVersion: 3,
  baseSha: activeClaim.baseSha,
  branch: activeClaim.branch,
  riskClass: "R1",
  forbiddenScope: ["lib/auth.ts"],
  requiredTests: ["pnpm test:release"]
};

assert.equal(validateDispatchEnvelope(goodEnvelope, activeClaim), true, "valid R1 dispatch envelope should pass dry-run validation");
assert.equal(validateDispatchEnvelope({ ...goodEnvelope, claimVersion: 2 }, activeClaim), false, "stale claim version must fail");
assert.equal(validateDispatchEnvelope({ ...goodEnvelope, branch: "agent/UCHIT-999-wrong" }, activeClaim), false, "branch identity drift must fail");
assert.equal(validateDispatchEnvelope({ ...goodEnvelope, riskClass: "R2" }, activeClaim), false, "R2 dispatch must fail autonomous envelope validation");
assert.equal(validateDispatchEnvelope({ ...goodEnvelope, riskClass: "R3" }, activeClaim), false, "R3 dispatch must fail autonomous envelope validation");

const goodReview = {
  proposedDecision: "APPROVE",
  implementerIdentity: "codex-implementer-1",
  reviewerIdentity: "independent-reviewer-1",
  claimId: "CLM-201",
  taskPacketId: "TP-201",
  baseSha: activeClaim.baseSha,
  headSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  changedPaths: ["components/example.tsx"],
  testResults: ["release:pass"]
};

assert.equal(validateReviewInput(goodReview), true, "independent review fixture should pass");
assert.equal(validateReviewInput({ ...goodReview, reviewerIdentity: goodReview.implementerIdentity }), false, "self-review must fail");
assert.equal(validateReviewInput({ ...goodReview, changedPaths: [] }), false, "review without changed-path provenance must fail");

console.log("# Uchit Dispatch + Independent Review Execution Contract Gate");
console.log("Codex execution: DISABLED");
console.log("Codex credentials: NOT CONFIGURED");
console.log("Independent review execution: DISABLED");
console.log("Review provider/identity: NOT CONFIGURED");
console.log("Self-review fixture: REJECTED");
console.log("Stale/R2/R3 dispatch fixtures: REJECTED");
console.log("Result: PASS");
