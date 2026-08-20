import { readFileSync } from "node:fs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const staging = readJson(".uchit/staging.json");
const hosting = readJson(".openai/hosting.json");
const autonomy = readJson(".uchit/autonomy.json");

const fail = (message) => {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
};

if (staging.provider !== "OpenAI Sites") fail("staging provider must remain OpenAI Sites unless an approved architecture decision changes it");
if (staging.productionProjectId !== hosting.project_id) fail("staging contract productionProjectId must match canonical .openai/hosting.json");
if (staging.executionEnabled !== false) fail("staging execution must remain disabled during contract bootstrap");
if (staging.previewDeploymentEnabled !== false) fail("preview deployment must remain disabled during contract bootstrap");
if (staging.postDeploySmokeEnabled !== false) fail("post-deploy smoke execution must remain disabled during contract bootstrap");
if (staging.productionMutationAllowed !== false) fail("staging/smoke contract must not permit production mutation");
if (staging.allowProductionDataInPreview !== false) fail("preview environments must never use production data");
if (staging.allowProductionSecretsInPreview !== false) fail("preview environments must never use production secrets");
if (staging.seededSyntheticDataOnly !== true) fail("preview data must be seeded/synthetic");
if (staging.requireIsolatedPreviewPerPr !== true) fail("isolated preview per PR is required before activation");
if (staging.requireNonProductionBindings !== true) fail("non-production bindings are required before activation");

for (const gate of ["Policy gate", "Release gate", "Repository readiness", "Reviewer dispatcher gate", "Rollback contract gate"]) {
  if (!staging.requiredPreDeployGates.includes(gate)) fail(`missing required pre-deploy gate: ${gate}`);
}

for (const token of ["single-floor Golden Flow", "multi-floor Golden Flow", "INTERNAL_COMPLIMENTARY", "negative security"]) {
  if (!staging.requiredStagingVerification.some((item) => item.includes(token))) fail(`missing staging verification: ${token}`);
}

if (autonomy.dispatchEnabled !== false) fail("Codex dispatch must remain disabled while staging execution is contract-only");

if (!process.exitCode) {
  console.log("# Uchit Staging + Smoke Contract Gate");
  console.log("PASS: staging and smoke contract is internally consistent and remains dormant.");
  console.log(`Production Sites project: ${staging.productionProjectId}`);
  console.log("Preview deployment: DISABLED");
  console.log("Post-deploy smoke execution: DISABLED");
  console.log("Production mutation: FORBIDDEN");
}
