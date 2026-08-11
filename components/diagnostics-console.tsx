"use client";
import { useEffect, useState } from "react";

type Check = { key: string; label: string; ready: boolean; recovery: string };
type Payload = { scope: "FOUNDER_INTERNAL_PILOT"; status: "GO" | "NO_GO"; checkedAt: string; build: string; checks: Check[] };

const founderSignOff = [
  "Complete the synthetic Founder workflow from opt-in through protected files, evaluation and Stage A review.",
  "Upload and verify advance and balance evidence; confirm the case and report gates stay server-enforced.",
  "Prepare one floor report, record Founder Reviewed and Founder Approved, then release the protected PDF.",
  "Check Workflow, Files, Evaluation, Site, Payments and Reports on phone and tablet.",
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
      setPayload(result); setMessage(result.status === "GO" ? "Founder checks passed. Complete the controlled Founder walkthrough before any release decision." : "Founder staging is paused. Fix the checks marked Not ready.");
    } catch (error) { setPayload(null); setMessage(error instanceof Error ? error.message : "System checks could not run."); }
    finally { setBusy(false); }
  }
  useEffect(() => { void refresh(); }, []);
  return <section className="section-grid" aria-labelledby="system-check-title">
    <div className="card span-12"><div className="eyebrow">Founder Edition staging</div><h1 id="system-check-title">{busy ? "Checking..." : payload?.status === "GO" ? "Ready for Founder staging" : "Not ready for Founder staging"}</h1><p className="subtle">This decision covers one organisation owner: the active SUPER_ADMIN/Founder. Team roles and client-facing delivery remain deferred.</p><button type="button" className="button" disabled={busy} onClick={() => void refresh()}>{busy ? "Checking..." : "Run checks again"}</button></div>
    <div className="card span-12"><h2>Automated checks</h2>{payload ? <div className="list">{payload.checks.map((check) => <div className="list-item" key={check.key}><strong>{check.label}</strong><span className={`tag ${check.ready ? "good" : "warn"}`}>{check.ready ? "Ready" : "Not ready"}</span>{!check.ready && <span className="meta">Next: {check.recovery}</span>}</div>)}</div> : <p className="subtle">No check result is available. Retry. If it still fails, review the deployment logs.</p>}</div>
    <div className="card span-12"><div className="eyebrow">Founder walkthrough</div><h2>One complete Founder rehearsal</h2><ol className="pilot-checklist">{founderSignOff.map((item) => <li key={item}>{item}</li>)}</ol><p className="subtle">Use synthetic or owner-approved staging files only. Record any problem before trying to work around it.</p></div>
    <div className="card span-12"><details><summary>Build details</summary><p className="meta">Build {payload?.build ?? "unknown"} · Checked {payload?.checkedAt ? new Date(payload.checkedAt).toLocaleString() : "not yet"}</p></details><div className="footer-note" role={!payload || payload.status === "NO_GO" ? "alert" : "status"} aria-live="polite">{message}</div></div>
  </section>;
}
