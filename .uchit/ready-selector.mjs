import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const config = readJson(".uchit/ready-selector.json");

const priorityRank = new Map(config.priorityOrder.map((value, index) => [value, index]));

function dependencyReady(ticket) {
  return ticket.dependenciesDone === true;
}

function packetReady(ticket) {
  return ticket.taskPacketQualityGatePassed === true;
}

function conflictFree(ticket, activeConflictDomains) {
  const domains = Array.isArray(ticket.conflictDomains) ? ticket.conflictDomains : [];
  return domains.every((domain) => !activeConflictDomains.has(domain));
}

function autonomousRiskAllowed(ticket) {
  return config.allowedAutonomousRisk.includes(ticket.riskClass);
}

export function isReadyCandidate(ticket, activeConflictDomains = new Set()) {
  if (!config.eligibleStatuses.includes(ticket.status)) return false;
  if (config.blockedStatuses.includes(ticket.status)) return false;
  if (!dependencyReady(ticket)) return false;
  if (!packetReady(ticket)) return false;
  if (!conflictFree(ticket, activeConflictDomains)) return false;
  if (!autonomousRiskAllowed(ticket)) return false;
  if (ticket.quarantined === true) return false;
  if (ticket.awaitingOwnerDecision === true) return false;
  return true;
}

export function selectNextReady(tickets, active = {}) {
  const activeConflictDomains = new Set(active.conflictDomains ?? []);
  const activeBuilds = Number(active.activeBuilds ?? 0);
  if (activeBuilds >= config.concurrency.maxActiveBuildsWhenActivated) return null;

  const eligible = tickets.filter((ticket) => isReadyCandidate(ticket, activeConflictDomains));
  eligible.sort((a, b) => {
    const priority = (priorityRank.get(a.priority) ?? 999) - (priorityRank.get(b.priority) ?? 999);
    if (priority !== 0) return priority;

    const severity = Number(b.severityScore ?? 0) - Number(a.severityScore ?? 0);
    if (severity !== 0) return severity;

    const unlock = Number(b.dependencyUnlockScore ?? 0) - Number(a.dependencyUnlockScore ?? 0);
    if (unlock !== 0) return unlock;

    const created = String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? ""));
    if (created !== 0) return created;

    return String(a.ticketId).localeCompare(String(b.ticketId));
  });

  return eligible[0] ?? null;
}

if (process.argv[1] && process.argv[1].endsWith("ready-selector.mjs")) {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.log("READY selector contract valid. Dry-run only; claim and dispatch execution are disabled.");
  } else {
    const input = readJson(inputPath);
    const selected = selectNextReady(input.tickets ?? [], input.active ?? {});
    console.log(JSON.stringify({ selected }, null, 2));
  }
}
