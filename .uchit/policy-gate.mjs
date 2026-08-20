import fs from "node:fs";
import { execFileSync } from "node:child_process";

const readJson = (path) => JSON.parse(fs.readFileSync(path, "utf8"));
const riskPolicy = readJson(".uchit/risk-policy.json");
const autonomy = readJson(".uchit/autonomy.json");
const testMatrix = readJson(".uchit/test-matrix.json");
const ticketSchema = readJson(".uchit/ticket-schema.json");
const packageJson = readJson("package.json");

const fail = [];
const notes = [];

for (const [name, value] of Object.entries({ riskPolicy, autonomy, testMatrix, ticketSchema })) {
  if (value.version !== 1) fail.push(`${name} must use policy version 1`);
}

if (autonomy.dispatchEnabled || autonomy.autoMergeEnabled || autonomy.autoDeployEnabled || autonomy.repairLoopEnabled) {
  fail.push("Autonomous dispatch/merge/deploy/repair must remain disabled during M0 machine-policy bootstrap.");
}
if (autonomy.r3AutonomousExecutionAllowed !== false) fail.push("R3 autonomous execution must remain prohibited.");
if (autonomy.independentReviewRequired !== true) fail.push("Independent review must remain required.");

const commands = new Set(testMatrix.baseline ?? []);
for (const domain of testMatrix.domains ?? []) for (const command of domain.commands ?? []) commands.add(command);
for (const command of commands) {
  const match = /^pnpm\s+([^\s]+)$/.exec(command);
  if (!match) {
    fail.push(`Unsupported test command format in test matrix: ${command}`);
    continue;
  }
  if (!packageJson.scripts?.[match[1]]) fail.push(`Test matrix references missing package script: ${match[1]}`);
}

if (!Array.isArray(ticketSchema.allowedRisk) || !["R0", "R1", "R2", "R3"].every((r) => ticketSchema.allowedRisk.includes(r))) {
  fail.push("Ticket schema must retain all four risk classes.");
}
if (ticketSchema.rules?.implementerCannotSelfApprove !== true) fail.push("Implementer self-approval prohibition must remain enabled.");
if (ticketSchema.rules?.r3CannotEnterReady !== true) fail.push("R3 tickets must remain unable to enter READY.");

let changed = [];
const baseRef = process.env.GITHUB_BASE_REF;
if (baseRef) {
  const raw = execFileSync("git", ["diff", "--name-status", `origin/${baseRef}...HEAD`], { encoding: "utf8" }).trim();
  changed = raw ? raw.split("\n").map((line) => {
    const parts = line.split("\t");
    return { status: parts[0], path: parts[parts.length - 1] };
  }) : [];
} else {
  notes.push("No GITHUB_BASE_REF present; configuration validation ran without PR path classification.");
}

const startsWithAny = (path, prefixes = []) => prefixes.some((prefix) => path.startsWith(prefix));
const endsWithAny = (path, suffixes = []) => suffixes.some((suffix) => path.endsWith(suffix));
const exact = (path, values = []) => values.includes(path);
const order = new Map((riskPolicy.riskOrder ?? []).map((risk, index) => [risk, index]));
let finalRisk = "R0";
const classifications = [];

for (const item of changed) {
  const path = item.path;
  let risk = riskPolicy.defaultRisk ?? "R1";
  if (exact(path, riskPolicy.r3Exact) || startsWithAny(path, riskPolicy.r3Prefixes) || endsWithAny(path, riskPolicy.r3Suffixes)) risk = "R3";
  else if (exact(path, riskPolicy.r2Exact) || startsWithAny(path, riskPolicy.r2Prefixes)) risk = "R2";
  else if (startsWithAny(path, riskPolicy.r0Prefixes)) risk = "R0";

  if (item.status.startsWith("D") && riskPolicy.protectedGovernanceFiles?.includes(path)) {
    risk = "R3";
    fail.push(`Protected governance file cannot be deleted autonomously: ${path}`);
  }
  if (risk === "R3") fail.push(`R3 path violation: ${path}`);

  classifications.push({ ...item, risk });
  if ((order.get(risk) ?? 0) > (order.get(finalRisk) ?? 0)) finalRisk = risk;
}

const summary = [
  "# Uchit Policy Gate",
  "",
  `**Calculated PR risk:** ${finalRisk}`,
  `**Autonomous dispatch:** ${autonomy.dispatchEnabled ? "ENABLED" : "DISABLED"}`,
  `**Auto-merge:** ${autonomy.autoMergeEnabled ? "ENABLED" : "DISABLED"}`,
  "",
  "## Changed paths",
  ...(classifications.length ? classifications.map((item) => `- ${item.risk} · ${item.status} · \`${item.path}\``) : ["- No PR paths detected"]),
  "",
  "## Result",
  ...(fail.length ? fail.map((message) => `- BLOCK: ${message}`) : ["- PASS: policy configuration is valid and no R3 path violation was detected."]),
  ...notes.map((message) => `- NOTE: ${message}`),
  "",
  finalRisk === "R2" ? "R2 means protected review/approval policy applies; this gate does not authorize autonomous merge or deployment." : ""
].join("\n");

console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
if (fail.length) process.exit(1);
