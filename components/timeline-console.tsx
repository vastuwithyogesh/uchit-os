"use client";

import { useEffect, useMemo, useState } from "react";
import type { TimelineEvent } from "@/lib/domain";
import { formatTimeStamp } from "@/lib/format";

type TimelinePayload = {
  events: TimelineEvent[];
  countsByClient: Array<{ clientId: string; clientName: string; totalEvents: number }>;
  totalEvents: number;
};

async function fetchTimeline() {
  const response = await fetch("/api/timeline", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load timeline");
  }
  return response.json() as Promise<TimelinePayload>;
}

export function TimelineConsole() {
  const [payload, setPayload] = useState<TimelinePayload | null>(null);
  const [selectedClientId, setSelectedClientId] = useState("all");
  const [message, setMessage] = useState("Loading the latest client history...");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setBusy(true);
    try {
      const nextPayload = await fetchTimeline();
      setPayload(nextPayload);
      setMessage(`Loaded ${nextPayload.totalEvents} events across the client timeline.`);
      if (!selectedClientId || selectedClientId === "all") {
        setSelectedClientId("all");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Refresh failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refresh().catch(() => undefined);
  }, []);

  const visibleEvents = useMemo(() => {
    if (!payload) {
      return [];
    }

    return selectedClientId === "all"
      ? payload.events
      : payload.events.filter((event) => event.clientId === selectedClientId);
  }, [payload, selectedClientId]);

  return (
    <section className="section-grid">
      <div className="card span-8">
        <div className="eyebrow">Permanent client timeline</div>
        <h2>Everything the app touches lands here</h2>
        <p className="subtle">
          Lead intake, commercial approvals, payments, floor locks, report versions, and verdict releases all write to the same client history.
        </p>
        <div className="workflow" style={{ marginTop: 14 }}>
          <button type="button" className="button" onClick={refresh} disabled={busy}>
            Refresh timeline
          </button>
          <select value={selectedClientId} onChange={(event) => setSelectedClientId(event.target.value)} style={{ minWidth: 220 }}>
            <option value="all">All clients</option>
            {payload?.countsByClient.map((client) => (
              <option key={client.clientId} value={client.clientId}>
                {client.clientName}
              </option>
            ))}
          </select>
        </div>
        <div className="timeline" style={{ marginTop: 16 }}>
          {visibleEvents.map((event) => (
            <article key={event.id} className="timeline-item">
              <header>
                <div>
                  <strong>{event.headline}</strong>
                  <div className="meta">{formatTimeStamp(event.happenedAt)}</div>
                </div>
                <span className="tag neutral">{event.category}</span>
              </header>
              <p className="subtle">{event.details}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="card span-4">
        <div className="eyebrow">Client counts</div>
        <h2>Activity per client</h2>
        <div className="list" style={{ marginTop: 14 }}>
          {payload?.countsByClient.map((client) => (
            <div key={client.clientId} className="list-item">
              <strong>{client.clientName}</strong>
              <span className="meta">{client.totalEvents} events</span>
            </div>
          )) ?? (
            <div className="list-item">
              <strong>No timeline data</strong>
              <span className="meta">Refresh to load history</span>
            </div>
          )}
        </div>
        <div className="footer-note">{message}</div>
      </div>
    </section>
  );
}
