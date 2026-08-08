"use client";

import { useEffect, useState } from "react";

type IntegrityPayload = {
  ok: boolean;
  issueCount: number;
  counts: Record<string, number>;
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
        <button className="button" type="button" onClick={refresh} disabled={busy} style={{ marginTop: 12 }}>
          Refresh integrity
        </button>
        <div className="pill-row" style={{ marginTop: 14 }}>
          <span className="pill">Status {payload?.ok ? "OK" : "Needs attention"}</span>
          <span className="pill">Issues {payload?.issueCount ?? 0}</span>
          <span className="pill">Reports {payload?.counts.reportVersions ?? 0}</span>
          <span className="pill">Snapshots {(payload?.counts.evaluationSnapshots ?? 0) + (payload?.counts.shaktiSnapshots ?? 0)}</span>
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
