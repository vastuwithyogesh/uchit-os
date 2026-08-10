import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("preview artifacts keep a permanent watermark and SHA-256 evidence", async () => {
  const artifacts = await read("lib/report-artifacts.ts");
  const workflow = await read("lib/workflow-service.ts");
  assert.match(artifacts, /PREVIEW ONLY · NOT FOR FINAL USE/);
  assert.match(artifacts, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(workflow, /report\.watermarkText = PREVIEW_WATERMARK/);
  assert.doesNotMatch(workflow, /watermarkText = caseRecord\.balanceApproved \? undefined/);
});

test("new report versions are immutable and creator cannot approve", async () => {
  const workflow = await read("lib/workflow-service.ts");
  assert.match(workflow, /artifact\?\.immutable/);
  assert.match(workflow, /report creator cannot approve their own report/i);
  assert.match(workflow, /already approved this report version/i);
  assert.match(workflow, /artifactHash: report\.artifact\.contentHash/);
});

test("release requires payment, two evidenced actors, and matching artifact hashes", async () => {
  const workflow = await read("lib/workflow-service.ts");
  assert.match(workflow, /!caseRecord\.balanceApproved \|\| !caseRecord\.fullPaymentApproved/);
  assert.match(workflow, /approvalEvidence\?\.length \?\? 0\) < 2/);
  assert.match(workflow, /new Set\(report\.approvalEvidence\?\.map/);
  assert.match(workflow, /item\.artifactHash !== report\.artifact\?\.contentHash/);
});

test("print endpoint verifies integrity and is private", async () => {
  const route = await read("app/api/reports/[reportId]/print/route.ts");
  assert.match(route, /artifactStillMatches/);
  assert.match(route, /private, no-store/);
  assert.match(route, /frame-ancestors 'none'/);
  assert.match(route, /canReadClientSnapshots/);
});
