import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyAppState } from "../lib/store.ts";
import { resolveEvaluationArchitecture } from "../lib/evaluation-architecture.ts";
import { mergeAppState } from "../lib/persistence-merge.ts";

function baseCase(id: string, clientId = "client-1") {
  return { id, clientId, caseNumber: id, proposalId: `proposal-${id}`, status: "DRAFT", reportStatus: "NOT_STARTED", orientationLocked: false, balanceApproved: false, fullPaymentApproved: false } as Record<string, unknown>;
}

test("missing and explicit LEGACY architecture resolve to LEGACY without backfill", () => {
  const state = createEmptyAppState();
  state.vastuCases.push(baseCase("legacy-missing") as never);
  state.vastuCases.push({ ...baseCase("legacy-explicit"), evaluationArchitectureVersion: "LEGACY" } as never);
  assert.equal(resolveEvaluationArchitecture({ state, caseId: "legacy-missing" }).caseVersion, "LEGACY");
  assert.equal(resolveEvaluationArchitecture({ state, caseId: "legacy-explicit" }).caseVersion, "LEGACY");
  assert.equal("evaluationArchitectureVersion" in state.vastuCases[0], false);
});

test("explicit V1 case and floors resolve independently and coexist with legacy", () => {
  const state = createEmptyAppState();
  state.vastuCases.push({ ...baseCase("v1"), evaluationArchitectureVersion: "V1" } as never);
  state.vastuCases.push(baseCase("legacy") as never);
  state.floorWorkspaces.push({ id: "ground", caseId: "v1", floorLabel: "Ground", status: "DRAFT", locked: false, evidenceUploads: [], evaluationArchitectureVersion: "V1" } as never);
  state.floorWorkspaces.push({ id: "first", caseId: "v1", floorLabel: "First", status: "DRAFT", locked: false, evidenceUploads: [], evaluationArchitectureVersion: "V1" } as never);
  state.floorWorkspaces.push({ id: "historical", caseId: "v1", floorLabel: "Historical", status: "DRAFT", locked: false, evidenceUploads: [] } as never);
  assert.equal(resolveEvaluationArchitecture({ state, caseId: "v1", floorId: "ground" }).floorVersion, "V1");
  assert.equal(resolveEvaluationArchitecture({ state, caseId: "v1", floorId: "first" }).floorVersion, "V1");
  assert.equal(resolveEvaluationArchitecture({ state, caseId: "v1", floorId: "historical" }).floorVersion, "LEGACY");
  assert.equal(resolveEvaluationArchitecture({ state, caseId: "legacy" }).caseVersion, "LEGACY");
});

test("architecture fields survive persistence merge without rewriting legacy records", () => {
  const base = createEmptyAppState();
  base.vastuCases.push(baseCase("legacy") as never);
  const snapshot = createEmptyAppState();
  snapshot.vastuCases.push({ ...baseCase("v1"), evaluationArchitectureVersion: "V1" } as never);
  const merged = mergeAppState(base, snapshot);
  assert.equal(merged.vastuCases[0].evaluationArchitectureVersion, "V1");
  assert.equal("evaluationArchitectureVersion" in base.vastuCases[0], false);
});
