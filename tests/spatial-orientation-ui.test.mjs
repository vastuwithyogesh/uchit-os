import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(import.meta.dirname, "../components/spatial-workspace.tsx"), "utf8");

test("Step 04 exposes explicit protected-upload and orientation validation states", () => {
  for (const state of ["NOT_SELECTED", "SELECTED", "UPLOADING", "UPLOADED_NOT_RECORDED", "RECORDED", "FAILED"]) assert.match(source, new RegExp(state));
  assert.match(source, /Google Earth screenshot uploaded securely and recorded/);
  assert.match(source, /Retry upload/);
  assert.match(source, /Record replacement file/);
  assert.match(source, /new Google Earth evidence version/);
  assert.match(source, /selectedGoogleEvidenceIsCurrent/);
  assert.match(source, /googleEvidence\.protectedFileRef/);
  assert.doesNotMatch(source, /googleEvidence\.evidenceRef/);
  assert.match(source, /name\.replace\(\/\[\\r\\n\]\//);
  assert.match(source, /aria-invalid/);
  assert.match(source, /focusFirstOrientationError/);
  assert.match(source, /numericDegree < 0 \|\| numericDegree >= 360/);
  assert.match(source, /degreeValidation\(event\.currentTarget\.value\)/);
  assert.match(source, /reasonValidation\(event\.currentTarget\.value\)/);
  assert.match(source, /beforeunload/);
  assert.match(source, /googleEarthEvidenceVersionId: googleEvidence\?\.id/);
  assert.match(source, /router\.refresh\(\)/);
});

test("Step 04 records only after the canonical action succeeds", () => {
  assert.match(source, /const recorded = await run\("spatial-evidence-create"/);
  assert.match(source, /if \(recorded\) setGoogleUploadState\("RECORDED"\)/);
  assert.doesNotMatch(source, /setGoogleUploadState\("RECORDED"\);\s*void run/);
  assert.match(source, /if \(floorLabel\) setFile\(null\); else setCaseFile\(null\)/);
});

test("Step 05 auto-selects a successfully uploaded protected plan", () => {
  assert.match(source, /setPlanAssetRef\(asset\.evidenceRef\)/);
  assert.match(source, /Selected file is ready to upload/);
  for (const state of ["SELECTED", "UPLOADING", "UPLOADED_NOT_RECORDED", "RECORDED", "FAILED"]) assert.match(source, new RegExp(`planUploadState[\\s\\S]{0,1200}${state}|${state}[\\s\\S]{0,1200}planUploadState`));
  assert.match(source, /Record replacement plan/);
  assert.match(source, /new floor plan version/);
  assert.match(source, /selectedPlanIsCurrent/);
});

test("Founder spatial work never switches or silently falls back from the locked route context", () => {
  assert.match(source, /Locked spatial context/);
  assert.match(source, /requestedCaseId \? state\?\.vastuCases\.find/);
  assert.match(source, /requestedFloorId \? floors\.find/);
  assert.doesNotMatch(source, /id="spatial-client"|id="spatial-floor"/);
  assert.doesNotMatch(source, /clients\[0\]|floors\[0\]|getActiveCaseForClient/);
});
