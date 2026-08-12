import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildFounderScorecard } from "../lib/founder-scorecard.ts";
import { getFounderFlowSteps } from "../lib/founder-flow.ts";
import { buildReleaseableFounderPilotFixture, pilotIds } from "../tests/fixtures/founder-pilot-fixture.mjs";

const { state, actor } = buildReleaseableFounderPilotFixture();
const scorecard = buildFounderScorecard(state, actor, pilotIds.clientId, pilotIds.caseId, pilotIds.floorId);
const steps = getFounderFlowSteps(scorecard);
const manifest = {
  manifestVersion: "FE-SYNTHETIC-VISUAL-QA/v1",
  syntheticOnly: true,
  authenticatedOwner: { userId: "synthetic-founder-visual-qa", role: "SUPER_ADMIN", emailDomain: "example.invalid" },
  noWrites: true,
  noExternalCommunication: true,
  context: { clientId: pilotIds.clientId, caseId: pilotIds.caseId, floorId: pilotIds.floorId, floorLabel: scorecard.selectedFloor?.floorLabel ?? "Synthetic floor" },
  viewports: [{ name: "desktop", width: 1440, height: 900 }, { name: "mobile", width: 390, height: 844 }],
  routes: [
    "/",
    "/crm",
    "/lead-pipeline",
    "/clients-cases",
    "/founder/08",
    "/founder/10",
    "/founder/11",
    "/reports",
    "/diagnostics"
  ],
  founderSteps: steps.map((step) => ({ number: step.number, title: step.title, path: step.flowPath, status: step.status })),
  protectedStates: { stageB: "BLOCKED_METHOD_INPUT", clientDelivery: "DEFERRED", liveIntegrations: "DORMANT" },
  reviewRules: ["Do not select files", "Do not click mutation controls", "Do not send messages", "Record console errors and layout overflow only"]
};

const outputPath = resolve("output/visual-qa/founder-synthetic-visual-qa.manifest.json");
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(manifest, null, 2) + "\n", { flag: "w" });
console.log(JSON.stringify({ outputPath, routes: manifest.routes.length, steps: manifest.founderSteps.length, syntheticOnly: manifest.syntheticOnly, noWrites: manifest.noWrites }));
