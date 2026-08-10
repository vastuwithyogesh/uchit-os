"use client";
import { useEffect, useState } from "react";

type Check = { key: string; label: string; ready: boolean; recovery: string };
type Payload = { status: "GO" | "NO_GO"; checkedAt: string; build: string; checks: Check[] };

export function DiagnosticsConsole() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("Checking release readiness...");
  async function refresh() {
    setBusy(true);
    try {
      const response = await fetch("/api/diagnostics", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "System checks could not run.");
      setPayload(result); setMessage(result.status === "GO" ? "All required checks passed." : "Release is paused. Fix the checks marked Not ready.");
    } catch (error) { setPayload(null); setMessage(error instanceof Error ? error.message : "System checks could not run."); }
    finally { setBusy(false); }
  }
  useEffect(() => { void refresh(); }, []);
  return <section className="section-grid" aria-labelledby="system-check-title">
    <div className="card span-12"><div className="eyebrow">Release decision</div><h1 id="system-check-title">{busy ? "Checking..." : payload?.status === "GO" ? "GO · Ready to release" : "NO-GO · Do not release yet"}</h1><p className="subtle">This checks platform services only. Client, payment, and evaluation records are never shown or counted here.</p><button type="button" className="button" disabled={busy} onClick={() => void refresh()}>{busy ? "Checking..." : "Run checks again"}</button></div>
    <div className="card span-12"><h2>Required checks</h2>{payload ? <div className="list">{payload.checks.map((check) => <div className="list-item" key={check.key}><strong>{check.label}</strong><span className={`tag ${check.ready ? "good" : "warn"}`}>{check.ready ? "Ready" : "Not ready"}</span>{!check.ready && <span className="meta">Next: {check.recovery}</span>}</div>)}</div> : <p className="subtle">No check result is available. Retry. If it still fails, review the deployment logs.</p>}</div>
    <div className="card span-12"><details><summary>Build details</summary><p className="meta">Build {payload?.build ?? "unknown"} · Checked {payload?.checkedAt ? new Date(payload.checkedAt).toLocaleString() : "not yet"}</p></details><div className="footer-note" role={!payload || payload.status === "NO_GO" ? "alert" : "status"} aria-live="polite">{message}</div></div>
  </section>;
}
