import type { CombinedEvaluationReportSnapshotV1 } from "./domain.ts";
import { buildCombinedV1RenderModel } from "./combined-evaluation-report-v1.ts";

export const COMBINED_EVALUATION_HTML_RENDERER_V1 = "uchit-combined-evaluation-html/v1" as const;

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Render only from the immutable V1 snapshot and its pinned render model.
 * This adapter deliberately emits references, not copied evidence bytes.
 */
export function renderCombinedEvaluationReportHtmlV1(input: { snapshot: CombinedEvaluationReportSnapshotV1 }): string {
  const model = buildCombinedV1RenderModel(input);
  const sections = model.sections.map((section) => `<li data-order="${section.order}">${escapeHtml(section.key)}</li>`).join("");
  return [
    `<!doctype html><html><head><meta charset="utf-8"><title>Uchit Vastu Combined Evaluation Report</title></head>`,
    `<body data-renderer="${COMBINED_EVALUATION_HTML_RENDERER_V1}" data-architecture="V1">`,
    `<header><h1>Combined Evaluation Report</h1><p>Status: ${escapeHtml(model.status)}</p></header>`,
    `<p>Case ${escapeHtml(model.lineage.caseId)} · Project ${escapeHtml(model.lineage.projectId)} · Floor ${escapeHtml(model.lineage.floorId)}</p>`,
    `<ol>${sections}</ol>`,
    `<section data-section="SITE_EVALUATION_EVIDENCE"><h2>Site Evaluation Evidence</h2><p>Original artifact reference: ${escapeHtml(model.siteEvidence.versionId)} (${escapeHtml(model.siteEvidence.artifactHash)})</p></section>`,
    `<section data-section="ENERGY_BAR_GRAPH"><h2>Energy Bar Evidence</h2><p>Original artifact reference: ${escapeHtml(model.energyBarEvidence.versionId)} (${escapeHtml(model.energyBarEvidence.artifactHash)})</p></section>`,
    `<section data-section="ELEMENTAL_REPORT"><h2>Elemental Report</h2><p>Finalized snapshot reference: ${escapeHtml(model.elemental.snapshotId)} (${escapeHtml(model.elemental.contentHash)})</p></section>`,
    `<footer>Snapshot content hash: ${escapeHtml(input.snapshot.contentHash)}</footer>`,
    `</body></html>`,
  ].join("");
}
