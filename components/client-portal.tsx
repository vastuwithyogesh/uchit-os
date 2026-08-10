"use client";

import { useCallback, useEffect, useState } from "react";
import type { ClientPortalView } from "@/lib/client-portal";

type PortalResponse = { ok: true; portal: ClientPortalView } | { ok: false; error?: { code?: string; message?: string } };

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" });

export function ClientPortal() {
  const [portal, setPortal] = useState<ClientPortalView | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unlinked" | "error">("loading");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    setMessage("");
    try {
      const response = await fetch("/api/client/portal", { cache: "no-store" });
      const payload = await response.json() as PortalResponse;
      if (!response.ok || !payload.ok) {
        const failure = payload as Extract<PortalResponse, { ok: false }>;
        setMessage(failure.error?.message ?? "We could not load your journey right now.");
        setStatus(failure.error?.code === "CLIENT_ACCOUNT_UNLINKED" ? "unlinked" : "error");
        return;
      }
      setPortal(payload.portal);
      setStatus("ready");
    } catch {
      setMessage("We could not load your journey. Check your connection and try again.");
      setStatus("error");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (status === "loading") return <section className="card client-state" role="status" aria-live="polite" aria-busy="true"><h1>Loading your Vastu journey…</h1><p className="subtle">We are safely finding your case.</p></section>;
  if (status === "unlinked") return <section className="card client-state" role="status"><div className="eyebrow">Account not linked</div><h1>We need to connect your account</h1><p className="lede">{message}</p><p className="subtle">Share the email you use to sign in. Do not share your password.</p></section>;
  if (status === "error" || !portal) return <section className="card client-state" role="alert"><h1>Your journey could not be loaded</h1><p className="lede">{message}</p><button type="button" className="button" onClick={() => void load()}>Try again</button></section>;

  return (
    <>
      <section className="client-welcome">
        <div>
          <div className="eyebrow">Your Vastu journey</div>
          <h1>Hello, {portal.client.displayName}</h1>
          <p className="lede">Everything important about your case is here in one place.</p>
        </div>
        <div className="client-next-action" aria-labelledby="next-action-title">
          <span className="meta">What to do now</span>
          <strong id="next-action-title">{portal.currentCase?.nextAction ?? "Our team will open your case soon."}</strong>
        </div>
      </section>

      <section className="card client-progress" aria-labelledby="progress-title">
        <div className="eyebrow">Progress</div>
        <h2 id="progress-title">Where your case is now</h2>
        {portal.currentCase ? <>
          <p className="subtle">Case {portal.currentCase.caseNumber}</p>
          <ol className="client-steps" aria-label="Case progress">
            {portal.currentCase.progress.map((step, index) => <li key={`${step.label}-${index}`} className={step.state} aria-current={step.state === "current" ? "step" : undefined}><span aria-hidden="true">{step.state === "done" ? "✓" : index + 1}</span><strong>{step.label}</strong><span className="meta">{step.state === "done" ? "Completed" : step.state === "current" ? "Current step" : "Coming next"}</span></li>)}
          </ol>
        </> : <div className="list-item"><strong>No case is open yet</strong><span className="meta">Your team will contact you with the next step.</span></div>}
      </section>

      <section className="client-grid">
        <div className="card">
          <div className="eyebrow">Appointments</div><h2>Your calls</h2>
          <div className="list">
            {portal.appointments.length ? portal.appointments.map((item) => <div className="list-item" key={item.id}><strong>{date.format(new Date(item.scheduledAt))}</strong><span className="meta">{item.durationMinutes} minutes · {item.status === "CANCELLED" ? "Cancelled" : "Scheduled"}</span>{item.status !== "CANCELLED" ? <a className="button-secondary" href={item.meetingLink} target="_blank" rel="noreferrer" aria-label={`Join call scheduled for ${date.format(new Date(item.scheduledAt))}`}>Join the call</a> : null}</div>) : <div className="list-item"><strong>No upcoming calls</strong><span className="meta">A scheduled call will appear here.</span></div>}
          </div>
        </div>
        <div className="card">
          <div className="eyebrow">Payments</div><h2>Your payment status</h2>
          <div className="list">
            {portal.payments.length ? portal.payments.map((item) => <div className="list-item" key={item.id}><strong>{item.type === "ADVANCE" ? "Advance" : item.type === "BALANCE" ? "Balance" : "Additional payment"} · {money.format(item.amountInr)}</strong><span className={`tag ${item.status === "APPROVED" ? "good" : item.status === "FAILED" ? "bad" : "warn"}`}>{item.status === "APPROVED" ? "Confirmed" : item.status === "FAILED" ? "Needs attention" : "Being checked"}</span></div>) : <div className="list-item"><strong>No payments recorded</strong><span className="meta">Payment status will appear after it is checked.</span></div>}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="eyebrow">Reports</div><h2>Your Vastu reports</h2>
        <div className="list">
          {portal.reports.length ? portal.reports.map((item) => <div className="list-item" key={item.id}><strong>{item.label}</strong><span className="meta">{item.kind === "PREVIEW" ? "Watermarked preview" : "Final report"}</span>{item.available && item.downloadPath ? <a className="button" href={item.downloadPath} target="_blank" rel="noreferrer" aria-label={`${item.kind === "PREVIEW" ? "Open preview" : "Download final report"}: ${item.label}`}>{item.kind === "PREVIEW" ? "Open preview" : "Download final report"}</a> : <><span className="tag warn">Not ready yet</span><span className="meta">We will show the report here as soon as it is ready.</span></>}</div>) : <div className="list-item"><strong>No report yet</strong><span className="meta">Your report will appear here when it is ready.</span></div>}
        </div>
      </section>

      <section className="card">
        <div className="eyebrow">Updates</div><h2>What has happened</h2>
        <div className="timeline">
          {portal.timeline.length ? portal.timeline.map((item) => <article className="timeline-item" key={item.id}><header><div><strong>{item.headline}</strong><div className="meta">{date.format(new Date(item.happenedAt))}</div></div><span className="tag neutral">{item.category}</span></header><p className="subtle">{item.details}</p></article>) : <div className="list-item"><strong>No updates yet</strong><span className="meta">Your case updates will appear here.</span></div>}
        </div>
      </section>
    </>
  );
}
