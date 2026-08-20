import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { selectNextReady } from "./ready-selector.mjs";

const root = process.cwd();
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));

const autonomy = readJson(".uchit/autonomy.json");
const dispatcher = readJson(".uchit/dispatcher.json");
const ledger = readJson(".uchit/engineering-ledger.json");
const packet = readJson(".uchit/task-packet.json");
const selector = readJson(".uchit/ready-selector.json");

assert.equal(autonomy.dispatchEnabled, false, "autonomous dispatch must remain disabled during M0 contract bootstrap");
assert.equal(dispatcher.enabled, false, "dispatcher execution must remain disabled");
assert.equal(dispatcher.mode, "dormant", "dispatcher must remain dormant");
assert.equal(ledger.writeExecutionEnabled, false, "Engineering Ledger writer must remain contract-only");
assert.equal(packet.generationEnabled, false, "Task Packet generation must remain contract-only");
assert.equal(selector.claimExecutionEnabled, false, "READY selector cannot claim work yet");
assert.equal(selector.dispatchExecutionEnabled, false, "READY selector cannot dispatch work yet");
assert.equal(ledger.appendOnly, true, "Engineering Ledger must be append-only");
assert.equal(ledger.invariants.implementerCannotBeSoleReviewer, true);
assert.equal(ledger.invariants.riskCannotDowngradeWithinTask, true);
assert.equal(packet.qualityGate.authorityAmbiguityBlocksReady, true);
assert.equal(packet.qualityGate.methodologyAmbiguityBlocksReady, true);
assert.equal(selector.invariants.selectorCannotPromoteBacklogToReady, true);
assert.equal(selector.invariants.selectorCannotChangeTicketRisk, true);
assert.equal(selector.invariants.selectorCannotClaimWhileDispatchDisabled, true);
assert.deepEqual(selector.allowedAutonomousRisk, ["R0", "R1"]);
assert.equal(
  selector.concurrency.maxActiveBuildsWhenActivated,
  dispatcher.maxConcurrentBuilds,
  "READY selector concurrency must match the canonical dispatcher contract"
);

const tickets = [
  {
    ticketId: "UCHIT-100",
    status: "READY",
    priority: "P1",
    riskClass: "R2",
    dependenciesDone: true,
    taskPacketQualityGatePassed: true,
    conflictDomains: [],
    severityScore: 100,
    dependencyUnlockScore: 100,
    createdAt: "2026-08-01T00:00:00Z"
  },
  {
    ticketId: "UCHIT-101",
    status: "READY",
    priority: "P1",
    riskClass: "R1",
    dependenciesDone: true,
    taskPacketQualityGatePassed: true,
    conflictDomains: [],
    severityScore: 8,
    dependencyUnlockScore: 3,
    createdAt: "2026-08-02T00:00:00Z"
  },
  {
    ticketId: "UCHIT-102",
    status: "READY",
    priority: "P2",
    riskClass: "R1",
    dependenciesDone: true,
    taskPacketQualityGatePassed: true,
    conflictDomains: [],
    severityScore: 10,
    dependencyUnlockScore: 9,
    createdAt: "2026-08-01T00:00:00Z"
  },
  {
    ticketId: "UCHIT-103",
    status: "READY",
    priority: "P0",
    riskClass: "R1",
    dependenciesDone: false,
    taskPacketQualityGatePassed: true,
    conflictDomains: [],
    severityScore: 10,
    dependencyUnlockScore: 10,
    createdAt: "2026-07-01T00:00:00Z"
  },
  {
    ticketId: "UCHIT-104",
    status: "READY",
    priority: "P0",
    riskClass: "R1",
    dependenciesDone: true,
    taskPacketQualityGatePassed: true,
    conflictDomains: ["evaluation"],
    severityScore: 10,
    dependencyUnlockScore: 10,
    createdAt: "2026-07-01T00:00:00Z"
  }
];

const selected = selectNextReady(tickets, { activeBuilds: 0, conflictDomains: ["evaluation"] });
assert.equal(selected?.ticketId, "UCHIT-101", "selector must deterministically choose the highest eligible autonomous ticket");

const noneAtCapacity = selectNextReady(tickets, { activeBuilds: selector.concurrency.maxActiveBuildsWhenActivated, conflictDomains: [] });
assert.equal(noneAtCapacity, null, "selector must idle at concurrency capacity");

console.log("# Uchit Orchestration Contract Gate");
console.log("Engineering Ledger: CONTRACT_ONLY");
console.log("Task Packet generation: DISABLED");
console.log("READY selector: DRY_RUN_ONLY");
console.log(`Dry-run selected fixture: ${selected.ticketId}`);
console.log("Claim execution: DISABLED");
console.log("Codex dispatch: DISABLED");
console.log("Result: PASS");
