"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { buildActionHeaders } from "@/lib/request-helpers";
import { useSession } from "@/components/session-provider";
import type { DeliveryReadinessProjection } from "@/lib/document-delivery";
import type { DocumentDeliveryEventRecord, DocumentDeliveryRecord } from "@/lib/domain";
import type { ProtectedPdfDeliveryDescriptor } from "@/lib/final-pdf.server";

type DeliveryRow = {
  report: { id: string; versionLabel: string; status: string; recordVersion: number; canonicalHash: string; templateSnapshotHash: string | null };
  context: { caseNumber: string; clientName: string; clientEmail: string; projectName: string; floorLabel: string };
  protectedPdf: ProtectedPdfDeliveryDescriptor | null; protectedPdfError: string | null;
  readiness: DeliveryReadinessProjection; delivery: DocumentDeliveryRecord | null;
  events: DocumentDeliveryEventRecord[]; health: { healthy: boolean; issues: string[] };
};
type DashboardResponse = { ok: true; revision: number | null; rows: DeliveryRow[] } | { ok: false; error: string };

const when = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" });
const shortHash = (value?: string | null) => value ? `${value.slice(0, 12)}…${value.slice(-8)}` : "Unavailable";

export function DocumentDeliveryConsole() {
  const { activeUser } = useSession(); const [data, setData] = useState<Extract<DashboardResponse, { ok: true }> | null>(null);
  const [selectedId, setSelectedId] = useState(""); const [filter, setFilter] = useState<"ALL" | "READY" | "DELIVERED" | "AWAITING_ACK" | "REPLACEMENT">("ALL");
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("Loading delivery readiness…");
  const [manualDescription, setManualDescription] = useState("Protected PDF handed directly to the named client recipient.");

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/report-deliveries", { cache: "no-store" }); const payload = await response.json() as DashboardResponse;
      if (!response.ok || !payload.ok) throw new Error((payload as Extract<DashboardResponse, { ok: false }>).error ?? "Delivery dashboard could not load.");
      setData(payload); setSelectedId((current) => payload.rows.some((item) => item.report.id === current) ? current : payload.rows[0]?.report.id ?? ""); setMessage("Delivery state is current.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Delivery dashboard could not load."); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => (data?.rows ?? []).filter((row) => filter === "ALL" ? true
    : filter === "READY" ? row.delivery?.status === "READY"
      : filter === "DELIVERED" ? row.delivery?.status === "DELIVERED" || row.delivery?.status === "ACKNOWLEDGED"
        : filter === "AWAITING_ACK" ? row.delivery?.status === "DELIVERED"
          : Boolean(row.delivery?.replacementForDeliveryId)), [data, filter]);
  const selected = data?.rows.find((item) => item.report.id === selectedId) ?? rows[0];

  const run = useCallback(async (payload: Record<string, unknown>, confirmation?: string) => {
    if (!data || (confirmation && !window.confirm(confirmation))) return; setBusy(true); setMessage("Saving protected delivery state…");
    try {
      const response = await fetch("/api/actions", { method: "POST", headers: buildActionHeaders(activeUser.role), body: JSON.stringify({ ...payload, expectedRevision: data.revision }) });
      const result = await response.json() as { ok?: boolean; error?: string; result?: { readiness?: DeliveryReadinessProjection } };
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Delivery action failed.");
      if (result.result?.readiness && !result.result.readiness.ready) setMessage(`Readiness blocked: ${result.result.readiness.blockers.join(" ")}`);
      else setMessage("Delivery action completed."); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Delivery action failed."); }
    finally { setBusy(false); }
  }, [activeUser.role, data, load]);

  return <section className="delivery-admin-shell" aria-busy={busy}>
    <div className="card delivery-dashboard-head"><div><div className="eyebrow">Final report handoff</div><h2>Delivery dashboard</h2><p className="subtle">Distribution uses the exact released protected artifact. It never rebuilds or restyles the report.</p></div>
      <button type="button" className="button-secondary" onClick={() => void load()} disabled={busy}>Refresh</button></div>
    <div className="pill-row" role="group" aria-label="Delivery filters">{(["ALL", "READY", "DELIVERED", "AWAITING_ACK", "REPLACEMENT"] as const).map((item) => <button type="button" key={item} className={`pill ${filter === item ? "active" : ""}`} onClick={() => setFilter(item)}>{item.replaceAll("_", " ")}</button>)}</div>
    <p className="subtle" role="status" aria-live="polite">{message}</p>
    <div className="delivery-admin-grid">
      <aside className="card delivery-list" aria-label="Floor report deliveries">{rows.length ? rows.map((row) => <button type="button" key={row.report.id} className={`delivery-row ${selected?.report.id === row.report.id ? "active" : ""}`} onClick={() => setSelectedId(row.report.id)}>
        <span><strong>{row.context.clientName}</strong><small>{row.context.projectName} · {row.context.floorLabel}</small></span><span className={`tag ${row.delivery?.status === "ACKNOWLEDGED" ? "good" : row.delivery?.status === "DELIVERED" ? "neutral" : row.readiness.ready ? "good" : "warn"}`}>{row.delivery?.status ?? (row.readiness.ready ? "ELIGIBLE" : "BLOCKED")}</span>
      </button>) : <div className="list-item"><strong>No reports in this filter</strong><span className="meta">Choose another delivery state.</span></div>}</aside>
      {selected ? <article className="card delivery-panel">
        <header><div><div className="eyebrow">{selected.context.caseNumber} · {selected.context.floorLabel}</div><h2>{selected.report.versionLabel}</h2><p className="subtle">Recipient: {selected.context.clientName} · {selected.context.clientEmail}</p></div><span className={`tag ${selected.health.healthy ? "good" : "bad"}`}>{selected.health.healthy ? "Healthy" : "Attention"}</span></header>
        <section className="delivery-identity" aria-label="Exact immutable artifact identity"><div><span className="meta">Report canonical hash</span><code title={selected.report.canonicalHash}>{shortHash(selected.report.canonicalHash)}</code></div><div><span className="meta">Protected PDF ID</span><code>{selected.protectedPdf?.artifactId ?? "Missing"}</code></div><div><span className="meta">Protected PDF SHA-256</span><code title={selected.protectedPdf?.artifactHashSha256}>{shortHash(selected.protectedPdf?.artifactHashSha256)}</code></div><div><span className="meta">Template snapshot</span><code title={selected.report.templateSnapshotHash ?? ""}>{shortHash(selected.report.templateSnapshotHash)}</code></div></section>
        <section><h3>Readiness checklist</h3><div className="delivery-checklist">{selected.readiness.checks.map((check) => <div key={check.key} className={check.passed ? "pass" : "block"}><span aria-hidden="true">{check.passed ? "✓" : "!"}</span><div><strong>{check.label}</strong><small>{check.detail}</small></div></div>)}</div></section>
        {selected.health.issues.length ? <section className="delivery-health" role="alert"><h3>Delivery health</h3><ul>{selected.health.issues.map((issue) => <li key={issue}>{issue.replaceAll("_", " ")}</li>)}</ul></section> : null}
        <section className="delivery-actions"><h3>Controlled actions</h3><div className="hero-actions">
          {!selected.delivery ? <button type="button" className="button" disabled={busy || !selected.protectedPdf} onClick={() => void run({ action: "document-delivery-prepare", reportId: selected.report.id, expectedRecordVersion: selected.report.recordVersion, idempotencyKey: `delivery:prepare:${selected.report.id}:${selected.protectedPdf?.artifactId}` }, "Pin this exact protected artifact and recipient for delivery?")}>Prepare delivery</button> : null}
          {selected.delivery?.status === "DRAFT" ? <button type="button" className="button" disabled={busy} onClick={() => void run({ action: "document-delivery-mark-ready", deliveryId: selected.delivery!.id, expectedRecordVersion: selected.delivery!.recordVersion ?? 0, idempotencyKey: `delivery:ready:${selected.delivery!.id}:${selected.delivery!.recordVersion ?? 0}` })}>Mark Ready</button> : null}
          {selected.delivery?.status === "READY" ? <button type="button" className="button" disabled={busy} onClick={() => void run({ action: "document-delivery-deliver", deliveryId: selected.delivery!.id, channel: "CLIENT_PORTAL", expectedRecordVersion: selected.delivery!.recordVersion ?? 0, idempotencyKey: `delivery:portal:${selected.delivery!.id}:${selected.delivery!.recordVersion ?? 0}` }, "Activate client portal access to this exact protected PDF?")}>Deliver to portal</button> : null}
          {selected.delivery && ["DELIVERED", "ACKNOWLEDGED"].includes(selected.delivery.status) ? <button type="button" className="button-secondary" disabled={busy} onClick={() => void run({ action: "document-delivery-deliver", deliveryId: selected.delivery!.id, channel: "CLIENT_PORTAL", expectedRecordVersion: selected.delivery!.recordVersion ?? 0, idempotencyKey: `delivery:redeliver:${selected.delivery!.id}:${Date.now()}` }, "Record another portal delivery event for the same artifact?")}>Record repeat delivery</button> : null}
        </div>
        {selected.delivery?.status === "READY" ? <div className="delivery-manual"><label>Manual handoff record<input value={manualDescription} maxLength={500} onChange={(event) => setManualDescription(event.target.value)} /></label><button type="button" className="button-secondary" disabled={busy || manualDescription.trim().length < 3} onClick={() => void run({ action: "document-delivery-deliver", deliveryId: selected.delivery!.id, channel: "MANUAL_HANDOFF", manualHandoffDescription: manualDescription, expectedRecordVersion: selected.delivery!.recordVersion ?? 0, idempotencyKey: `delivery:manual:${selected.delivery!.id}:${selected.delivery!.recordVersion ?? 0}` }, "Record a manual handoff? Uchit OS will not claim it transmitted the file.")}>Record Manual Delivery</button></div> : null}</section>
        <section><h3>Append-only delivery history</h3><div className="list">{selected.events.length ? [...selected.events].reverse().map((event) => <div className="list-item" key={event.id}><strong>{event.eventType.replaceAll("_", " ")}</strong><span className="meta">{event.actorDisplayName} · {when.format(new Date(event.occurredAt))} · {event.channel ?? "SYSTEM"}</span><span className="subtle">{event.reason}</span></div>) : <div className="list-item"><strong>No delivery events yet</strong><span className="meta">Prepare the exact artifact to begin.</span></div>}</div></section>
      </article> : <article className="card"><h2>No report selected</h2><p className="subtle">Released immutable v5 floor reports will appear here.</p></article>}
    </div>
  </section>;
}
