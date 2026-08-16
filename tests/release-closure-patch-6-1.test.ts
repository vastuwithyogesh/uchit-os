import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createEmptyAppState } from "../lib/store.ts";
import { ensureStageBReservation, STAGE_B_AUTHORITY_HASH } from "../lib/stage-b-remediation.ts";

const actor = { id: "owner", fullName: "Yogesh", email: "owner@example.test", color: "#000", role: "SUPER_ADMIN", organisationId: "org-v1", organisationCapability: "organisation_owner" } as const;

test("V1 Stage B reservation pins native Directional Stage A and never creates stageAReportId", () => {
  const state = createEmptyAppState();
  const caseId = "case-v1", projectId = "project-v1", floorId = "floor-v1";
  state.vastuCases.push({ id: caseId, organisationId: "org-v1", clientId: "client-v1", projectId, evaluationArchitectureVersion: "V1", fullPaymentApproved: true, balanceApproved: true } as never);
  state.projects.push({ id: projectId, organisationId: "org-v1", activeCaseId: caseId } as never);
  state.floorWorkspaces.push({ id: floorId, projectId, caseId, floorLabel: "Ground", locked: true, evaluationArchitectureVersion: "V1" } as never);
  state.casePropertyContexts.push({ id: "property", organisationId: "org-v1", caseId, projectId } as never);
  state.d8OrientationSnapshots.push({ id: "d8", caseId, projectId, architectureVersion: "V1", status: "FINALIZED" } as never);
  state.d16UtilityMappingVersions.push({ id: "d16", caseId, floorId, status: "FINALIZED" } as never);
  state.directionalInputVersions.push({ id: "input", caseId, floorId, status: "FINALIZED" } as never);
  state.directionalEvaluationSnapshots.push({ id: "evaluation", caseId, floorId, status: "COMPLETE" } as never);
  state.directionalReportCardSnapshots.push({ id: "card", caseId, floorId, status: "FINALIZED", cardStatus: "READY", contentHash: "card-hash" } as never);
  state.directionalStageAPresentations.push({ id: "presentation", caseId, floorId, reportCardSnapshotId: "card", status: "PRESENTED" } as never);
  state.siteEvaluationEvidenceVersions.push({ id: "site", caseId, floorId, status: "FINALIZED" } as never);
  state.postSiteElementalObservations.push({ id: "post", caseId, floorId, status: "FINALIZED" } as never);
  state.energyBarEvidenceVersions.push({ id: "energy", caseId, floorId, status: "FINALIZED" } as never);
  state.energyBarStateSetVersions.push({ id: "states", caseId, floorId, status: "FINALIZED" } as never);
  state.elementalEvaluationSnapshots.push({ id: "elemental", caseId, floorId, status: "COMPLETE" } as never);
  state.elementalReportSnapshots.push({ id: "elemental-report", caseId, floorId, status: "FINALIZED" } as never);
  state.evaluationRemedyHandoffs.push({ id: "handoff", caseId, floorId, status: "READY" } as never);
  state.stageBInputsV1.push({ id: "stage-input", caseId, floorId, status: "FINALIZED" } as never);
  state.methodologyVersions.push({ id: "stage-method", organisationId: "org-v1", module: "STAGE_B_REMEDIAL", lifecycleStatus: "ACTIVE", sourceAssetHash: STAGE_B_AUTHORITY_HASH } as never);
  const reservation = ensureStageBReservation({ state, caseId, floorId, actor });
  assert.equal(reservation?.stageASourceKind, "V1_DIRECTIONAL_STAGE_A");
  assert.equal(reservation?.stageASourceId, "presentation");
  assert.equal(reservation?.stageASourceHash, "card-hash");
  assert.equal("stageAReportId" in (reservation ?? {}), false);
});

test("active Founder case setup defaults to the V1 creation action", async () => {
  const source = await readFile(new URL("../components/founder-case-setup-step.tsx", import.meta.url), "utf8");
  assert.match(source, /action === "case-create-v1"/);
  assert.match(source, /action, clientId: client\?\.id, proposalId: proposal\?\.id/);
});
