"use client";

import { useEffect, useState } from "react";
import { FounderStepCard } from "@/components/founder-step-card";

type Check = { key: string; label: string; ready: boolean; recovery: string };
type Payload = { scope: "FOUNDER_INTERNAL_PILOT"; status: "GO" | "NO_GO"; checkedAt: string; build: string; checks: Check[]; deferredIntegrations?: { zoom: { status: "DORMANT" | "READY_FOR_BOUNDED_SYNTHETIC_SMOKE"; credentialsReady: boolean; hostBindingReady: boolean; boundedSyntheticSmokeApproved: boolean; liveActivationEnabled: false } } };

const founderSignOff = [
  "Complete the synthetic Founder workflow from opt-in through protected files, evaluation and Stage A review.",
  "Upload and verify advance and balance evidence; confirm the case and report gates stay server-enforced.",
  "Prepare one floor report, record Founder Reviewed and Founder Approved, then release the protected PDF.",
  "Check Workflow, Files, Evaluation, Site, Payments and Reports on phone and tablet.",
  "Validate the production state backup and record the protected-file inventory.",
  "Print or save the final report as PDF and check page breaks, tables and watermark behavior.",
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
      setPayload(result);
      setMessage(result.status === "GO" ? "Founder checks passed. Complete the controlled Founder walkthrough before any release decision." : "Founder staging is paused. Fix the checks marked Not ready.");
    } catch (error) {
      setPayload(null);
      setMessage(error instanceof Error ? error.message : "System checks could not run.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void refresh(); }, []);
  const blocked = !payload || payload.status === "NO_GO";

  return (
    <section className="section-grid" aria-labelledby="system-check-title">
      <div className="card span-12 founder-work-surface">
        <div className="founder-context-bar" aria-label="Current system context"><span>System check</span><span aria-hidden="true">→</span><span>Founder Edition staging</span></div>
        <FounderStepCard step="Release readiness" title={busy ? "Checking the Founder environment" : payload?.status === "GO" ? "Ready for Founder staging" : "Not ready for Founder staging"} description="This decision covers one organisation owner: the active SUPER_ADMIN/Founder. Team roles and client-facing delivery remain deferred." tone={busy ? "neutral" : payload?.status === "GO" ? "ready" : "blocked"} status={busy ? "Checking" : payload?.status === "GO" ? "Ready" : "No-go"} className="founder-step-card-primary">
          <button type="button" className="button founder-action-primary" disabled={busy} onClick={() => void refresh()}>{busy ? "Checking..." : "Run checks again"}</button>
        </FounderStepCard>
        <FounderStepCard step="Walkthrough" title="One complete Founder rehearsal" description="Use synthetic or owner-approved staging files only. Record any problem before trying to work around it." tone="neutral" status="Operator-led">
          <ol className="pilot-checklist">{founderSignOff.map((item) => <li key={item}>{item}</li>)}</ol>
        </FounderStepCard>
      </div>
      <details><summary>Build details</summary>
        <div className="card span-12 founder-technical-details">
          <h3>Automated checks and recovery</h3>
          <div className="details-body">
            {payload ? <div className="list">
              {payload.checks.map((check) => <div className="list-item" key={check.key}><strong>{check.label}</strong><span className={`tag ${check.ready ? "good" : "warn"}`}>{check.ready ? "Ready" : "Not ready"}</span>{!check.ready && <span className="meta">Next: {check.recovery}</span>}</div>)}
              {payload.deferredIntegrations?.zoom ? <div className="list-item">
                <strong>Zoom Review Call connector</strong>
                <span className={`tag ${payload.deferredIntegrations.zoom.status === "READY_FOR_BOUNDED_SYNTHETIC_SMOKE" ? "good" : "warn"}`}>{payload.deferredIntegrations.zoom.status === "READY_FOR_BOUNDED_SYNTHETIC_SMOKE" ? "Synthetic smoke ready" : "Dormant"}</span>
                <span className="meta">Credentials: {payload.deferredIntegrations.zoom.credentialsReady ? "presence and length verified" : "incomplete"}. Host binding: {payload.deferredIntegrations.zoom.hostBindingReady ? "verified" : "not verified"}. Live activation remains disabled.</span>
              </div> : null}
            </div> : <p className="subtle">No check result is available. Retry. If it still fails, review the deployment logs.</p>}
            <p className="meta">Build {payload?.build ?? "unknown"} · Checked {payload?.checkedAt ? new Date(payload.checkedAt).toLocaleString() : "not yet"}</p>
          </div>
        </div>
      </details>
      <div className="footer-note" role={blocked ? "alert" : "status"} aria-live="polite">{message}</div>
    </section>
  );
}
