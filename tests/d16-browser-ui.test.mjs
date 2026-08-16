import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("V1 Step 06 uses canonical Utility Master rows and preserves draft review", () => {
  const ui = read("components/spatial-workspace.tsx");
  assert.match(ui, /fetch\("\/api\/utility\/master"/);
  assert.match(ui, /utilityId: `utilitymaster-row-\$\{selectedD16MasterRow\.rowNumber\}`/);
  assert.match(ui, /Save D16 draft/);
  assert.match(ui, /Finalize D16/);
  assert.match(ui, /v1D16Draft/);
  assert.match(ui, /d16DraftRows/);
});

test("native D16 action wiring and domain contract remain unchanged", () => {
  const route = read("app/api/actions/route.ts");
  const domain = read("lib/d16-utility-mapping.ts");
  assert.match(route, /case "d16-mapping-draft-v1"/);
  assert.match(route, /case "d16-mapping-finalize-v1"/);
  assert.match(domain, /status: "DRAFT"/);
  assert.match(domain, /status = "FINALIZED"/);
  assert.match(domain, /expectedVersion/);
  assert.match(domain, /idempotencyKey/);
});
