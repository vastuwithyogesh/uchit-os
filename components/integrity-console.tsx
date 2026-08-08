"use client";

import { useEffect, useState } from "react";

type IntegrityPayload = {
  ok: boolean;
  issueCount: number;
  runtime: {
    d1Configured: boolean;
    r2Configured: boolean;
    staffAssignments: number;
  };
  counts: Record<string, number>;
  latestPaymentProofAssets: Array<{
    key: string;
    label: string;
    fileName: string;
    url: string;
    uploadedAt: string;
  }>;
  issues: Array<{
    area: string;
    message: string;
    severity: "info" | "warn" | "error";
  }>;
};

async function fetchIntegrity() {
  const response = await fetch("/api/integrity", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load integrity summary");
  }
  return response.json() as Promise<IntegrityPayload>;
}

export function IntegrityConsole() {
  const [payload, setPayload] = useState<IntegrityPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Loading integrity summary...");

  async function refresh() {
    setBusy(true);
    try {
      const nextPayload = await fetchIntegrity();
      setPayload(nextPayload);
      setMessage(nextPayload.ok ? "No blocking integrity issues found." : "Some records need attention.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Refresh failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refresh().catch(() => undefined);
  }, []);

  return (
    <section className="section-grid">
      <div className="card span-12">
        <div className="eyebrow">Integrity check</div>
        <h2>Backend record consistency</h2>
        <p className="subtle">
          This pass checks that the current state has the expected links between clients, proposals, payments, cases, reports, snapshots, and logs.
        </p>
        <div className="stat-grid" style={{ marginTop: 18 }}>
          <div className="stat-card">
            <span className="stat-value">{payload?.ok ? "OK" : "Check"}</span>
            <span className="stat-label">overall integrity state</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{payload?.issueCount ?? 0}</span>
            <span className="stat-label">issues found</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{payload?.counts.reportVersions ?? 0}</span>
            <span className="stat-label">reports scanned</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{(payload?.counts.evaluationSnapshots ?? 0) + (payload?.counts.shaktiSnapshots ?? 0)}</span>
            <span className="stat-label">snapshots scanned</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{payload?.counts.paymentProofAssets ?? 0}</span>
            <span className="stat-label">proof uploads scanned</span>
          </div>
        </div>
        <button className="button" type="button" onClick={refresh} disabled={busy} style={{ marginTop: 12 }}>
          Refresh integrity
        </button>
        <div className="pill-row" style={{ marginTop: 14 }}>
          <span className="pill">Status {payload?.ok ? "OK" : "Needs attention"}</span>
          <span className="pill">Issues {payload?.issueCount ?? 0}</span>
          <span className="pill">D1 {payload?.runtime.d1Configured ? "On" : "Off"}</span>
          <span className="pill">R2 {payload?.runtime.r2Configured ? "On" : "Off"}</span>
          <span className="pill">Staff roles {payload?.runtime.staffAssignments ?? 0}</span>
          <span className="pill">Reports {payload?.counts.reportVersions ?? 0}</span>
          <span className="pill">Snapshots {(payload?.counts.evaluationSnapshots ?? 0) + (payload?.counts.shaktiSnapshots ?? 0)}</span>
          <span className="pill">Proof uploads {payload?.counts.paymentProofAssets ?? 0}</span>
        </div>
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="panel-head">
            <div>
              <strong>Latest proof uploads</strong>
              <div className="meta">Advance and balance screenshots now count as part of integrity</div>
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
                <span className="meta">Upload advance or balance proof to include them here</span>
              </div>
            )}
          </div>
        </div>
        <div className="list" style={{ marginTop: 16 }}>
          {payload?.issues.map((issue, index) => (
            <div key={`${issue.area}-${index}`} className="list-item">
              <strong>{issue.area}</strong>
              <span className="meta">{issue.message}</span>
              <span className={`tag ${issue.severity === "error" ? "bad" : issue.severity === "warn" ? "warn" : "neutral"}`}>
                {issue.severity}
              </span>
            </div>
          )) ?? (
            <div className="list-item">
              <strong>No issues loaded yet</strong>
              <span className="meta">Refresh to run the check</span>
            </div>
          )}
        </div>
        <div className="footer-note">{message}</div>
      </div>
    </section>
  );
}
