"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AppState } from "@/lib/store";
import { buildActionHeaders } from "@/lib/request-helpers";
import { useSession } from "@/components/session-provider";

export function V1FullBalanceClearance({ caseId, projectId, floorId }: { caseId?: string; projectId?: string; floorId?: string }) {
  const { activeUser } = useSession();
  const router = useRouter();
  const [state, setState] = useState<AppState | null>(null);
  const [revision, setRevision] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Loading the current V1 clearance authority…");
  const key = useRef(crypto.randomUUID());
  const clearance = state?.v1FullBalanceClearances?.find((item) => item.caseId === caseId && item.projectId === projectId && item.floorId === floorId && item.status === "APPROVED");

  async function refresh() {
    const response = await fetch("/api/state", { cache: "no-store", headers: buildActionHeaders(activeUser.role) });
    const payload = await response.json() as { state: AppState; revision: number | null };
    if (!response.ok) throw new Error("The current V1 clearance state could not be loaded.");
    setState(payload.state);
    setRevision(payload.revision);
    setMessage(payload.state.v1FullBalanceClearances?.some((item) => item.caseId === caseId && item.projectId === projectId && item.floorId === floorId && item.status === "APPROVED") ? "Full Balance Clearance is approved for the current V1 findings." : "Current canonical V1 findings are ready for Founder approval.");
  }

  useEffect(() => { void refresh().catch((error) => setMessage(error instanceof Error ? error.message : "The current V1 clearance state could not be loaded.")); }, [caseId, projectId, floorId]);

  async function approve() {
    if (!state || !caseId || !projectId || !floorId || clearance || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/actions", { method: "POST", headers: buildActionHeaders(activeUser.role), body: JSON.stringify({ action: "v1-full-balance-clearance-approve", actorRole: activeUser.role, caseId, projectId, floorId, expectedRecordVersion: 0, expectedRevision: revision, idempotencyKey: key.current }) });
      const result = await response.json() as { ok?: boolean; error?: string | { message?: string } };
      if (!response.ok || result.ok === false) throw new Error(typeof result.error === "string" ? result.error : result.error?.message ?? "Full Balance Clearance could not be approved.");
      key.current = crypto.randomUUID();
      await refresh();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Full Balance Clearance could not be approved.");
    } finally { setBusy(false); }
  }

  return <section aria-label="V1 Full Balance Clearance" className="founder-panel">
    <div className="founder-panel-heading"><div><p className="eyebrow">Native V1 governance</p><h2>Full Balance Clearance</h2></div><span className="status-pill">{clearance ? "APPROVED" : "READY FOR FOUNDER"}</span></div>
    <p>Approve the current canonical Elemental Evaluation and its bound finalized Elemental Report for this exact Case, Project and Floor.</p>
    <div className="founder-grid founder-grid-2"><div><strong>Elemental Evaluation</strong><p>Current canonical · COMPLETE</p></div><div><strong>Elemental Report</strong><p>Bound finalized snapshot</p></div></div>
    {clearance ? <p role="status">Approved by {clearance.actorDisplayName} at {clearance.approvedAt}. Clearance record: {clearance.id}</p> : <button type="button" onClick={() => void approve()} disabled={busy || !state}>{busy ? "Approving…" : "Approve Full Balance Clearance"}</button>}
    <p role="status">{message}</p>
  </section>;
}
