import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), "utf8");

test("R5 Founder flow selects V1-native required inputs by explicit architecture", () => {
  const source = read("lib/founder-flow.ts");
  assert.match(source, /evaluationArchitectureVersion === "V1"/);
  assert.match(source, /Finalized Directional Report Card/);
  assert.match(source, /Approved Full Balance Clearance/);
  assert.match(source, /Current canonical Elemental Evaluation/);
  assert.match(source, /founderFlowRequiredInputs\[module\.id\]/);
});

test("R5 scorecard exposes V1 spatial authority and does not gate it on legacy sheet", () => {
  const source = read("lib/founder-scorecard.ts");
  assert.match(source, /title: "V1 spatial authority"/);
  assert.match(source, /legacy manual utility-sheet approval is not a V1 gate/);
  assert.match(source, /v1\.spatial/);
});

test("R5 Stage-A UI uses native V1 readiness and preserves LEGACY Utility/Shakti path", () => {
  const source = read("components/founder-report-step.tsx");
  assert.match(source, /resolveV1FloorWorkflowReadiness/);
  assert.match(source, /directionalStageAPresented/);
  assert.match(source, /legacyEvaluationReady/);
  assert.match(source, /stage-a-present/);
});

test("R5 spatial workspace contains legacy controls on the LEGACY path only", () => {
  const source = read("components/spatial-workspace.tsx");
  assert.match(source, /isV1Spatial && focus === "gridding"/);
  assert.match(source, /Case Property Context/);
  assert.match(source, /Legacy Manual Utility Sheet, Shakti and marked-plan controls are not V1 gates/);
});

test("R5 Stage-B callers select native V1 report source and StageBInput", () => {
  const stageB = read("components/stage-b-remedy-workspace.tsx");
  const sectionA = read("components/section-a-remediation-workspace.tsx");
  assert.match(stageB, /reportSourceId/);
  assert.match(stageB, /stageBInputId/);
  assert.match(stageB, /v1StageBInput \? undefined/);
  assert.match(sectionA, /reportSourceId/);
  assert.match(sectionA, /resolveEvaluationArchitecture/);
});

test("shared image consumers submit the original selected file to server validation", () => {
  for (const path of ["components/commercial-console.tsx", "components/payment-proof-console.tsx", "components/chart-upload-board.tsx"]) {
    const source = read(path);
    assert.doesNotMatch(source, /prepareImageUpload/);
    assert.match(source, /formData\.append\("file", file\)/);
  }
});
