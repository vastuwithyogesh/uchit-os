"use client";

import { useEffect, useState } from "react";

type ChartAssetSummaryPayload = {
  summary: {
    required: number;
    uploaded: number;
    pending: number;
    complete: boolean;
    missingKeys: string[];
  };
  definitions: Array<{ key: string; label: string }>;
};

async function fetchChartSummary() {
  const response = await fetch("/api/chart-assets", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load chart asset status");
  }
  return response.json() as Promise<ChartAssetSummaryPayload>;
}

export function ChartAssetBoard() {
  const [payload, setPayload] = useState<ChartAssetSummaryPayload | null>(null);
  const [message, setMessage] = useState("Loading chart asset readiness...");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setBusy(true);
    try {
      const nextPayload = await fetchChartSummary();
      setPayload(nextPayload);
      setMessage(nextPayload.summary.complete ? "All required chart visuals are uploaded." : "Some chart visuals are still missing.");
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
        <div className="eyebrow">Chart asset status</div>
        <h2>Visual readiness for the evaluation flow</h2>
        <p className="subtle">
          These charts remain upload-driven in v1, but we now track whether the full visual set is ready instead of leaving them as untracked placeholders.
        </p>
        <div className="stat-grid" style={{ marginTop: 18 }}>
          <div className="stat-card">
            <span className="stat-value">{payload?.summary.required ?? 0}</span>
            <span className="stat-label">required visuals</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{payload?.summary.uploaded ?? 0}</span>
            <span className="stat-label">uploaded visuals</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{payload?.summary.pending ?? 0}</span>
            <span className="stat-label">pending uploads</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{payload?.summary.complete ? "Yes" : "No"}</span>
            <span className="stat-label">evaluation visuals complete</span>
          </div>
        </div>
        <div className="pill-row" style={{ marginTop: 14 }}>
          <span className="pill">Required {payload?.summary.required ?? 0}</span>
          <span className="pill">Uploaded {payload?.summary.uploaded ?? 0}</span>
          <span className="pill">Pending {payload?.summary.pending ?? 0}</span>
          <span className={`tag ${payload?.summary.complete ? "good" : "warn"}`}>{payload?.summary.complete ? "Complete" : "Incomplete"}</span>
          <button type="button" className="button-secondary" onClick={() => refresh()} disabled={busy}>
            Refresh readiness
          </button>
        </div>
        <div className="list" style={{ marginTop: 14 }}>
          {(payload?.definitions ?? []).map((definition) => {
            const missing = payload?.summary.missingKeys.includes(definition.key) ?? true;
            return (
              <div key={definition.key} className="list-item">
                <strong>{definition.label}</strong>
                <span className={`tag ${missing ? "warn" : "good"}`}>{missing ? "Waiting for upload" : "Uploaded"}</span>
              </div>
            );
          })}
        </div>
        <div className="footer-note">{message}</div>
      </div>
    </section>
  );
}
