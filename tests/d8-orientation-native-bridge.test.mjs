import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Step 04 exposes a V1-only native D8 resume control", () => {
  const ui = read("components/spatial-workspace.tsx");
  assert.match(ui, /run\("d8-orientation-finalize-v1"/);
  assert.match(ui, /orientationVersionId: orientation\.id/);
  assert.match(ui, /isV1Spatial \? \(orientation \? nativeD8Ready : Boolean\(currentDegreeError\) \|\| Boolean\(currentReasonError\)\)/);
  assert.match(ui, /orientation \? "Finalize native V1 D8" : "Lock exact orientation"/);
  assert.match(ui, /isV1Spatial && orientation && v1D8\?\.sourceOrientationVersionId === orientation\.id/);
  assert.match(ui, /orientation-version-lock/);
});

test("native D8 binds a locked OrientationVersion to current evidence", () => {
  const service = read("lib/d8-orientation-snapshot-v1.ts");
  assert.match(service, /orientationVersionId: string/);
  assert.match(service, /status === "LOCKED"/);
  assert.match(service, /googleEarthEvidenceVersionId === evidence\.id/);
  assert.match(service, /sourceOrientationVersionId: orientation\.id/);
});

test("native D8 action carries the source orientation through the server allowlist", () => {
  const route = read("app/api/actions/route.ts");
  assert.match(route, /"d8-orientation-finalize-v1".*"orientationVersionId"/s);
  assert.match(route, /orientationVersionId: body\.orientationVersionId/);
});
