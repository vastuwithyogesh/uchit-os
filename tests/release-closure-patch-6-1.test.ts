import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";


test("V1 Stage B reservation source contract uses native Directional Stage A and never creates stageAReportId", async () => {
  const source = await readFile(new URL("../lib/stage-b-remediation.ts", import.meta.url), "utf8");
  assert.match(source, /stageASourceKind: "V1_DIRECTIONAL_STAGE_A"/);
  assert.match(source, /stageASourceId: v1Presentation!\.id/);
  assert.match(source, /stageASourceHash: v1Card!\.contentHash/);
  assert.match(source, /: \{ stageASourceKind: "LEGACY_STAGE_A_REPORT" as const, stageAReportId: stageA!\.id \}/);
});

test("active Founder case setup defaults to the V1 creation action", async () => {
  const source = await readFile(new URL("../components/founder-case-setup-step.tsx", import.meta.url), "utf8");
  assert.match(source, /action === "case-create-v1"/);
  assert.match(source, /action, clientId: client\?\.id, proposalId: proposal\?\.id/);
});
