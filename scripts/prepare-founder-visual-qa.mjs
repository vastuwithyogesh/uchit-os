import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildFounderScorecard } from "../lib/founder-scorecard.ts";
import { getFounderFlowSteps } from "../lib/founder-flow.ts";
import { buildReleaseableFounderPilotFixture, pilotIds } from "../tests/fixtures/founder-pilot-fixture.mjs";

const { state, actor } = buildReleaseableFounderPilotFixture();
const scorecard = buildFounderScorecard(state, actor, pilotIds.clientId, pilotIds.caseId, pilotIds.floorId);
const steps = getFounderFlowSteps(scorecard);
const reviewMatrix = [
  ["/", "Founder home", "context + current step + Continue"],
  ["/crm", "Leads", "table + drawer + one primary action"],
  ["/lead-pipeline", "Lead Pipeline", "canonical move proposal + recovery"],
  ["/clients-cases", "Clients & Cases", "one case card + Continue case"],
  ["/founder/08", "Utility/Shakti evaluation", "one evaluation action + Details"],
  ["/founder/10", "Site analysis", "one site task + blocked recovery"],
  ["/founder/11", "Post-Site findings", "one findings task + review states"],
  ["/founder/12", "Full balance clearance", "proof + confirmation + payment Details"],
  ["/founder/15", "Founder approval", "one approval action + conflict recovery"],
  ["/founder/16", "Protected PDF", "one artifact action + release Details"],
  ["/reports", "Legacy report console", "gated release path + progressive history"],
  ["/diagnostics", "Technical recovery", "read-only diagnostics + no primary mutation"]
].map(([path, surface, expected]) => ({ path, surface, expected, desktop: "1440x900", mobile: "390x844", checks: ["keyboard-focus", "disabled-busy", "error-retry", "no-horizontal-overflow"] }));
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
    "/founder/12",
    "/founder/15",
    "/founder/16",
    "/reports",
    "/diagnostics"
  ],
  reviewMatrix,
  founderSteps: steps.map((step) => ({ number: step.number, title: step.title, path: step.flowPath, status: step.status })),
  protectedStates: { stageB: "BLOCKED_METHOD_INPUT", clientDelivery: "DEFERRED", liveIntegrations: "DORMANT" },
  reviewRules: ["Do not select files", "Do not click mutation controls", "Do not send messages", "Record console errors and layout overflow only"],
  ownerReview: {
    requiredScreenshots: ["desktop-1440x900", "mobile-390x844"],
    hostedBrowserCapture: "PENDING_CLEAN_SYNTHETIC_RUNTIME",
    knownCaptureIssue: "Available browser screenshot calls timed out; no screenshot artifact is claimed.",
    publication: "NO_GO_UNTIL_OWNER_VISUAL_REVIEW"
  }
};

const outputPath = resolve("output/visual-qa/founder-synthetic-visual-qa.manifest.json");
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(manifest, null, 2) + "\n", { flag: "w" });
console.log(JSON.stringify({ outputPath, routes: manifest.routes.length, reviewSurfaces: manifest.reviewMatrix.length, steps: manifest.founderSteps.length, syntheticOnly: manifest.syntheticOnly, noWrites: manifest.noWrites }));
