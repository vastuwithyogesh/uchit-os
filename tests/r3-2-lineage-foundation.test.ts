import assert from "node:assert/strict";
import test from "node:test";
import { resolveStageBReportLineage, validateStageBReportLineage, StageBReportLineageError } from "../lib/stage-b-lineage.ts";

const v1 = { architectureVersion: "V1", sourceKind: "V1_COMBINED_EVALUATION_REPORT", reportSourceId: "combined-1", reportSourceHash: "hash-1", reportTemplateVersion: "combined/v1" } as const;
const legacy = { architectureVersion: "LEGACY", sourceKind: "LEGACY_REPORT", reportId: "legacy-report-1", reportVersionId: "legacy-report-1" } as const;

test("native V1 lineage is valid without legacy report identity", () => {
  assert.deepEqual(validateStageBReportLineage(v1), v1);
  const roundTrip = JSON.parse(JSON.stringify({ stageBLineage: v1 }));
  assert.equal(roundTrip.stageBLineage.reportSourceId, "combined-1");
  assert.equal(roundTrip.stageBLineage.reportId, undefined);
});

test("legacy lineage remains valid and round-trips unchanged", () => {
  assert.deepEqual(validateStageBReportLineage(legacy), legacy);
  assert.deepEqual(JSON.parse(JSON.stringify(legacy)), legacy);
});

test("mixed or incomplete lineage is rejected", () => {
  assert.throws(() => validateStageBReportLineage({ architectureVersion: "V1", sourceKind: "V1_COMBINED_EVALUATION_REPORT", reportSourceId: "", reportSourceHash: "" } as never), StageBReportLineageError);
  assert.throws(() => validateStageBReportLineage({ architectureVersion: "LEGACY", sourceKind: "LEGACY_REPORT", reportId: "" } as never), StageBReportLineageError);
});

test("resolver uses explicit StageBRemediation architecture", () => {
  const state = { reportVersions: [], combinedEvaluationReportSnapshots: [{ id: v1.reportSourceId, organisationId: "org-1", caseId: "case-1", projectId: "project-1", floorId: "floor-1", architectureVersion: "V1", status: "FINALIZED", contentHash: v1.reportSourceHash }] } as any;
  const resolved = resolveStageBReportLineage(state, { organisationId: "org-1", caseId: "case-1", projectId: "project-1", floorId: "floor-1", architectureVersion: "V1", reportSourceKind: v1.sourceKind, reportSourceId: v1.reportSourceId, reportSourceHash: v1.reportSourceHash, reportTemplateVersion: v1.reportTemplateVersion } as any);
  assert.equal(resolved.sourceKind, "V1_COMBINED_EVALUATION_REPORT");
  assert.equal(resolved.reportSourceId, "combined-1");
});
