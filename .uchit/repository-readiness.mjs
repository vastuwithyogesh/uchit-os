import fs from "node:fs";

const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
if (!repo) throw new Error("GITHUB_REPOSITORY is required");

const requirements = JSON.parse(fs.readFileSync(new URL("./repository-requirements.json", import.meta.url), "utf8"));
const autonomy = JSON.parse(fs.readFileSync(new URL("./autonomy.json", import.meta.url), "utf8"));

const headers = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  ...(token ? { Authorization: `Bearer ${token}` } : {})
};

async function github(path) {
  const response = await fetch(`https://api.github.com/repos/${repo}${path}`, { headers });
  if (!response.ok) throw new Error(`GitHub API ${path} returned ${response.status}`);
  return response.json();
}

const repository = await github("");
const branch = await github(`/branches/${requirements.defaultBranch}`);

const checks = {
  repositoryPrivate: repository.private === true,
  defaultBranchCorrect: repository.default_branch === requirements.defaultBranch,
  mainProtected: branch.protected === true
};

const ready = Object.values(checks).every(Boolean);
const status = ready ? "GO" : "NO-GO";

console.log("# Uchit Repository Readiness");
console.log(`Repository: ${repo}`);
console.log(`Status: ${status}`);
console.log(`Repository private: ${checks.repositoryPrivate ? "PASS" : "FAIL"}`);
console.log(`Default branch ${requirements.defaultBranch}: ${checks.defaultBranchCorrect ? "PASS" : "FAIL"}`);
console.log(`Main protected: ${checks.mainProtected ? "PASS" : "FAIL"}`);
console.log(`Autonomous dispatch: ${autonomy.dispatchEnabled ? "ENABLED" : "DISABLED"}`);

if (!ready && autonomy.dispatchEnabled) {
  console.error("Autonomous dispatch is enabled while repository governance prerequisites are not satisfied.");
  process.exit(1);
}

if (!ready) {
  console.log("NO-GO is informational while autonomous dispatch remains disabled.");
}
