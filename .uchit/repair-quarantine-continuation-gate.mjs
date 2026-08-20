import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { selectNextReady } from "./ready-selector.mjs";

const root = process.cwd();
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));

const autonomy = readJson(".uchit/autonomy.json");
const dispatcher = readJson(".uchit/dispatcher.json");
const repair = readJson(".uchit/repair-loop.json");
const quarantine = readJson(".uchit/quarantine.json");
const continuation = readJson(".uchit/continuation.json");
const selector = readJson(".uchit/ready-selector.json");

assert.equal(autonomy.dispatchEnabled, false, "autonomous dispatch must remain disabled");
assert.equal(dispatcher.enabled, false, "dispatcher must remain dormant");
assert.equal(repair.repairExecutionEnabled, false, "repair execution must remain disabled");
assert.equal(quarantine.quarantineExecutionEnabled, false, "quarantine mutation must remain disabled");
assert.equal(continuation.continuationExecutionEnabled, false, "continuation mutation must remain disabled");
assert.equal(dispatcher.maxRepairAttempts, 3, "canonical repair budget must remain three attempts");
assert.equal(repair.maxRepairAttemptsSource, ".uchit/dispatcher.json#maxRepairAttempts");
assert.equal(repair.invariants.repairCannotResetAttemptCounter, true);
assert.equal(repair.invariants.repairCannotDowngradeRisk, true);
assert.equal(repair.invariants.repairCannotExpandScope, true);
assert.equal(repair.invariants.repairCannotWeakenTests, true);
assert.equal(quarantine.resourceRelease.releaseActiveBuildSlot, true);
assert.equal(quarantine.resourceRelease.preserveBranchAndEvidence, true);
assert.equal(quarantine.invariants.quarantineCannotBlockUnrelatedEligibleWork, true);
assert.equal(continuation.continuationRules.oneBlockedTicketDoesNotFreezeQueue, true);
assert.equal(continuation.continuationRules.noEligibleWorkMeansIdle, true);
assert.equal(continuation.continuationRules.globalStopConditionMeansNoNewClaims, true);

function nextFailureState({ trigger, repairAttemptsUsed }) {
  if (repair.nonRepairableTriggers.includes(trigger)) return "QUARANTINED";
  if (!repair.repairableTriggers.includes(trigger)) return "QUARANTINED";
  if (repairAttemptsUsed >= dispatcher.maxRepairAttempts) return "QUARANTINED";
  return "REPAIRING";
}

assert.equal(nextFailureState({ trigger: "REQUEST_CHANGES", repairAttemptsUsed: 0 }), "REPAIRING");
assert.equal(nextFailureState({ trigger: "VERIFY_FAILED", repairAttemptsUsed: 2 }), "REPAIRING");
assert.equal(nextFailureState({ trigger: "VERIFY_FAILED", repairAttemptsUsed: 3 }), "QUARANTINED");
assert.equal(nextFailureState({ trigger: "PRODUCT_AMBIGUITY", repairAttemptsUsed: 0 }), "QUARANTINED");
assert.equal(nextFailureState({ trigger: "ESCALATE_RISK_TO_R2_OR_R3", repairAttemptsUsed: 0 }), "QUARANTINED");

const queue = [
  {
    ticketId: "UCHIT-201",
    status: "QUARANTINED",
    priority: "P0",
    riskClass: "R1",
    dependenciesDone: true,
    taskPacketQualityGatePassed: true,
    conflictDomains: [],
    severityScore: 10,
    dependencyUnlockScore: 10,
    createdAt: "2026-08-01T00:00:00Z"
  },
  {
    ticketId: "UCHIT-202",
    status: "READY",
    priority: "P1",
    riskClass: "R1",
    dependenciesDone: true,
    taskPacketQualityGatePassed: true,
    conflictDomains: ["reporting"],
    severityScore: 8,
    dependencyUnlockScore: 5,
    createdAt: "2026-08-02T00:00:00Z"
  },
  {
    ticketId: "UCHIT-203",
    status: "READY",
    priority: "P2",
    riskClass: "R1",
    dependenciesDone: true,
    taskPacketQualityGatePassed: true,
    conflictDomains: [],
    severityScore: 5,
    dependencyUnlockScore: 2,
    createdAt: "2026-08-03T00:00:00Z"
  }
];

const afterQuarantine = selectNextReady(queue, { activeBuilds: 0, conflictDomains: [] });
assert.equal(afterQuarantine?.ticketId, "UCHIT-202", "quarantined work must not freeze unrelated READY work");

const reportingBusy = selectNextReady(queue, { activeBuilds: 0, conflictDomains: ["reporting"] });
assert.equal(reportingBusy?.ticketId, "UCHIT-203", "active conflict-domain lock must still be respected");

function continueSelection(tickets, { globalStop = false, activeBuilds = 0, conflictDomains = [] } = {}) {
  if (globalStop) return null;
  return selectNextReady(tickets, { activeBuilds, conflictDomains });
}

assert.equal(continueSelection(queue, { globalStop: true }), null, "global stop must prevent new claims");
assert.equal(continueSelection([], {}), null, "empty eligible queue must remain healthy IDLE");
assert.equal(selector.invariants.idleIsValidWhenNoEligibleWork, true);

console.log("# Uchit Repair / Quarantine / Continuation Gate");
console.log(`Repair budget: ${dispatcher.maxRepairAttempts}`);
console.log("Repair execution: DISABLED");
console.log("Quarantine mutation: DISABLED");
console.log("Continuation mutation: DISABLED");
console.log(`Post-quarantine dry-run next ticket: ${afterQuarantine.ticketId}`);
console.log("Blocked ticket freezes queue: NO");
console.log("Global safety stop blocks new claims: YES");
console.log("Result: PASS");
