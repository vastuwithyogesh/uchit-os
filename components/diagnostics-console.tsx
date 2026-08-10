"use client";
import { useEffect, useState } from "react";

type Check = { key: string; label: string; ready: boolean; recovery: string };
type Payload = { scope: "STAFF_INTERNAL_PILOT"; status: "GO" | "NO_GO"; checkedAt: string; build: string; checks: Check[] };

const staffSignOff = [
  "Complete one test client from entry through protected files, evaluation and action plan.",
  "Upload advance and balance evidence, then verify each payment with a different authorized person.",
  "Prepare one final report, collect two approvals from people other than its creator, then release it.",
  "Check Workspace, Files, Evaluation, Action Plan, Payments and Reports on phone and tablet.",
  "Validate the production state backup and record the protected-file inventory.",
  "Print or save the final report as PDF and check page breaks, tables and watermark behavior."
];

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
      setPayload(result); setMessage(result.status === "GO" ? "Automated checks passed. Complete the staff sign-off below before daily use." : "Internal pilot is paused. Fix the checks marked Not ready.");
    } catch (error) { setPayload(null); setMessage(error instanceof Error ? error.message : "System checks could not run."); }
    finally { setBusy(false); }
  }
  useEffect(() => { void refresh(); }, []);
  return <section className="section-grid" aria-labelledby="system-check-title">
    <div className="card span-12"><div className="eyebrow">Internal staff pilot</div><h1 id="system-check-title">{busy ? "Checking..." : payload?.status === "GO" ? "Ready for staff testing" : "Not ready for staff testing"}</h1><p className="subtle">This decision covers the internal team only. Client access and client-facing delivery are intentionally outside this pilot.</p><button type="button" className="button" disabled={busy} onClick={() => void refresh()}>{busy ? "Checking..." : "Run checks again"}</button></div>
    <div className="card span-12"><h2>Automated checks</h2>{payload ? <div className="list">{payload.checks.map((check) => <div className="list-item" key={check.key}><strong>{check.label}</strong><span className={`tag ${check.ready ? "good" : "warn"}`}>{check.ready ? "Ready" : "Not ready"}</span>{!check.ready && <span className="meta">Next: {check.recovery}</span>}</div>)}</div> : <p className="subtle">No check result is available. Retry. If it still fails, review the deployment logs.</p>}</div>
    <div className="card span-12"><div className="eyebrow">Tomorrow&apos;s sign-off</div><h2>One complete staff rehearsal</h2><ol className="pilot-checklist">{staffSignOff.map((item) => <li key={item}>{item}</li>)}</ol><p className="subtle">Do not use real client files for this rehearsal. Record any problem before trying to work around it.</p></div>
    <div className="card span-12"><details><summary>Build details</summary><p className="meta">Build {payload?.build ?? "unknown"} · Checked {payload?.checkedAt ? new Date(payload.checkedAt).toLocaleString() : "not yet"}</p></details><div className="footer-note" role={!payload || payload.status === "NO_GO" ? "alert" : "status"} aria-live="polite">{message}</div></div>
  </section>;
}
