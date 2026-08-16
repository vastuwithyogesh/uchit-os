import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("../", import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), "utf8");

test("6.4 local fixture keeps ownership strict while permitting only unowned local seed adoption", () => {
  const route = read("app/api/actions/route.ts");
  const domain = read("lib/founder-commercial.ts");
  assert.match(route, /allowLegacyUnownedLocalFixture: isExplicitLocalDemo\(request\.headers\)/);
  assert.match(domain, /allowLegacyUnownedLocalFixture === true && !item\.organisationId/);
  assert.match(domain, /if \(!client\.organisationId && input\.allowLegacyUnownedLocalFixture\) client\.organisationId = input\.organisationId/);
  assert.doesNotMatch(domain, /item\.organisationId === input\.organisationId \|\| true/);
});

test("6.4 spatial route forwards query context and removes universal main-entrance wording", () => {
  const page = read("app/spatial/page.tsx");
  const workspace = read("components/spatial-workspace.tsx");
  assert.match(page, /searchParams/);
  assert.match(page, /<SpatialWorkspace caseId=\{context\.caseId\} floorId=\{context\.floorId\}/);
  assert.match(workspace, /property-level primary classification/);
  assert.match(workspace, /floor-specific secondary classification/);
  assert.doesNotMatch(workspace, /every floor has a current plan,[\s\S]{0,180}main entrance is verified/);
});

test("6.4 invalid Founder route context fails explicitly", () => {
  const page = read("app/founder/[step]/page.tsx");
  assert.match(page, /CASE_NOT_ACCESSIBLE/);
  assert.match(page, /FLOOR_NOT_ACCESSIBLE/);
  assert.match(page, /FLOOR_CASE_MISMATCH/);
  assert.match(page, /canAccessFounderCase/);
});
