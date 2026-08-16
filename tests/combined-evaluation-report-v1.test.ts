import assert from "node:assert/strict";
import test from "node:test";
import { buildCombinedV1RenderModel, createCombinedEvaluationReportDraft, createCombinedEvaluationReportSuccessor, finalizeCombinedEvaluationReport } from "../lib/combined-evaluation-report-v1.ts";
import { renderCombinedEvaluationReportHtmlV1 } from "../lib/combined-report-render-v1.ts";
import { generateCombinedV1ProtectedPdf } from "../lib/combined-v1-pdf.ts";
import { translateEvaluationRemedyHandoffV1ToStageB } from "../lib/evaluation-remedy-stage-b-adapter-v1.ts";

const actor = { id: "founder", role: "SUPER_ADMIN", fullName: "Yogesh Hora", organisationId: "org-1" } as any;
test("V1 render model preserves pinned evidence references and locked section order", () => {
  const snapshot = { id: "combined-1", organisationId: "org-1", caseId: "case-1", projectId: "project-1", floorId: "floor-1", architectureVersion: "V1", status: "DRAFT", reportVersion: 1, reportTemplateVersion: "uchit-combined-evaluation/v1", directionalReportCardSnapshotId: "card-1", directionalReportCardContentHash: "sha256:card", directionalStageAPresentationId: "stage-a-1", directionalStageAPresentationHash: "sha256:stage-a", siteEvidenceVersionId: "site-1", siteEvidenceArtifactHash: "sha256:site", energyBarEvidenceVersionId: "energy-1", energyBarEvidenceArtifactHash: "sha256:energy", elementalReportSnapshotId: "elemental-1", elementalReportContentHash: "sha256:elemental", remedyHandoffId: "handoff-1", remedyHandoffContentHash: "sha256:handoff", methodologyVersionIds: ["m"], methodologyContentHashes: ["sha256:m"], renderModel: {}, contentHash: "sha256:combined", idempotencyKey: "combined-1", requestHash: "sha256:req", recordVersion: 1, createdAt: "now" } as any;
  const model = buildCombinedV1RenderModel({ snapshot });
  assert.deepEqual(model.sections.map((x) => x.key), ["ADMINISTRATION", "DIRECTIONAL_REPORT_CARD", "SITE_EVALUATION_EVIDENCE", "ENERGY_BAR_GRAPH", "ELEMENTAL_REPORT"]);
  assert.equal(model.internalProvenance.remedyHandoffId, "handoff-1");
  assert.equal(model.siteEvidence.artifactHash, "sha256:site");
  assert.equal(model.energyBarEvidence.artifactHash, "sha256:energy");
});

test("V1 HTML renderer uses snapshot references and does not reconstruct evidence", () => {
  const snapshot = { id: "combined-1", organisationId: "org-1", caseId: "case-1", projectId: "project-1", floorId: "floor-1", architectureVersion: "V1", status: "FINALIZED", reportVersion: 1, reportTemplateVersion: "uchit-combined-evaluation/v1", directionalReportCardSnapshotId: "card-1", directionalReportCardContentHash: "sha256:card", directionalStageAPresentationId: "stage-a-1", directionalStageAPresentationHash: "sha256:stage-a", siteEvidenceVersionId: "site-1", siteEvidenceArtifactHash: "sha256:site", energyBarEvidenceVersionId: "energy-1", energyBarEvidenceArtifactHash: "sha256:energy", elementalReportSnapshotId: "elemental-1", elementalReportContentHash: "sha256:elemental", remedyHandoffId: "handoff-1", remedyHandoffContentHash: "sha256:handoff", methodologyVersionIds: ["m"], methodologyContentHashes: ["sha256:m"], renderModel: {}, contentHash: "sha256:combined", idempotencyKey: "combined-1", requestHash: "sha256:req", recordVersion: 2, createdAt: "now" } as any;
  const html = renderCombinedEvaluationReportHtmlV1({ snapshot });
  assert.match(html, /data-renderer="uchit-combined-evaluation-html\/v1"/);
  assert.match(html, /site-1 \(sha256:site\)/);
  assert.match(html, /energy-1 \(sha256:energy\)/);
  assert.doesNotMatch(html, /REMEDY_HANDOFF|solutionFraming|LEGACY_UTILITY_VERDICT_REQUIRED/);
  assert.doesNotMatch(html, /OCR|reconstruct|generated diagnosis/i);
});

test("V1 combined report draft fails closed when authoritative sources are incomplete", () => {
  const state = { vastuCases: [{ id: "case-1", organisationId: "org-1", projectId: "project-1" }], projects: [], floorWorkspaces: [], directionalReportCardSnapshots: [], directionalStageAPresentations: [], elementalEvaluationSnapshots: [], siteEvaluationEvidenceVersions: [], energyBarEvidenceVersions: [], elementalReportSnapshots: [], evaluationRemedyHandoffs: [], combinedEvaluationReportSnapshots: [] } as any;
  assert.throws(() => createCombinedEvaluationReportDraft({ state, organisationId: "org-1", caseId: "case-1", projectId: "project-1", floorId: "floor-1", actor, idempotencyKey: "combined-key" }), /Floor does not belong|V1 case and floor|READY Directional Report Card/);
});

test("V1 remedy adapter maps exactly five decisions without selecting physical remedies", () => {
  const handoff = { version: "evaluation-remedy-handoff/v1", organisationId: "org-1", caseId: "case-1", projectId: "project-1", floorId: "floor-1", elementalEvaluationSnapshotId: "eval-1", elementalEvaluationOutputHash: "sha256:eval", methodologyVersionId: "m/v1", methodologyContentHash: "sha256:m", deterministicContentHash: "sha256:handoff", decisions: [
    ["WATER", "SUPPRESS", "TATTAV_BALANCER"], ["AIR", "GROUND", "DISHA_BALANCER"], ["FIRE", "UPLIFT", "TATTAV_ACTIVATION"], ["EARTH", "PROMOTE", "DISHA_ACTIVATION"], ["SPACE", "BALANCE", "EQUALISER"]
  ].map(([element, verdict, remedyType]) => ({ element, verdict, remedyType, correctionScope: "WHOLE_ELEMENT", reasonCode: "TEST", statementId: `EL-${element}`, statementContentHash: `sha256:${element}` })) } as any;
  const translated = translateEvaluationRemedyHandoffV1ToStageB({ handoff });
  assert.equal(translated.decisions.length, 5);
  assert.equal(translated.stageBReady, false);
  assert.equal(translated.reason, "LEGACY_UTILITY_VERDICT_REQUIRED");
  assert.equal((translated as any).physicalRemedy, undefined);
});

test("V1 finalize and successor actions reject cross-organisation snapshots", () => {
  const state = { combinedEvaluationReportSnapshots: [{ id: "combined-1", organisationId: "org-2", status: "FINALIZED", recordVersion: 2 }] } as any;
  assert.throws(() => finalizeCombinedEvaluationReport({ state, snapshotId: "combined-1", actor, expectedRecordVersion: 2, idempotencyKey: "finalize-key" }), /outside the actor organisation/);
  assert.throws(() => createCombinedEvaluationReportSuccessor({ state, predecessorId: "combined-1", actor, idempotencyKey: "successor-key" }), /outside the actor organisation/);
});

test("V1 approved snapshot generates a protected PDF with exact evidence lineage", async () => {
  const snapshot = { id: "combined-approved", organisationId: "org-1", caseId: "case-1", projectId: "project-1", floorId: "floor-1", architectureVersion: "V1", status: "APPROVED", reportVersion: 1, reportTemplateVersion: "uchit-combined-evaluation/v1", directionalReportCardSnapshotId: "card-1", directionalReportCardContentHash: "sha256:card", directionalStageAPresentationId: "stage-a-1", directionalStageAPresentationHash: "sha256:stage-a", siteEvidenceVersionId: "site-1", siteEvidenceArtifactHash: "sha256:site", energyBarEvidenceVersionId: "energy-1", energyBarEvidenceArtifactHash: "sha256:energy", elementalReportSnapshotId: "elemental-1", elementalReportContentHash: "sha256:elemental", remedyHandoffId: "handoff-1", remedyHandoffContentHash: "sha256:handoff", methodologyVersionIds: ["m"], methodologyContentHashes: ["sha256:m"], renderModel: {}, contentHash: "sha256:combined", idempotencyKey: "combined-1", requestHash: "sha256:req", recordVersion: 3, createdAt: "now" } as any;
  const artifact = await generateCombinedV1ProtectedPdf({ snapshot, ownerSecret: "x".repeat(40), approval: { approverName: "Yogesh Hora", approverRole: "SUPER_ADMIN", approvalDate: "2026-08-15", approvalTimestamp: "2026-08-15T10:00:00.000Z", approvalRecordId: "approval-1" }, siteEvidence: { versionId: "site-1", checksumSha256: "sha256:site", fileName: "site.png", mimeType: "image/png", bytes: new Uint8Array([1, 2, 3]) }, energyEvidence: { versionId: "energy-1", checksumSha256: "sha256:energy", fileName: "energy.png", mimeType: "image/png", bytes: new Uint8Array([4, 5, 6]) } });
  assert.equal(artifact.protectedPdfReady, true);
  assert.equal(artifact.combinedReportSnapshotId, "combined-approved");
  assert.equal(artifact.siteEvidenceChecksumSha256, "sha256:site");
  assert.equal(artifact.securityMatrix.editing, "TECHNICALLY VERIFIED");
  assert.ok(artifact.bytes.length > 0);
});

test("V1 draft cannot issue a protected client PDF", async () => {
  const snapshot = { id: "combined-draft", organisationId: "org-1", caseId: "case-1", projectId: "project-1", floorId: "floor-1", status: "DRAFT", reportVersion: 1, reportTemplateVersion: "uchit-combined-evaluation/v1", contentHash: "sha256:combined" } as any;
  await assert.rejects(() => generateCombinedV1ProtectedPdf({ snapshot, ownerSecret: "x".repeat(40), approval: { approverName: "Yogesh", approverRole: "SUPER_ADMIN", approvalDate: "2026-08-15", approvalTimestamp: "now", approvalRecordId: "a" }, siteEvidence: { versionId: "s", checksumSha256: "s", fileName: "s", mimeType: "image/png", bytes: new Uint8Array([1]) }, energyEvidence: { versionId: "e", checksumSha256: "e", fileName: "e", mimeType: "image/png", bytes: new Uint8Array([2]) } }), /APPROVED/);
});
