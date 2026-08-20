import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { branchNameFor, evaluateClaim } from "./claim-lease.mjs";

const root = process.cwd();
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));

const autonomy = readJson(".uchit/autonomy.json");
const dispatcher = readJson(".uchit/dispatcher.json");
const selector = readJson(".uchit/ready-selector.json");
const claim = readJson(".uchit/claim-lease.json");
const isolation = readJson(".uchit/isolation.json");
const provenance = readJson(".uchit/pr-provenance.json");
const ledger = readJson(".uchit/engineering-ledger.json");

assert.equal(autonomy.dispatchEnabled, false, "autonomous dispatch must remain disabled");
assert.equal(dispatcher.enabled, false, "dispatcher must remain disabled");
assert.equal(claim.claimExecutionEnabled, false, "claim execution must remain disabled");
assert.equal(claim.leaseMutationEnabled, false, "lease mutation must remain disabled");
assert.equal(isolation.branchCreationExecutionEnabled, false, "branch creation execution must remain disabled");
assert.equal(isolation.worktreeCreationExecutionEnabled, false, "worktree creation execution must remain disabled");
assert.equal(provenance.provenanceWritingEnabled, false, "PR provenance writing must remain disabled");
assert.equal(dispatcher.claimLeaseMinutes, 30, "canonical dispatcher lease must remain 30 minutes");
assert.equal(claim.leaseMinutesSource, ".uchit/dispatcher.json#claimLeaseMinutes");
assert.deepEqual(selector.allowedAutonomousRisk, ["R0", "R1"]);
assert.equal(isolation.oneTaskPerBranch, true);
assert.equal(isolation.oneTaskPerWorktree, true);
assert.equal(provenance.invariants.implementerCannotApproveOwnPr, true);
assert.equal(provenance.invariants.implementerCannotMergeOwnPr, true);
assert.ok(ledger.requiredLifecycleFields.includes("branch"), "ledger must record branch provenance");
assert.ok(ledger.requiredLifecycleFields.includes("baseSha"), "ledger must record claim base SHA");
assert.ok(ledger.requiredLifecycleFields.includes("headSha"), "ledger must record reviewed head SHA");

const baseTicket = {
  ticketId: "UCHIT-201",
  status: "READY",
  riskClass: "R1",
  dependenciesDone: true,
  taskPacketQualityGatePassed: true,
  conflictDomains: ["reporting"]
};

const eligible = evaluateClaim(baseTicket, {
  activeClaim: false,
  expectedTicketVersion: 4,
  actualTicketVersion: 4,
  activeConflictDomains: []
});
assert.equal(eligible.eligible, true, "valid R1 READY ticket should be claim-eligible in dry run");
assert.equal(eligible.leaseMinutes, dispatcher.claimLeaseMinutes);

const stale = evaluateClaim(baseTicket, {
  activeClaim: false,
  expectedTicketVersion: 4,
  actualTicketVersion: 5,
  activeConflictDomains: []
});
assert.equal(stale.eligible, false);
assert.ok(stale.reasons.includes("STALE_TICKET_VERSION"));

const duplicate = evaluateClaim(baseTicket, {
  activeClaim: true,
  activeLeaseExpired: false,
  expectedTicketVersion: 4,
  actualTicketVersion: 4,
  activeConflictDomains: []
});
assert.equal(duplicate.eligible, false);
assert.ok(duplicate.reasons.includes("ACTIVE_CLAIM_EXISTS"));

const protectedTicket = { ...baseTicket, riskClass: "R2" };
const protectedClaim = evaluateClaim(protectedTicket, {
  activeClaim: false,
  expectedTicketVersion: 4,
  actualTicketVersion: 4,
  activeConflictDomains: []
});
assert.equal(protectedClaim.eligible, false);
assert.ok(protectedClaim.reasons.includes("RISK_NOT_AUTONOMOUS"));

const conflict = evaluateClaim(baseTicket, {
  activeClaim: false,
  expectedTicketVersion: 4,
  actualTicketVersion: 4,
  activeConflictDomains: ["reporting"]
});
assert.equal(conflict.eligible, false);
assert.ok(conflict.reasons.includes("CONFLICT_DOMAIN:reporting"));

assert.equal(branchNameFor("UCHIT-201", "Report Card polish"), "agent/UCHIT-201-report-card-polish");

console.log("# Uchit Claim / Isolation / Provenance Gate");
console.log("Claim evaluation: DRY_RUN_ONLY");
console.log(`Lease source: dispatcher (${dispatcher.claimLeaseMinutes} minutes)`);
console.log("Branch/worktree creation: DISABLED");
console.log("PR provenance writing: DISABLED");
console.log("Duplicate/stale/protected/conflict fixtures: REJECTED");
console.log("Codex dispatch: DISABLED");
console.log("Result: PASS");
