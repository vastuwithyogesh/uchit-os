import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { resetAppState } from "../lib/store.ts";
import { createSiteEvaluationEvidenceDraft, createSiteEvaluationEvidenceSuccessor, finalizeSiteEvaluationEvidence } from "../lib/site-evaluation-evidence-v1.ts";

const actor = { id: "owner", fullName: "Owner", role: "SUPER_ADMIN", organisationId: "org-1" } as any;
function setup() { const state = resetAppState(); const item = state.vastuCases[0]; const project = state.projects.find((x) => x.id === item.projectId)!; const floor = state.floorWorkspaces.find((x) => x.projectId === project.id)!; item.organisationId = "org-1"; project.activeCaseId = item.id; return { state, project, floor }; }
function create() { const { state, project, floor } = setup(); const record = createSiteEvaluationEvidenceDraft({ state, organisationId: "org-1", caseId: project.activeCaseId, projectId: project.id, floorId: floor.id, mode: "LIVE_VIDEO", evidenceRef: "r2-1b/site", artifactHash: "sha256:site", actor, idempotencyKey: "site-cas-1" }); return { state, project, floor, record }; }

test("successor gateway contract requires entity CAS and forwards it", () => {
  const route = fs.readFileSync("app/api/actions/route.ts", "utf8");
  for (const action of ["site-evaluation-evidence-successor-v1", "post-site-observation-successor-v1", "energy-bar-evidence-successor-v1", "energy-bar-state-successor-v1", "elemental-report-successor-v1", "combined-report-successor-v1"]) { assert.match(route, new RegExp(action)); }
  assert.match(route, /A current entity expectedRecordVersion is required for successor actions/);
});

test("current global revision cannot mask stale site predecessor CAS", () => {
  const { state, record } = create();
  finalizeSiteEvaluationEvidence({ state, recordId: record.id, actor, expectedRecordVersion: 1, idempotencyKey: "site-final-1" });
  assert.throws(() => createSiteEvaluationEvidenceSuccessor({ state, predecessorId: record.id, mode: "CLIENT_SUPPLIED_VIDEO", evidenceRef: "r2-1b/stale", artifactHash: "sha256:stale", actor, expectedRecordVersion: 0, idempotencyKey: "site-successor-stale" }), /Predecessor changed/);
  const successor = createSiteEvaluationEvidenceSuccessor({ state, predecessorId: record.id, mode: "CLIENT_SUPPLIED_VIDEO", evidenceRef: "r2-1b/current", artifactHash: "sha256:current", actor, expectedRecordVersion: 2, idempotencyKey: "site-successor-current" });
  assert.equal(successor.status, "DRAFT"); assert.equal(record.status, "FINALIZED");
});

test("same request replays safely and changed body conflicts", () => {
  const first = create();
  const replay = createSiteEvaluationEvidenceDraft({ state: first.state, organisationId: "org-1", caseId: first.project.activeCaseId, projectId: first.project.id, floorId: first.floor.id, mode: "LIVE_VIDEO", evidenceRef: "r2-1b/site", artifactHash: "sha256:site", actor, idempotencyKey: "site-cas-1" });
  assert.equal(replay.id, first.record.id);
  assert.throws(() => createSiteEvaluationEvidenceDraft({ state: first.state, organisationId: "org-1", caseId: first.project.activeCaseId, projectId: first.project.id, floorId: first.floor.id, mode: "LIVE_VIDEO", evidenceRef: "r2-1b/changed", artifactHash: "sha256:changed", actor, idempotencyKey: "site-cas-1" }), /different evidence/);
});
