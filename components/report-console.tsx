"use client";

import { useMemo, useState } from "react";
import type { AppState } from "@/lib/store";
import { useSession } from "@/components/session-provider";
import { canApproveReport, canReleaseVerdict } from "@/lib/permissions";
import { canReleaseOfficialVerdict, isPreviewWatermarked, formatMoney } from "@/lib/workflows";

async function fetchState() {
  const response = await fetch("/api/bootstrap", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load bootstrap state");
  }
  return response.json();
}

async function postAction(payload: Record<string, unknown>) {
  const response = await fetch("/api/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  const currentReport = reports[0];
  const approvalCount = currentReport?.approvals?.length ?? 0;
  const canApproveCurrentReport = Boolean(currentReport) && canApproveReport(activeUser);
  const balancePayment = state?.payments?.find((payment) => payment.caseId === currentCase?.id && payment.type === "BALANCE");
  const verdictReadyByState = Boolean(currentCase && currentReport && currentCase.balanceApproved && currentCase.fullPaymentApproved && balancePayment?.status === "APPROVED" && approvalCount >= 2);
  const canReleaseCurrentVerdict = Boolean(currentReport) && canReleaseVerdict(activeUser) && verdictReadyByState;
  const watermarkActive = Boolean(currentReport && isPreviewWatermarked(currentReport));
  const blockerReasons = [
    !currentReport ? "No report version selected." : null,
    currentReport && !currentReport.isPreview && !currentCase?.balanceApproved ? "Balance is still pending." : null,
    currentCase && !currentCase.fullPaymentApproved ? "Full payment is not approved yet." : null,
    currentCase && balancePayment?.status !== "APPROVED" ? "Balance payment record is not approved." : null,
    currentReport && approvalCount < 2 ? "Two report approvals are required before verdict release." : null,
    currentReport && !canReleaseVerdict(activeUser) ? "Your role cannot release verdicts." : null
  ].filter(Boolean) as string[];

  const reportLines = useMemo(() => {
    if (!currentReport) {
      return [];
    }

    return [
      { label: "Version", value: currentReport.versionLabel },
      { label: "Status", value: currentReport.status },
      { label: "Watermark", value: currentReport.watermarkText ?? "None" },
      { label: "Approvals", value: String(approvalCount) },
      { label: "Balance payment", value: balancePayment ? `${balancePayment.status} · ${formatMoney(balancePayment.amountInr)}` : "Missing" }
    ];
  }, [currentReport, approvalCount, balancePayment]);

  async function refresh() {
    setBusy(true);
    try {
      const nextState = await fetchState();
      setState(nextState);
      setSelectedClientId((current) => current || nextState.clients?.[0]?.id || "");
      setMessage("Live report state refreshed");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Refresh failed");
    } finally {
      setBusy(false);
    }
  }

  async function run(action: Record<string, unknown>, successMessage: string) {
    if (!selectedClient || !currentCase || !currentReport) {
      return;
    }

    setBusy(true);
    try {
      const result = await postAction({
        ...action,
        actorRole: activeUser.role,
        clientId: selectedClient.id
      });
      if (result.ok) {
        setMessage(successMessage);
        await refresh();
      }
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
        <h2>Stage-A preview, approval, and verdict release</h2>
        <p className="subtle">
          This page shows the report lifecycle in a more focused way: generate the preview, keep it watermarked while balance is pending, approve it, and then release the final verdict when the gates are clear.
        </p>
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="field">
            <label>Client</label>
            <select value={selectedClient?.id ?? ""} onChange={(event) => setSelectedClientId(event.target.value)}>
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
              disabled={busy || !currentCase}
              onClick={() => run({ action: "preview-report", caseId: currentCase?.id }, "Stage-A preview generated")}
            >
              Generate preview
            </button>
            <button
              type="button"
              className="button-secondary"
              disabled={busy || !canApproveCurrentReport}
              onClick={() => run({ action: "report-approve", reportId: currentReport?.id }, "Report approved")}
            >
              Approve report
            </button>
            <button
              type="button"
              className="button"
              disabled={busy || !canReleaseCurrentVerdict}
              onClick={() => run({ action: "verdict-release", reportId: currentReport?.id }, "Verdict released")}
            >
              Release verdict
            </button>
          </div>
        </div>
        <div className="two-col" style={{ marginTop: 16 }}>
          <div className="panel">
            <div className="panel-head">
              <div>
                <strong>{currentReport?.versionLabel ?? "No report loaded"}</strong>
                <div className="meta">{currentCase?.caseNumber ?? "No case loaded"}</div>
              </div>
              <span className={`tag ${watermarkActive ? "warn" : "good"}`}>
                {watermarkActive ? "Watermarked" : "Official"}
              </span>
            </div>
            <div className="list" style={{ marginTop: 12 }}>
              {reportLines.map((line) => (
                <div key={line.label} className="list-item">
                  <strong>{line.label}</strong>
                  <span className="meta">{line.value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="panel">
            <div className="panel-head">
              <div>
                <strong>Verdict card</strong>
                <div className="meta">Balance gate, approval count, and release readiness</div>
              </div>
              <span className={`tag ${verdictReadyByState ? "good" : "warn"}`}>
                {verdictReadyByState ? "Ready" : "Blocked"}
              </span>
            </div>
            <div className="list" style={{ marginTop: 12 }}>
              <div className="list-item">
                <strong>Preview state</strong>
                <span className="meta">{currentReport ? (watermarkActive ? "Watermarked preview" : "Official report") : "No report selected"}</span>
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
                <strong>Verdict readiness</strong>
                <span className="meta">{verdictReadyByState ? "Release allowed" : "Blocked until all gates clear"}</span>
              </div>
            </div>
            <div className="pill-row" style={{ marginTop: 14 }}>
              <span className="pill">Report gate {currentCase?.reportStatus ?? "DRAFT"}</span>
              <span className="pill">Balance {currentCase?.balanceApproved ? "approved" : "pending"}</span>
              <span className="pill">Verdict {currentCase?.fullPaymentApproved ? "eligible" : "locked"}</span>
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
          </div>
        </div>
      </div>

      <div className="card span-4">
        <div className="eyebrow">Report rules</div>
        <h2>What must be true</h2>
        <div className="list" style={{ marginTop: 14 }}>
          <div className="list-item">
            <strong>Preview</strong>
            <span className="meta">Watermarked while balance is pending</span>
          </div>
          <div className="list-item">
            <strong>Approval</strong>
            <span className="meta">Available to consultant, admin, and super-admin</span>
          </div>
          <div className="list-item">
            <strong>Verdict release</strong>
            <span className="meta">Requires balance approval and two report approvals</span>
          </div>
          <div className="list-item">
            <strong>Current status</strong>
            <span className="meta">{message}</span>
          </div>
        </div>
        <button className="button-secondary" type="button" onClick={refresh} disabled={busy} style={{ marginTop: 12 }}>
          Refresh report state
        </button>
      </div>
    </section>
  );
}
