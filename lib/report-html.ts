import type { AppState } from "@/lib/store";
import type { ReportVersionRecord } from "@/lib/domain";
import { PREVIEW_WATERMARK } from "@/lib/report-artifacts";

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

export function renderPrintableReport(state: AppState, report: ReportVersionRecord) {
  const caseRecord = state.vastuCases.find((item) => item.id === report.caseId);
  const client = state.clients.find((item) => item.id === caseRecord?.clientId);
  const evaluation = report.artifact?.evaluationSnapshotId
    ? state.evaluationSnapshots.find((item) => item.id === report.artifact?.evaluationSnapshotId)
    : state.evaluationSnapshots.find((item) => item.caseId === report.caseId);
  const rows = evaluation?.generatedMatrix.map((entry) => `<tr><td>${escapeHtml(entry.code)}</td><td>${escapeHtml(entry.verdict)}</td><td>${entry.confidence}%</td></tr>`).join("") || `<tr><td colspan="3">No evaluation snapshot attached</td></tr>`;
  const watermark = report.isPreview ? `<div class="watermark">${PREVIEW_WATERMARK}</div>` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(report.versionLabel)}</title><style>
  @page{size:A4;margin:16mm}*{box-sizing:border-box}body{font:14px/1.5 Arial,sans-serif;color:#263029;margin:0}header{border-bottom:3px solid #9a6b32;padding-bottom:14px;margin-bottom:24px}h1{margin:0;color:#244a36}small{color:#68756d}table{width:100%;border-collapse:collapse;margin-top:22px}th,td{padding:10px;border:1px solid #d9dfda;text-align:left}th{background:#f2f5f2}.watermark{position:fixed;inset:42% 0 auto;transform:rotate(-25deg);font-size:54px;font-weight:800;color:rgba(154,55,32,.14);text-align:center;z-index:-1}.evidence{margin-top:28px;padding:12px;background:#f7f7f4;overflow-wrap:anywhere}@media print{button{display:none}}
  </style></head><body>${watermark}<header><h1>Uchit Vastu · ${escapeHtml(report.versionLabel)}</h1><small>${escapeHtml(caseRecord?.caseNumber)} · ${escapeHtml(client?.displayName)} · ${escapeHtml(client?.city)}</small></header><h2>Evaluation summary</h2><table><thead><tr><th>Zone</th><th>Verdict</th><th>Confidence</th></tr></thead><tbody>${rows}</tbody></table><div class="evidence"><strong>Artifact evidence</strong><br>Report ID: ${escapeHtml(report.id)}<br>Template: ${escapeHtml(report.artifact?.templateVersion)}<br>SHA-256: ${escapeHtml(report.artifact?.contentHash)}</div><button onclick="window.print()">Download / Print PDF</button></body></html>`;
}
