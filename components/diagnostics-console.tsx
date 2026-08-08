"use client";

import { useEffect, useMemo, useState } from "react";
import type { AppState } from "@/lib/store";
import { buildActionHeaders } from "@/lib/request-helpers";
import { useSession } from "@/components/session-provider";

type DiagnosticsPayload = {
  runtime: {
    actor: {
      fullName: string;
      email: string;
      role: string;
    };
    d1Configured: boolean;
    r2Configured: boolean;
      staffAssignments: number;
  };
  launchReadiness: {
    authGovernanceReady: boolean;
    storageReady: boolean;
    leadIntakeReady: boolean;
    commercialReady: boolean;
    paymentReady: boolean;
    reportReady: boolean;
    timelineReady: boolean;
  };
  counts: Record<string, number>;
  latestPaymentProofAssets: Array<{
    key: string;
    label: string;
    fileName: string;
    url: string;
    uploadedAt: string;
  }>;
  latestPayments: Array<{
    id: string;
    clientId: string;
    proposalId?: string;
    caseId?: string;
    type: string;
    amountInr: number;
    status: string;
    referenceScreenshotFileName?: string;
    verifiedBy?: string;
    verifiedAt?: string;
  }>;
  latestReviewCallBookings: Array<{
    id: string;
    clientId: string;
    proposalId: string;
    provider: string;
    scheduledAt: string;
    durationMinutes: number;
    meetingLink: string;
    status: string;
  }>;
  latestAdvanceVerifications: Array<{
    id: string;
    clientId: string;
    proposalId: string;
    amountInr: number;
    referenceScreenshotFileName: string;
    verifiedBy: string;
    verifiedAt: string;
    status: string;
    caseId?: string;
  }>;
  latestEvaluationSnapshots: Array<{
    id: string;
    caseId: string;
    snapshotName: string;
    sourceVersion: string;
    generatedMatrix: Array<{ code: string; verdict: string; confidence: number }>;
  }>;
  latestShaktiSnapshots: Array<{
    id: string;
    caseId: string;
    inputValues: number[];
    elementAverages: Record<string, number>;
    rankedVerdicts: Array<{ element: string; score: number }>;
    tieBreakUsed: boolean;
  }>;
  latestReports: Array<{
    id: string;
    caseId: string;
    versionLabel: string;
    isPreview: boolean;
    status: string;
    watermarkText?: string | null;
    approvals: string[];
  }>;
};

async function fetchDiagnostics() {
  const response = await fetch("/api/diagnostics", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load diagnostics");
  }
  return response.json() as Promise<DiagnosticsPayload>;
}

async function fetchBootstrap() {
  const response = await fetch("/api/bootstrap", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load app state");
  }
  return response.json() as Promise<AppState>;
}

async function postAction(payload: Record<string, unknown>, role?: string) {
  const response = await fetch("/api/actions", {
    method: "POST",
    headers: buildActionHeaders(role),
    body: JSON.stringify(payload)
  });

  const result = await response.json();
  if (!response.ok || result.ok === false) {
    throw new Error(result.error ?? "Request failed");
  }

  return result;
}

export function DiagnosticsConsole() {
  const { activeUser } = useSession();
  const [payload, setPayload] = useState<DiagnosticsPayload | null>(null);
  const [state, setState] = useState<AppState | null>(null);
  const [message, setMessage] = useState("Loading diagnostics...");
  const [busy, setBusy] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedCaseId, setSelectedCaseId] = useState("");

  async function refresh() {
    setBusy(true);
    try {
      const [nextPayload, nextState] = await Promise.all([fetchDiagnostics(), fetchBootstrap()]);
      setPayload(nextPayload);
      setState(nextState);
      const nextClientId = selectedClientId || nextState.clients[0]?.id || "";
      setSelectedClientId(nextClientId);
      const nextCase = nextState.vastuCases.find((item) => item.clientId === nextClientId) ?? nextState.vastuCases[0];
      setSelectedCaseId((current) => current || nextCase?.id || "");
      setMessage("Diagnostics refreshed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Refresh failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const selectedClient = state?.clients.find((client) => client.id === selectedClientId) ?? state?.clients[0];
  const selectedCase = state?.vastuCases.find((item) => item.id === selectedCaseId) ?? state?.vastuCases.find((item) => item.clientId === selectedClient?.id);
  const defaultShaktiValues = useMemo(() => [9, 8, 8, 7, 6, 9, 8, 7, 6, 7, 8, 9, 8, 7, 6, 8], []);

  async function runSnapshot(action: Record<string, unknown>, successMessage: string) {
    if (!selectedCase?.id) {
      setMessage("Select a case first.");
      return;
    }

    setBusy(true);
    try {
      await postAction(
        {
          ...action,
          caseId: selectedCase.id
        },
        activeUser.role
      );
      setMessage(successMessage);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section-grid">
      <div className="card span-12">
        <div className="eyebrow">Snapshot diagnostics</div>
        <h2>Stored evaluation, report, and runtime readiness trail</h2>
        <p className="subtle">This page now checks both workflow persistence and live runtime governance, so we can see the engine state and the deployment state together.</p>
        <div className="stat-grid" style={{ marginTop: 18 }}>
          <div className="stat-card">
            <span className="stat-value">{payload?.counts.reportVersions ?? 0}</span>
            <span className="stat-label">report versions tracked</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{payload?.counts.reviewCallBookings ?? 0}</span>
            <span className="stat-label">review calls logged</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{payload?.counts.advanceVerifications ?? 0}</span>
            <span className="stat-label">proof verifications</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">
              {payload?.launchReadiness.storageReady && payload?.launchReadiness.reportReady && payload?.launchReadiness.timelineReady ? "Good" : "Check"}
            </span>
            <span className="stat-label">current launch posture</span>
          </div>
        </div>
        <button className="button" type="button" onClick={refresh} disabled={busy} style={{ marginTop: 12 }}>
          Refresh diagnostics
        </button>

        <div className="pill-row" style={{ marginTop: 14 }}>
          <span className="pill">Reports {payload?.counts.reportVersions ?? 0}</span>
          <span className="pill">Bookings {payload?.counts.reviewCallBookings ?? 0}</span>
          <span className="pill">Proof checks {payload?.counts.advanceVerifications ?? 0}</span>
          <span className="pill">Proof uploads {payload?.counts.paymentProofAssets ?? 0}</span>
          <span className="pill">Evaluation snapshots {payload?.counts.evaluationSnapshots ?? 0}</span>
          <span className="pill">Shakti snapshots {payload?.counts.shaktiSnapshots ?? 0}</span>
          <span className="pill">Timeline events {payload?.counts.timelineEvents ?? 0}</span>
        </div>

        <div className="two-col" style={{ marginTop: 16 }}>
          <div className="panel">
            <div className="panel-head">
              <div>
                <strong>Launch readiness</strong>
                <div className="meta">A simple checklist for the eventual Sites publish.</div>
              </div>
            </div>
            <div className="list" style={{ marginTop: 12 }}>
              <div className="list-item">
                <strong>Auth governance</strong>
                <span className={`tag ${payload?.launchReadiness.authGovernanceReady ? "good" : "warn"}`}>{payload?.launchReadiness.authGovernanceReady ? "Ready" : "Pending"}</span>
              </div>
              <div className="list-item">
                <strong>Storage bindings</strong>
                <span className={`tag ${payload?.launchReadiness.storageReady ? "good" : "warn"}`}>{payload?.launchReadiness.storageReady ? "Ready" : "Pending"}</span>
              </div>
              <div className="list-item">
                <strong>Lead intake</strong>
                <span className={`tag ${payload?.launchReadiness.leadIntakeReady ? "good" : "warn"}`}>{payload?.launchReadiness.leadIntakeReady ? "Ready" : "Pending"}</span>
              </div>
              <div className="list-item">
                <strong>Commercial flow</strong>
                <span className={`tag ${payload?.launchReadiness.commercialReady ? "good" : "warn"}`}>{payload?.launchReadiness.commercialReady ? "Ready" : "Pending"}</span>
              </div>
              <div className="list-item">
                <strong>Payment verification</strong>
                <span className={`tag ${payload?.launchReadiness.paymentReady ? "good" : "warn"}`}>{payload?.launchReadiness.paymentReady ? "Ready" : "Pending"}</span>
              </div>
              <div className="list-item">
                <strong>Report release</strong>
                <span className={`tag ${payload?.launchReadiness.reportReady ? "good" : "warn"}`}>{payload?.launchReadiness.reportReady ? "Ready" : "Pending"}</span>
              </div>
              <div className="list-item">
                <strong>Timeline audit trail</strong>
                <span className={`tag ${payload?.launchReadiness.timelineReady ? "good" : "warn"}`}>{payload?.launchReadiness.timelineReady ? "Ready" : "Pending"}</span>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <strong>Runtime readiness</strong>
                <div className="meta">Current actor, storage bindings, and staff-role mapping coverage</div>
              </div>
            </div>
            <div className="list" style={{ marginTop: 12 }}>
              <div className="list-item">
                <strong>Signed-in actor</strong>
                <span className="meta">
                  {payload?.runtime.actor.fullName ?? "Unknown"} · {payload?.runtime.actor.role ?? "Unknown"}
                </span>
              </div>
              <div className="list-item">
                <strong>D1 binding</strong>
                <span className={`tag ${payload?.runtime.d1Configured ? "good" : "warn"}`}>{payload?.runtime.d1Configured ? "Configured" : "Missing"}</span>
              </div>
              <div className="list-item">
                <strong>R2 binding</strong>
                <span className={`tag ${payload?.runtime.r2Configured ? "good" : "warn"}`}>{payload?.runtime.r2Configured ? "Configured" : "Missing"}</span>
              </div>
              <div className="list-item">
                <strong>Staff role assignments</strong>
                <span className="meta">{payload?.runtime.staffAssignments ?? 0} mapped staff accounts</span>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <strong>Create fresh snapshots</strong>
                <div className="meta">Run the engine intentionally and watch the persisted trail update.</div>
              </div>
            </div>
            <div className="workflow" style={{ marginTop: 12 }}>
              <select
                value={selectedClientId}
                onChange={(event) => {
                  const nextClientId = event.target.value;
                  setSelectedClientId(nextClientId);
                  const nextCase = state?.vastuCases.find((item) => item.clientId === nextClientId) ?? state?.vastuCases[0];
                  setSelectedCaseId(nextCase?.id ?? "");
                }}
                style={{ minWidth: 220 }}
              >
                {state?.clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.displayName}
                  </option>
                ))}
              </select>
              <select value={selectedCase?.id ?? ""} onChange={(event) => setSelectedCaseId(event.target.value)} style={{ minWidth: 220 }}>
                {state?.vastuCases
                  .filter((item) => !selectedClient || item.clientId === selectedClient.id)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.caseNumber}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                className="button-secondary"
                disabled={busy || !selectedCase}
                onClick={() =>
                  runSnapshot(
                    {
                      action: "utility-evaluate",
                      snapshotName: "Diagnostics utility snapshot",
                      zoneCodes: state?.utilityRules.map((rule) => rule.zoneCode) ?? []
                    },
                    "Utility evaluation snapshot created"
                  )
                }
              >
                Run utility snapshot
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={busy || !selectedCase}
                onClick={() =>
                  runSnapshot(
                    {
                      action: "shakti-rank",
                      values: defaultShaktiValues
                    },
                    "Shakti snapshot created"
                  )
                }
              >
                Run Shakti snapshot
              </button>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <strong>Latest payments</strong>
                <div className="meta">Recent advance and balance verification trail</div>
              </div>
            </div>
            <div className="list" style={{ marginTop: 12 }}>
              {payload?.latestPayments.length ? (
                payload.latestPayments.map((payment) => (
                  <div key={payment.id} className="list-item">
                    <strong>{payment.clientId}</strong>
                    <span className="meta">
                      {payment.type} · {payment.status} · ₹{payment.amountInr.toLocaleString("en-IN")}
                    </span>
                    <span className="meta">{payment.referenceScreenshotFileName ?? "No proof file"}</span>
                  </div>
                ))
              ) : (
                <div className="list-item">
                  <strong>No payments yet</strong>
                  <span className="meta">Verify advance or balance proof to create the trail</span>
                </div>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <strong>Latest review-call bookings</strong>
                <div className="meta">Calendar holds and meeting links</div>
              </div>
            </div>
            <div className="list" style={{ marginTop: 12 }}>
              {payload?.latestReviewCallBookings.length ? (
                payload.latestReviewCallBookings.map((booking) => (
                  <div key={booking.id} className="list-item">
                    <strong>{booking.clientId}</strong>
                    <span className="meta">
                      {booking.provider} · {booking.status} · {new Date(booking.scheduledAt).toLocaleString()}
                    </span>
                    <span className="meta">{booking.meetingLink}</span>
                  </div>
                ))
              ) : (
                <div className="list-item">
                  <strong>No bookings yet</strong>
                  <span className="meta">Book a review call to create one</span>
                </div>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <strong>Latest evaluation snapshots</strong>
                <div className="meta">Most recent persisted matrices</div>
              </div>
            </div>
            <div className="list" style={{ marginTop: 12 }}>
              {payload?.latestEvaluationSnapshots.length ? (
                payload.latestEvaluationSnapshots.map((snapshot) => (
                  <div key={snapshot.id} className="list-item">
                    <strong>{snapshot.snapshotName}</strong>
                    <span className="meta">{snapshot.sourceVersion}</span>
                    <span className="meta">{snapshot.generatedMatrix.length} zones</span>
                  </div>
                ))
              ) : (
                <div className="list-item">
                  <strong>No snapshots yet</strong>
                  <span className="meta">Run utility evaluation to create one</span>
                </div>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <strong>Latest advance verifications</strong>
                <div className="meta">Proof screenshot checks and auto-opened cases</div>
              </div>
            </div>
            <div className="list" style={{ marginTop: 12 }}>
              {payload?.latestAdvanceVerifications.length ? (
                payload.latestAdvanceVerifications.map((verification) => (
                  <div key={verification.id} className="list-item">
                    <strong>{verification.clientId}</strong>
                    <span className="meta">
                      {verification.status} · {verification.amountInr} · {new Date(verification.verifiedAt).toLocaleString()}
                    </span>
                    <span className="meta">{verification.referenceScreenshotFileName || "No screenshot name"}</span>
                  </div>
                ))
              ) : (
                <div className="list-item">
                  <strong>No advance checks yet</strong>
                  <span className="meta">Upload a proof screenshot to create one</span>
                </div>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <strong>Latest payment proof uploads</strong>
                <div className="meta">Advance and balance images uploaded for the commercial lane</div>
              </div>
            </div>
            <div className="list" style={{ marginTop: 12 }}>
              {payload?.latestPaymentProofAssets.length ? (
                payload.latestPaymentProofAssets.map((asset) => (
                  <div key={asset.key} className="list-item">
                    <strong>{asset.label}</strong>
                    <span className="meta">
                      {asset.fileName} · {new Date(asset.uploadedAt).toLocaleString()}
                    </span>
                    <a href={asset.url} className="pill" target="_blank" rel="noreferrer">
                      Open proof
                    </a>
                  </div>
                ))
              ) : (
                <div className="list-item">
                  <strong>No proof uploads yet</strong>
                  <span className="meta">Upload advance or balance proof to create the record</span>
                </div>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <strong>Latest Shakti snapshots</strong>
                <div className="meta">Most recent rankings and tie-break usage</div>
              </div>
            </div>
            <div className="list" style={{ marginTop: 12 }}>
              {payload?.latestShaktiSnapshots.length ? (
                payload.latestShaktiSnapshots.map((snapshot) => (
                  <div key={snapshot.id} className="list-item">
                    <strong>{snapshot.caseId}</strong>
                    <span className="meta">
                      {snapshot.inputValues.length} inputs · {snapshot.tieBreakUsed ? "tie-break used" : "clear ranking"}
                    </span>
                    <span className="meta">{Object.keys(snapshot.elementAverages).length} elements</span>
                  </div>
                ))
              ) : (
                <div className="list-item">
                  <strong>No snapshots yet</strong>
                  <span className="meta">Run Shakti ranking to create one</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="panel" style={{ marginTop: 16 }}>
          <div className="panel-head">
            <div>
              <strong>Latest reports</strong>
              <div className="meta">Version, preview state, approvals, and watermark</div>
            </div>
          </div>
          <div className="list" style={{ marginTop: 12 }}>
            {payload?.latestReports.length ? (
              payload.latestReports.map((report) => (
                <div key={report.id} className="list-item">
                  <strong>{report.versionLabel}</strong>
                  <span className="meta">{report.caseId}</span>
                  <div className="pill-row">
                    <span className="pill">{report.status}</span>
                    <span className="pill">{report.isPreview ? "Preview" : "Official"}</span>
                    <span className="pill">{report.approvals.length} approvals</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="list-item">
                <strong>No reports yet</strong>
                <span className="meta">Generate a preview to create one</span>
              </div>
            )}
          </div>
        </div>

        <div className="footer-note">{message}</div>
      </div>
    </section>
  );
}
