import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const manifest = fs.readFileSync("lib/founder-media-manifest.ts", "utf8");
const route = fs.readFileSync("app/api/media-library/route.ts", "utf8");
const consoleSource = fs.readFileSync("components/media-library-console.tsx", "utf8");

test("shared media manifest contains the nine governed remedy image authorities", () => {
  const keys = [...manifest.matchAll(/key: "(REMEDY_[A-Z0-9_]+_V1)"/g)].map((match) => match[1]);
  assert.deepEqual(keys, [
    "REMEDY_DA_HARMONIUM_V1",
    "REMEDY_DA_SHRUTI_BOX_V1",
    "REMEDY_DB_WATERFALL_PAINTINGS_V1",
    "REMEDY_DB_LUSH_GREEN_LANDSCAPES_V1",
    "REMEDY_TA_LEMONGRASS_V1",
    "REMEDY_TA_LAVENDER_V1",
    "REMEDY_TB_KUBER_IDOL_BRASS_V1",
    "REMEDY_TB_TRISHUL_BRASS_V1",
    "REMEDY_EQUALISER_SNAKE_PLANT_V1",
  ]);
  assert.equal((manifest.match(/mimeType: "image\/jpeg"/g) ?? []).length, 9);
  assert.match(manifest, /REMEDY_EQUALISER_SNAKE_PLANT_V1[\s\S]*?checksumSha256: "ED88DC49/);
});

test("shared media upload validates JPEG and preserves canonical FormData ingestion", () => {
  assert.match(route, /request\.formData\(\)/);
  assert.match(route, /manifest\.mimeType === "image\/jpeg"/);
  assert.match(route, /bytes\[0\] === 0xff && bytes\[1\] === 0xd8 && bytes\[2\] === 0xff/);
  assert.match(route, /crypto\.subtle\.digest\("SHA-256", bytes\)/);
  assert.match(route, /env\.R2\.put\(objectKey, bytes/);
  assert.match(route, /await env\.R2\.delete\(objectKey\)/);
  assert.match(consoleSource, /new FormData\(\)/);
  assert.match(consoleSource, /fetch\("\/api\/media-library",\{method:"POST",body:form\}\)/);
  assert.doesNotMatch(consoleSource, /Content-Type/);
});

test("remedy media remains shared authority and does not add a parallel repository binary path", () => {
  assert.doesNotMatch(manifest, /Downloads|Users\\\\ASUS|base64|data:/i);
  assert.doesNotMatch(route, /remedy|repository/i);
  assert.match(route, /registerMediaAssetVersion/);
  assert.match(route, /transitionMediaAssetVersion/);
});
