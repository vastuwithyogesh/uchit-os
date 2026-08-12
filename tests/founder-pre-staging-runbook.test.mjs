import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("operator runbooks preserve disposable-only boundaries and every activation blocker", async () => {
  const [hardening, release, packageScript, hosting] = await Promise.all([
    read("docs/founder-pre-staging-hardening.md"), read("docs/founder-private-staging-go-no-go.md"), read("scripts/prepare-founder-private-staging.mjs"), read(".openai/hosting.json")
  ]);
  for (const required of ["clean v1 through v13", "backup", "R2 inventory", "P5 professional boundaries", "P13 acceptance declaration", "P14 cancellation/refund/delay policy", "Statutory document", "Zoom/provider readiness", "Media Library activation", "Stage B remedial methodology"]) assert.match(hardening, new RegExp(required, "i"));
  for (const required of ["Owner-only Sites access", "DB", "R2", "PDF_OWNER_SECRET", "NO-GO", "rollback", "destroy disposable resources"]) assert.match(release, new RegExp(required, "i"));
  assert.match(packageScript, /git\("status", "--porcelain"\)/); assert.match(packageScript, /deploymentExecuted: false/);
  assert.match(packageScript, /liveDataIncluded: false/); assert.match(packageScript, /clientDeliveryEnabled: false/); assert.match(packageScript, /lovableActivated: false/);
  assert.deepEqual({ d1: JSON.parse(hosting).d1, r2: JSON.parse(hosting).r2 }, { d1: "DB", r2: "R2" });
});
