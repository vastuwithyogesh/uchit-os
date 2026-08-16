import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file) => readFileSync(resolve(process.cwd(), file), "utf8");

test("deployment package is an explicit staged NO-GO checklist", () => {
  const docs = read("docs/founder-deployment-readiness.md");
  for (const token of ["NO-GO", "PDF_OWNER_SECRET", "DB", "R2", "backup:state", "schema_migrations", "v16", "VASTU_REMEDY_REPORT", "rollback", "RPO/RTO"]) {
    assert.match(docs, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), token);
  }
  assert.match(docs, /do not deploy|not executed/i);
});

test("CI and migration evidence are wired to the package", () => {
  const workflow = read(".github/workflows/release-gate.yml");
  const migrations = read("db/migrations.ts");
  const pkg = read("package.json");
  assert.match(workflow, /pnpm test:release/);
  assert.match(workflow, /node-version: 22/);
  assert.match(migrations, /version:\s*16/);
  assert.match(pkg, /test:release/);
});

test("VASTU Remedy delivery is controlled while Founder-family delivery remains deferred and the owner secret is server-only", () => {
  const portal = read("app/api/client/portal/route.ts");
  const report = read("app/api/client/reports/[reportId]/route.ts");
  const delivery = read("lib/document-delivery.ts");
  const deliveryReview = read("components/document-delivery-visual-review.tsx");
  const env = read("lib/runtime-env.ts");
  assert.match(portal + report, /DELIVERED|ACKNOWLEDGED/);
  assert.match(delivery, /VASTU_REMEDY_REPORT/);
  assert.match(deliveryReview, /Founder proposal and statutory delivery is deferred/);
  assert.match(env, /PDF_OWNER_SECRET/);
  assert.doesNotMatch(read("app/api/bootstrap/route.ts"), /PDF_OWNER_SECRET/);
});
