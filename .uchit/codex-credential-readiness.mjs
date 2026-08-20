import fs from "node:fs";

const autonomy = JSON.parse(fs.readFileSync(new URL("./autonomy.json", import.meta.url), "utf8"));
const dispatch = JSON.parse(fs.readFileSync(new URL("./codex-dispatch-envelope.json", import.meta.url), "utf8"));

const key = process.env.OPENAI_API_KEY ?? "";
const credentialPresent = key.trim().length > 0;
const dispatchDisabled = autonomy.dispatchEnabled === false && dispatch.executionEnabled === false;

const lines = [
  "# Uchit Codex Credential Readiness",
  `OPENAI_API_KEY secret: ${credentialPresent ? "PRESENT" : "MISSING"}`,
  "Secret value exposure: FORBIDDEN",
  `Autonomous dispatch: ${autonomy.dispatchEnabled ? "ENABLED" : "DISABLED"}`,
  `Codex implementation execution: ${dispatch.executionEnabled ? "ENABLED" : "DISABLED"}`,
  "Provider execution probe: NOT_RUN",
  `Credential-binding readiness: ${credentialPresent ? "PRESENT_NOT_PROVIDER_VERIFIED" : "NO-GO"}`
];

for (const line of lines) console.log(line);

if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
}

if (!dispatchDisabled) {
  console.error("Credential probe must not run with autonomous/Codex implementation execution enabled before activation readiness.");
  process.exit(1);
}

if (!credentialPresent) {
  console.log("NO-GO is informational while autonomous execution remains disabled.");
}
