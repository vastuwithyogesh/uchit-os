"use client";

import { useState } from "react";
import type { AppState } from "@/lib/store";
import { useSession } from "@/components/session-provider";
import { getActiveCaseForClient } from "@/lib/service-framework";
import { canApproveReport, canEditFloorWorkspaces, canReleaseVerdict } from "@/lib/permissions";
import { canReleaseOfficialVerdict, formatMoney, isPreviewWatermarked } from "@/lib/workflows";
import { buildActionHeaders } from "@/lib/request-helpers";

async function fetchState() {
  const response = await fetch("/api/bootstrap", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load report state");
  }
  return response.json() as Promise<AppState>;
}

async function postAction(payload: Record<string, unknown>, role?: string) {
  const response = await fetch("/api/actions", {
    method: "POST",
    headers: buildActionHeaders(role as never),
    body: JSON.stringify(payload)
  });

  const result = await response.json();
  if (!response.ok || result.ok === false) {
    throw new Error(result.error ?? "Request failed");
  }

  return result;
}

export function ReportConsole() {
  const { activeUser } = useSession();
  const [state, setState] = useState<AppState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Choose “Load reports” to begin.");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [approvalComment, setApprovalComment] = useState("Reviewed against the evaluation snapshot and report layout.");

  const clients = state?.clients ?? [];
  const selectedClient = clients.find((client) => client.id === selectedClientId) ?? clients[0];
  const currentCase = state && selectedClient ? getActiveCaseForClient(state, selectedClient.id) : undefined;
  const reports = state?.reportVersions?.filter((item) => item.caseId === currentCase?.id) ?? [];
  const previewReport = reports.find((item) => item.isPreview);
  const finalReport = reports.find((item) => !item.isPreview);
  const reportHistory = reports;
  const approvalCount = finalReport?.approvals?.length ?? 0;
  const canApproveCurrentReport = Boolean(finalReport) && canApproveReport(activeUser);
  const balancePayment = state?.payments?.find((payment) => payment.caseId === currentCase?.id && payment.type === "BALANCE");
  const verdictReadyByState = Boolean(
    currentCase &&
      finalReport &&
      approvalCount >= 2 &&
      canReleaseOfficialVerdict(currentCase, balancePayment)
  );
  const canReleaseCurrentVerdict = Boolean(finalReport) && canReleaseVerdict(activeUser) && verdictReadyByState;
  const canPrepareFinalReport = Boolean(
    currentCase &&
      currentCase.balanceApproved &&
      currentCase.fullPaymentApproved &&
      balancePayment?.status === "APPROVED"
  );
  const watermarkActive = Boolean(previewReport && isPreviewWatermarked(previewReport));
  const blockerReasons = [
    !previewReport ? "Preview report has not been generated yet." : null,
    !finalReport ? "Final report has not been prepared yet." : null,
    currentCase && !currentCase.balanceApproved ? "Balance is still pending." : null,
    currentCase && !currentCase.fullPaymentApproved ? "Full payment is not approved yet." : null,
    currentCase && balancePayment?.status !== "APPROVED" ? "Balance payment record is not approved." : null,
    finalReport && approvalCount < 2 ? "Two report approvals are required before verdict release." : null,
    finalReport && !canReleaseVerdict(activeUser) ? "Your role cannot release verdicts." : null
  ].filter(Boolean) as string[];

  const nextAction = (() => {
    if (!currentCase) return "Open a case before starting its report.";
    if (!previewReport) return "Create the watermarked preview.";
    if (!canPrepareFinalReport) return "Wait for the balance payment to be approved.";
    if (!finalReport) return "Prepare the final report now.";
    if (approvalCount < 2) return "Collect the remaining report approvals.";
    if (!verdictReadyByState) return "Clear the remaining verdict blockers.";
    return "All report gates are clear. The verdict can now be released.";
  })();

  const releaseChecklist = [
    { label: "Preview exists", done: Boolean(previewReport), note: previewReport ? previewReport.status : "Generate the Stage-A preview first" },
    {
      label: "Balance approved",
      done: Boolean(currentCase?.balanceApproved && currentCase?.fullPaymentApproved && balancePayment?.status === "APPROVED"),
      note: currentCase?.balanceApproved ? "Balance is cleared" : "Balance is still pending"
    },
    { label: "Final report prepared", done: Boolean(finalReport), note: finalReport ? finalReport.status : "Prepare the official report" },
    { label: "Two approvals logged", done: approvalCount >= 2, note: `${approvalCount} / 2 approvals` },
    { label: "Release role allowed", done: canReleaseVerdict(activeUser), note: canReleaseVerdict(activeUser) ? "Role permitted" : "Admin or Super-Admin needed" }
  ];

  async function refresh(preferredClientId?: string) {
    setBusy(true);
    try {
      const nextState = await fetchState();
      setState(nextState);
      setSelectedClientId((current) => preferredClientId ?? current ?? nextState.clients?.[0]?.id ?? "");
      setMessage("Live report state refreshed");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Refresh failed");
    } finally {
      setBusy(false);
    }
  }

  async function run(action: Record<string, unknown>, successMessage: string, confirmation?: string) {
    if (confirmation && !window.confirm(confirmation)) return;
    setBusy(true);
    try {
      await postAction(action, activeUser.role);
      await refresh(selectedClient?.id);
      setMessage(successMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section-grid">
      <div className="card span-8">
        <div className="eyebrow">Reports</div>
        <h2>Finish and release a client report</h2>
        <p className="subtle">Follow the steps in order. The final report cannot be released until payment and both approvals are complete.</p>
        <div className="stat-grid" style={{ marginTop: 18 }}>
          <div className="stat-card">
            <span className="stat-value">{previewReport ? "Yes" : "No"}</span>
            <span className="stat-label">preview ready</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{watermarkActive ? "On" : "Off"}</span>
            <span className="stat-label">preview watermark</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{approvalCount}</span>
            <span className="stat-label">approvals</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{verdictReadyByState ? "Ready" : "Blocked"}</span>
            <span className="stat-label">ready to release</span>
          </div>
        </div>
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="workflow">
            <button className={state ? "button-secondary" : "button"} type="button" onClick={() => refresh()} disabled={busy} aria-busy={busy}>
              {state ? "Refresh" : "Load reports"}
            </button>
            <label htmlFor="report-client"><strong>Client</strong></label>
            <select id="report-client" aria-label="Choose a client" value={selectedClient?.id ?? ""} onChange={(event) => setSelectedClientId(event.target.value)} style={{ minWidth: 220 }}>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.displayName}
                </option>
              ))}
            </select>
          </div>
          <div className="workflow" style={{ marginTop: 14 }}>
            <button
              type="button"
              className={!previewReport ? "button" : "button-secondary"}
              disabled={busy || !currentCase || !canEditFloorWorkspaces(activeUser)}
              onClick={() => run({ action: "preview-report", caseId: currentCase?.id }, "Stage-A preview generated")}
            >
              Create preview
            </button>
            <button
              type="button"
              className={previewReport && canPrepareFinalReport && !finalReport ? "button" : "button-secondary"}
              disabled={busy || !currentCase || !canPrepareFinalReport || !canEditFloorWorkspaces(activeUser)}
              onClick={() => run({ action: "final-report-prepare", caseId: currentCase?.id }, "Final report prepared")}
            >
              Prepare final report
            </button>
            <button
              type="button"
              className={Boolean(finalReport) && approvalCount < 2 ? "button" : "button-secondary"}
              disabled={busy || !canApproveCurrentReport}
              onClick={() => run({ action: "report-approve", reportId: finalReport?.id, comment: approvalComment }, "Approval saved", "Approve this exact report version? This action is recorded in the permanent history.")}
            >
              Approve final report
            </button>
            <button
              type="button"
              className={canReleaseCurrentVerdict ? "button" : "button-secondary"}
              disabled={busy || !canReleaseCurrentVerdict}
              onClick={() => run({ action: "verdict-release", reportId: finalReport?.id }, "Verdict released", "Release this final report to the client? It cannot be silently changed afterwards.")}
            >
              Release final report
            </button>
          </div>
          {finalReport ? (
            <div style={{ marginTop: 14 }}>
              <label htmlFor="approval-comment"><strong>Why are you approving this report?</strong></label>
              <textarea id="approval-comment" value={approvalComment} onChange={(event) => setApprovalComment(event.target.value)} rows={3} style={{ width: "100%", marginTop: 6 }} />
            </div>
          ) : null}
        </div>
        <div className="two-col" style={{ marginTop: 16 }}>
          <div className="panel">
            <div className="panel-head">
              <div>
                <strong>{previewReport?.versionLabel ?? "Stage-A Preview"}</strong>
                <div className="meta">{currentCase?.caseNumber ?? "No case loaded"}</div>
              </div>
              <span className={`tag ${watermarkActive ? "warn" : "good"}`}>
                {watermarkActive ? "Watermarked" : "Clear"}
              </span>
            </div>
            <div className="list" style={{ marginTop: 12 }}>
              <div className="list-item">
                <strong>Preview status</strong>
                <span className="meta">{previewReport?.status ?? "Not created"}</span>
              </div>
              <div className="list-item">
                <strong>Watermark note</strong>
                <span className="meta">{previewReport?.watermarkText ?? "No preview note yet"}</span>
              </div>
              <div className="list-item">
                <strong>Balance gate</strong>
                <span className="meta">{currentCase?.balanceApproved ? "Cleared" : "Pending"}</span>
              </div>
            </div>
          </div>
          <div className="panel">
            <div className="panel-head">
              <div>
                <strong>{finalReport?.versionLabel ?? "Official Verdict Report"}</strong>
                <div className="meta">Approval and release track</div>
              </div>
              <span className={`tag ${verdictReadyByState ? "good" : "warn"}`}>
                {verdictReadyByState ? "Ready" : "Blocked"}
              </span>
            </div>
            <div className="list" style={{ marginTop: 12 }}>
              <div className="list-item">
                <strong>Final report status</strong>
                <span className="meta">{finalReport?.status ?? "Not prepared"}</span>
              </div>
              <div className="list-item">
                <strong>Approval count</strong>
                <span className="meta">{approvalCount} / 2</span>
              </div>
              <div className="list-item">
                <strong>Balance payment</strong>
                <span className="meta">{balancePayment ? `${balancePayment.status} · ${formatMoney(balancePayment.amountInr)}` : "Missing"}</span>
              </div>
              <div className="list-item">
                <strong>Case gate</strong>
                <span className="meta">{currentCase?.reportStatus ?? "DRAFT"}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="panel" style={{ marginTop: 16 }}>
          <div className="panel-head">
            <div>
              <strong>Report archive</strong>
              <div className="meta">Every saved report version stays in this history.</div>
            </div>
          </div>
          <div className="list" style={{ marginTop: 12 }}>
            {reportHistory.length ? (
              reportHistory.map((report) => (
                <div key={report.id} className="list-item">
                  <strong>{report.versionLabel}</strong>
                  <span className="meta">
                    {report.isPreview ? "Preview" : "Official"} · {report.status}
                  </span>
                  <div className="pill-row">
                    <span className={`tag ${report.isPreview ? "warn" : "good"}`}>{report.isPreview ? "Watermarked lane" : "Verdict lane"}</span>
                    <span className="pill">{report.approvals.length} approvals</span>
                    {report.artifact ? <a className="button-secondary" href={report.artifact.downloadPath} target="_blank" rel="noreferrer">Open report</a> : <span className="pill">Older record</span>}
                    {report.watermarkText ? <span className="pill">{report.watermarkText}</span> : null}
                  </div>
                  <details>
                    <summary>Technical and approval details</summary>
                    {report.artifact ? <span className="meta">File fingerprint: {report.artifact.contentHash} · Template: {report.artifact.templateVersion}</span> : null}
                    {(report.approvalEvidence ?? []).map((approval) => <span className="meta" key={`${report.id}-${approval.actorId}`}>{approval.actorName} ({approval.actorRole}) · {new Date(approval.approvedAt).toLocaleString("en-IN")} · {approval.comment}</span>)}
                  </details>
                </div>
              ))
            ) : (
              <div className="list-item">
                <strong>No reports for this client yet</strong>
                <span className="meta">Generate the preview to start the archive</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card span-4">
        <div className="eyebrow">Release path</div>
        <h2>What must happen next</h2>
        <div className="panel" style={{ marginTop: 14 }}>
          <strong>{selectedClient?.displayName ?? "Select a client"}</strong>
          <div className="meta" style={{ marginTop: 6 }}>
            {nextAction}
          </div>
        </div>
        <div className="list" style={{ marginTop: 14 }}>
          {releaseChecklist.map((item) => (
            <div key={item.label} className="list-item">
              <strong>{item.label}</strong>
              <span className={`tag ${item.done ? "good" : "warn"}`}>{item.done ? "Done" : "Pending"}</span>
              <span className="meta">{item.note}</span>
            </div>
          ))}
        </div>
        {blockerReasons.length > 0 ? (
          <div className="footer-note" style={{ marginTop: 12 }}>
            Blockers: {blockerReasons.join(" ")}
          </div>
        ) : (
          <div className="footer-note" style={{ marginTop: 12 }}>
            All verdict gates are clear for the current case.
          </div>
        )}
        <div className="footer-note" role={message.toLowerCase().includes("failed") ? "alert" : "status"} aria-live="polite" style={{ marginTop: 12 }}>
          {message}
        </div>
      </div>
    </section>
  );
}
