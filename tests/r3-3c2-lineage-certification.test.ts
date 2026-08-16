import assert from "node:assert/strict";
import test from "node:test";
import { resolveStageBReportLineage, stageBChildMatchesRemediation, stageBRecordLineageFields } from "../lib/stage-b-lineage.ts";

const native = { architectureVersion: "V1", reportSourceKind: "V1_COMBINED_EVALUATION_REPORT", reportSourceId: "combined-ground", reportSourceHash: "hash-ground" };
const remediation = { id: "rem-ground", organisationId: "org-1", projectId: "project-1", caseId: "case-1", floorId: "floor-ground", architectureVersion: "V1", reportSourceKind: native.reportSourceKind, reportSourceId: native.reportSourceId, reportSourceHash: native.reportSourceHash } as any;
const state = { reportVersions: [], combinedEvaluationReportSnapshots: [{ id: native.reportSourceId, organisationId: "org-1", caseId: "case-1", projectId: "project-1", floorId: "floor-ground", architectureVersion: "V1", status: "FINALIZED", contentHash: native.reportSourceHash }] } as any;

test("R3.3C2 accepts representative V1 child lineage without reportId", () => {
  const child = { remediationId: remediation.id, caseId: remediation.caseId, floorId: remediation.floorId, stageBLineage: { architectureVersion: "V1", sourceKind: native.reportSourceKind, reportSourceId: native.reportSourceId, reportSourceHash: native.reportSourceHash } };
  assert.equal(stageBChildMatchesRemediation(state, remediation, child as any), true);
  assert.equal("reportId" in child, false);
  assert.equal("reportVersionId" in child, false);
  assert.equal("stageAReportId" in child, false);
});

test("R3.3C2 rejects native lineage source and floor mismatches", () => {
  const wrongSource = { stageBLineage: { architectureVersion: "V1", sourceKind: native.reportSourceKind, reportSourceId: "combined-first", reportSourceHash: native.reportSourceHash } };
  const wrongFloor = { stageBLineage: { architectureVersion: "V1", sourceKind: native.reportSourceKind, reportSourceId: native.reportSourceId, reportSourceHash: native.reportSourceHash }, floorId: "floor-first" };
  assert.equal(stageBChildMatchesRemediation(state, remediation, wrongSource as any), false);
  assert.equal(stageBChildMatchesRemediation(state, remediation, wrongFloor as any), false);
});

test("R3.3C2 preserves legacy reportId validation and native projection", () => {
  const legacy = { id: "legacy-rem", reportId: "legacy-report", caseId: "case-1", floorId: "floor-ground", architectureVersion: "LEGACY" } as any;
  const legacyState = { reportVersions: [{ id: "legacy-report" }], combinedEvaluationReportSnapshots: [] } as any;
  assert.equal(stageBChildMatchesRemediation(legacyState, legacy, { reportId: "legacy-report" }), true);
  assert.equal(stageBChildMatchesRemediation(legacyState, legacy, { reportId: "other-report" }), false);
  const projected = stageBRecordLineageFields(state, remediation) as any; assert.equal(projected.reportSourceId, native.reportSourceId); assert.equal(projected.reportSourceHash, native.reportSourceHash); assert.equal(projected.reportId, undefined); assert.equal(projected.stageBLineage.architectureVersion, "V1");
  assert.equal(resolveStageBReportLineage(state, remediation).architectureVersion, "V1");
});
