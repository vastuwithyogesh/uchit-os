"use client";

import { useState } from "react";
import type { AppState } from "@/lib/store";
import { useSession } from "@/components/session-provider";
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
  const [message, setMessage] = useState("Load the live state to inspect report versions.");
  const [selectedClientId, setSelectedClientId] = useState("");

  const clients = state?.clients ?? [];
  const selectedClient = clients.find((client) => client.id === selectedClientId) ?? clients[0];
  const currentCase = state?.vastuCases?.find((item) => item.clientId === selectedClient?.id);
  const reports = state?.reportVersions?.filter((item) => item.caseId === currentCase?.id) ?? [];
  const previewReport = reports.find((item) => item.isPreview);
  const finalReport = reports.find((item) => !item.isPreview);
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
    if (!currentCase) return "Open the case before the report flow can begin.";
    if (!previewReport) return "Generate the Stage-A preview.";
    if (!canPrepareFinalReport) return "Approve the balance so the final report can be prepared.";
    if (!finalReport) return "Prepare the final report now.";
    if (approvalCount < 2) return "Collect the remaining report approvals.";
    if (!verdictReadyByState) return "Clear the remaining verdict blockers.";
    return "All report gates are clear. The verdict can now be released.";
  })();

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

  async function run(action: Record<string, unknown>, successMessage: string) {
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
        <div className="eyebrow">Report generation</div>
        <h2>Stage-A preview, final report, approvals, and verdict release</h2>
        <p className="subtle">
          This page follows the full report chain: generate the preview, keep it watermarked while balance is pending, prepare the official report after payment, collect two approvals, and only then release the verdict.
        </p>
        <div className="stat-grid" style={{ marginTop: 18 }}>
          <div className="stat-card">
            <span className="stat-value">{previewReport ? "Yes" : "No"}</span>
            <span className="stat-label">preview generated</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{watermarkActive ? "On" : "Off"}</span>
            <span className="stat-label">watermark state</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{approvalCount}</span>
            <span className="stat-label">final approvals logged</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{verdictReadyByState ? "Ready" : "Blocked"}</span>
            <span className="stat-label">verdict release state</span>
          </div>
        </div>
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="workflow">
            <button className="button" type="button" onClick={() => refresh()} disabled={busy}>
              Refresh report state
            </button>
            <select value={selectedClient?.id ?? ""} onChange={(event) => setSelectedClientId(event.target.value)} style={{ minWidth: 220 }}>
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
              className="button-secondary"
              disabled={busy || !currentCase || !canEditFloorWorkspaces(activeUser)}
              onClick={() => run({ action: "preview-report", caseId: currentCase?.id }, "Stage-A preview generated")}
            >
              Generate preview
            </button>
            <button
              type="button"
              className="button-secondary"
              disabled={busy || !currentCase || !canPrepareFinalReport || !canEditFloorWorkspaces(activeUser)}
              onClick={() => run({ action: "final-report-prepare", caseId: currentCase?.id }, "Final report prepared")}
            >
              Prepare final report
            </button>
            <button
              type="button"
              className="button-secondary"
              disabled={busy || !canApproveCurrentReport}
              onClick={() => run({ action: "report-approve", reportId: finalReport?.id }, "Final report approved")}
            >
              Approve final report
            </button>
            <button
              type="button"
              className="button"
              disabled={busy || !canReleaseCurrentVerdict}
              onClick={() => run({ action: "verdict-release", reportId: finalReport?.id }, "Verdict released")}
            >
              Release verdict
            </button>
          </div>
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
          <div className="list-item">
            <strong>Preview</strong>
            <span className="meta">Can be generated before balance, but stays watermarked</span>
          </div>
          <div className="list-item">
            <strong>Final report</strong>
            <span className="meta">Can only be prepared after balance approval</span>
          </div>
          <div className="list-item">
            <strong>Approvals</strong>
            <span className="meta">Two sign-offs required for verdict release</span>
          </div>
          <div className="list-item">
            <strong>Release role</strong>
            <span className="meta">Admin or Super-Admin</span>
          </div>
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
        <div className="footer-note" style={{ marginTop: 12 }}>
          {message}
        </div>
      </div>
    </section>
  );
}
