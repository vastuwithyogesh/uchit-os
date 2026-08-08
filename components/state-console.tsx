"use client";

import { useEffect, useRef, useState } from "react";

type StatePayload = {
  state: Record<string, unknown>;
  integrity: {
    ok: boolean;
    issues: Array<{ area: string; message: string; severity: "info" | "warn" | "error" }>;
  };
  counts: Record<string, number>;
};

async function fetchState() {
  const response = await fetch("/api/state", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load state export");
  }
  return response.json() as Promise<StatePayload>;
}

async function importState(state: Record<string, unknown>) {
  const response = await fetch("/api/state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state })
  });
  const result = await response.json();
  if (!response.ok || result.ok === false) {
    throw new Error(result.error ?? "Import failed");
  }
  return result as StatePayload & { ok: true };
}

export function StateConsole() {
  const [payload, setPayload] = useState<StatePayload | null>(null);
  const [message, setMessage] = useState("Load the current state export or import a snapshot.");
  const [busy, setBusy] = useState(false);
  const [importText, setImportText] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function refresh() {
    setBusy(true);
    try {
      const nextPayload = await fetchState();
      setPayload(nextPayload);
      setImportText(JSON.stringify(nextPayload.state, null, 2));
      setMessage("Current state exported.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Refresh failed");
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    if (!importText.trim()) {
      setMessage("Paste a snapshot or load a JSON file first.");
      return;
    }

    setBusy(true);
    try {
      const nextState = JSON.parse(importText) as Record<string, unknown>;
      const result = await importState(nextState);
      setMessage(result.integrity.ok ? "State imported cleanly." : "State imported with warnings.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  function downloadSnapshot() {
    if (!payload?.state) {
      setMessage("Export the state first.");
      return;
    }

    const blob = new Blob([JSON.stringify(payload.state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `uchit-vastu-state-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage("Snapshot download started.");
  }

  async function importFromFile(file?: File | null) {
    if (!file) {
      return;
    }

    const text = await file.text();
    setImportText(text);
    setMessage("Snapshot loaded from file. Review it, then restore it.");
  }

  useEffect(() => {
    refresh().catch(() => undefined);
  }, []);

  return (
    <section className="section-grid">
      <div className="card span-8">
        <div className="eyebrow">State export</div>
        <h2>Full local snapshot</h2>
        <p className="subtle">
          This is the entire local app state in one JSON block. It is useful for moving a build snapshot around or restoring the demo after a reset.
        </p>
        <div className="stat-grid" style={{ marginTop: 18 }}>
          <div className="stat-card">
            <span className="stat-value">{payload?.counts.clients ?? 0}</span>
            <span className="stat-label">clients in snapshot</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{payload?.counts.vastuCases ?? 0}</span>
            <span className="stat-label">cases in snapshot</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{payload?.counts.reportVersions ?? 0}</span>
            <span className="stat-label">reports in snapshot</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{payload?.integrity.issues.length ?? 0}</span>
            <span className="stat-label">integrity flags</span>
          </div>
        </div>
        <div className="workflow" style={{ marginTop: 14 }}>
          <button type="button" className="button" onClick={refresh} disabled={busy}>
            Export current state
          </button>
          <button type="button" className="button-secondary" onClick={downloadSnapshot} disabled={busy || !payload}>
            Download snapshot
          </button>
          <button type="button" className="button-secondary" onClick={() => fileInputRef.current?.click()} disabled={busy}>
            Load JSON file
          </button>
          <button type="button" className="button-secondary" onClick={runImport} disabled={busy || !importText.trim()}>
            Restore snapshot
          </button>
        </div>
        <div className="field" style={{ marginTop: 16 }}>
          <label>Snapshot JSON</label>
          <textarea value={importText} onChange={(event) => setImportText(event.target.value)} rows={18} />
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          style={{ display: "none" }}
          onChange={(event) => {
            void importFromFile(event.target.files?.[0]);
            event.currentTarget.value = "";
          }}
        />
      </div>

      <div className="card span-4">
        <div className="eyebrow">Snapshot health</div>
        <h2>Integrity and counts</h2>
        <div className="pill-row" style={{ marginTop: 14 }}>
          <span className="pill">Clients {payload?.counts.clients ?? 0}</span>
          <span className="pill">Bookings {payload?.counts.reviewCallBookings ?? 0}</span>
          <span className="pill">Proof checks {payload?.counts.advanceVerifications ?? 0}</span>
          <span className="pill">Cases {payload?.counts.vastuCases ?? 0}</span>
          <span className="pill">Reports {payload?.counts.reportVersions ?? 0}</span>
          <span className="pill">Issues {payload?.integrity.issues.length ?? 0}</span>
        </div>
        <div className="list" style={{ marginTop: 14 }}>
          {payload?.integrity.issues.map((issue, index) => (
            <div key={`${issue.area}-${index}`} className="list-item">
              <strong>{issue.area}</strong>
              <span className="meta">{issue.message}</span>
              <span className={`tag ${issue.severity === "error" ? "bad" : issue.severity === "warn" ? "warn" : "neutral"}`}>
                {issue.severity}
              </span>
            </div>
          )) ?? (
            <div className="list-item">
              <strong>No integrity issues</strong>
              <span className="meta">Export to verify the current snapshot</span>
            </div>
          )}
        </div>
        <div className="footer-note">{message}</div>
      </div>
    </section>
  );
}
