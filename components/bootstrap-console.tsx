"use client";

import { useMemo, useState } from "react";
import type { AppState } from "@/lib/store";
import { useSession } from "@/components/session-provider";

async function fetchState() {
  const response = await fetch("/api/bootstrap", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load bootstrap state");
  }
  return response.json();
}

async function syncState() {
  const response = await fetch("/api/bootstrap", { method: "POST" });
  const result = await response.json();
  if (!response.ok || result.ok === false) {
    throw new Error(result.error ?? "Sync failed");
  }
  return result;
}

export function BootstrapConsole() {
  const { activeUser, isLocalDemo } = useSession();
  const [state, setState] = useState<AppState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Load the current state to begin.");

  const counts = useMemo(() => {
    if (!state) {
      return null;
    }

    return [
      ["Clients", state.clients.length],
      ["Leads", state.leadQualifications.length],
      ["Proposals", state.commercialProposals.length],
      ["Review call bookings", state.reviewCallBookings.length],
      ["Payments", state.payments.length],
      ["Advance verifications", state.advanceVerifications.length],
      ["Cases", state.vastuCases.length],
      ["Floors", state.floorWorkspaces.length],
      ["Reports", state.reportVersions.length],
      ["Utility rules", state.utilityRules.length],
      ["Templates", state.whatsappTemplates.length],
      ["Timeline events", state.timelineEvents.length]
    ] as const;
  }, [state]);

  async function refresh() {
    setBusy(true);
    try {
      setState(await fetchState());
      setMessage("Current production state loaded. Nothing was changed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Load failed");
    } finally {
      setBusy(false);
    }
  }

  async function sync() {
    setBusy(true);
    try {
      const result = await syncState();
      setState(result.state);
      setMessage(`Synced ${result.counts.clients} clients and ${result.counts.proposals} proposals into persistence`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section-grid">
      <div className="card span-8">
        <div className="eyebrow">Data readiness</div>
        <h2>Inspect the current saved records without overwriting them</h2>
        <p className="subtle">
          Production always loads the durable database first. Demo records and reset tools are available only on an explicitly enabled local development site.
        </p>
        <div className="stat-grid" style={{ marginTop: 18 }}>
          <div className="stat-card">
            <span className="stat-value">{state?.clients.length ?? 0}</span>
            <span className="stat-label">clients loaded</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{state?.commercialProposals.length ?? 0}</span>
            <span className="stat-label">proposals loaded</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{state?.vastuCases.length ?? 0}</span>
            <span className="stat-label">cases loaded</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{state?.timelineEvents.length ?? 0}</span>
            <span className="stat-label">timeline events loaded</span>
          </div>
        </div>
        <div className="hero-actions" style={{ marginTop: 16 }}>
          <button className="button" type="button" onClick={refresh} disabled={busy}>
            Load current state
          </button>
          {isLocalDemo ? (
            <button className="button-secondary" type="button" onClick={sync} disabled={busy}>
              Save local demo state
            </button>
          ) : null}
        </div>
        <div className="panel" style={{ marginTop: 18 }}>
          <div className="panel-head">
            <div>
              <strong>Operator</strong>
              <div className="meta">
                {activeUser.fullName} · {activeUser.role}
              </div>
            </div>
          </div>
          <div className="footer-note">{message}</div>
        </div>
      </div>

      <div className="card span-4">
        <div className="eyebrow">State summary</div>
        <h2>What is currently tracked</h2>
        <div className="list" style={{ marginTop: 14 }}>
          {counts?.map(([label, value]) => (
            <div key={label} className="list-item">
              <strong>{label}</strong>
              <span className="meta">{value}</span>
            </div>
          )) ?? (
            <div className="list-item">
              <strong>No state loaded yet</strong>
              <span className="meta">Press Load current state to inspect counts safely</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
