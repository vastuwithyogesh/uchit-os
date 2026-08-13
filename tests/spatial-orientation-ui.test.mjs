import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(import.meta.dirname, "../components/spatial-workspace.tsx"), "utf8");

test("Step 04 exposes explicit protected-upload and orientation validation states", () => {
  for (const state of ["NOT_SELECTED", "SELECTED", "UPLOADING", "UPLOADED_NOT_RECORDED", "RECORDED", "FAILED"]) assert.match(source, new RegExp(state));
  assert.match(source, /Google Earth screenshot uploaded securely and recorded/);
  assert.match(source, /Retry upload/);
  assert.match(source, /Replace file/);
  assert.match(source, /aria-invalid/);
  assert.match(source, /focusFirstOrientationError/);
  assert.match(source, /numericDegree < 0 \|\| numericDegree >= 360/);
  assert.match(source, /beforeunload/);
  assert.match(source, /googleEarthEvidenceVersionId: googleEvidence\?\.id/);
});

test("Step 04 records only after the canonical action succeeds", () => {
  assert.match(source, /const recorded = await run\("spatial-evidence-create"/);
  assert.match(source, /if \(recorded\) setGoogleUploadState\("RECORDED"\)/);
  assert.doesNotMatch(source, /setGoogleUploadState\("RECORDED"\);\s*void run/);
});

test("Step 05 auto-selects a successfully uploaded protected plan", () => {
  assert.match(source, /upload\(file, floor\?\.floorLabel, \(asset\) => setPlanAssetRef\(asset\.evidenceRef\)\)/);
  assert.match(source, /Selected file is ready to upload/);
});
