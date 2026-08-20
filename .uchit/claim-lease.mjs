import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const claimConfig = readJson(".uchit/claim-lease.json");
const dispatcher = readJson(".uchit/dispatcher.json");
const selector = readJson(".uchit/ready-selector.json");

export function evaluateClaim(ticket, context = {}) {
  const reasons = [];
  if (ticket.status !== claimConfig.eligibleState) reasons.push("STATE_NOT_READY");
  if (ticket.taskPacketQualityGatePassed !== true) reasons.push("TASK_PACKET_NOT_READY");
  if (ticket.dependenciesDone !== true) reasons.push("DEPENDENCIES_INCOMPLETE");
  if (!selector.allowedAutonomousRisk.includes(ticket.riskClass)) reasons.push("RISK_NOT_AUTONOMOUS");
  if (ticket.quarantined === true) reasons.push("QUARANTINED");
  if (ticket.awaitingOwnerDecision === true) reasons.push("OWNER_DECISION_REQUIRED");
  if (context.activeClaim === true && context.activeLeaseExpired !== true) reasons.push("ACTIVE_CLAIM_EXISTS");
  if (context.expectedTicketVersion !== undefined && context.actualTicketVersion !== context.expectedTicketVersion) reasons.push("STALE_TICKET_VERSION");

  const activeDomains = new Set(context.activeConflictDomains ?? []);
  for (const domain of ticket.conflictDomains ?? []) {
    if (activeDomains.has(domain)) {
      reasons.push(`CONFLICT_DOMAIN:${domain}`);
      break;
    }
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    leaseMinutes: dispatcher.claimLeaseMinutes
  };
}

export function branchNameFor(ticketId, slug) {
  const safeSlug = String(slug ?? "task")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "task";
  return `agent/${ticketId}-${safeSlug}`;
}
