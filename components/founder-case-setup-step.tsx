"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AppState } from "@/lib/store";
import { getActiveCaseForClient } from "@/lib/service-framework";
import { buildActionHeaders } from "@/lib/request-helpers";
import { useSession } from "@/components/session-provider";

type Bootstrap = AppState & { persistenceRevision?: number | null };
type Focus = "case" | "floor";

export function FounderCaseSetupStep({ focus, clientId, caseId, floorId }: { focus: Focus; clientId?: string; caseId?: string; floorId?: string }) {
  const { activeUser } = useSession();
  const router = useRouter();
  const [state, setState] = useState<Bootstrap | null>(null);
  const [label, setLabel] = useState("Ground floor");
  const [addingFloor, setAddingFloor] = useState(false);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("Loading the exact case context…");
  const [conflict, setConflict] = useState(false);
  const key = useRef(crypto.randomUUID());
  const refresh = useCallback(async () => {
    setBusy(true); setConflict(false);
    try { const response = await fetch("/api/bootstrap", { cache: "no-store" }); const value = await response.json() as Bootstrap; if (!response.ok) throw new Error("The case context could not be loaded."); setState(value); setMessage("Case context is up to date."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The case context could not be loaded."); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const exactCase = state?.vastuCases.find((item) => item.id === caseId);
  const client = state?.clients.find((item) => item.id === (clientId ?? exactCase?.clientId)) ?? state?.clients.find((item) => getActiveCaseForClient(state, item.id)) ?? state?.clients[0];
  const caseRecord = exactCase ?? (state && client ? getActiveCaseForClient(state, client.id) : undefined);
  const proposal = state?.commercialProposals.find((item) => item.clientId === client?.id && item.status === "APPROVED");
  const advance = state?.advanceVerifications.find((item) => item.clientId === client?.id && ["VERIFIED", "CASE_OPENED"].includes(item.status));
  const project = state?.projects.find((item) => item.id === caseRecord?.projectId);
  const floors = state?.floorWorkspaces.filter((item) => item.caseId === caseRecord?.id) ?? [];
  const floor = floors.find((item) => item.id === floorId) ?? floors[0];
  const canCreateCase = Boolean(client && proposal && advance && !caseRecord);
  const canCreateFloor = Boolean(caseRecord && label.trim().length >= 2);
  const canReadyFloor = Boolean(caseRecord && floor && !floor.locked);

  const action = useMemo(() => focus === "case" ? (caseRecord ? null : "case-create") : (!floor || addingFloor) ? "floor-create" : floor.locked ? null : "floor-ready", [focus, caseRecord, floor, addingFloor]);
  async function save() {
    if (!state || !action) return;
    const entity = action === "case-create" ? proposal : caseRecord;
    if (!entity || state.persistenceRevision === null || state.persistenceRevision === undefined) { setMessage("Reload the latest record before this protected action."); return; }
    setBusy(true); setConflict(false);
    try {
      const payload = action === "case-create" ? { action, clientId: client?.id, proposalId: proposal?.id }
        : action === "floor-create" ? { action, caseId: caseRecord?.id, floorLabel: label.trim() }
          : { action, floorId: floor?.id };
      const response = await fetch("/api/actions", { method: "POST", headers: buildActionHeaders(activeUser.role), body: JSON.stringify({ ...payload, idempotencyKey: key.current, expectedRecordVersion: entity.recordVersion ?? 0, expectedRevision: state.persistenceRevision }) });
      const result = await response.json();
      if (!response.ok || result.ok === false) { if (response.status === 409 || response.status === 428) setConflict(true); throw new Error(result.error?.message ?? result.error ?? "The protected action could not be saved."); }
      key.current = crypto.randomUUID(); setAddingFloor(false); setMessage(action === "case-create" ? "Vastu Case ID and project created." : action === "floor-create" ? "Independent floor workspace created." : "Floor marked ready."); await refresh(); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "The protected action could not be saved."); }
    finally { setBusy(false); }
  }

  const disabled = busy || !action || (action === "case-create" ? !canCreateCase : action === "floor-create" ? !canCreateFloor : !canReadyFloor);
  return <section className="focused-step-form" aria-label={focus === "case" ? "Case and project creation" : "Floor setup"}>
    <div className="focused-context-row"><span>{client?.displayName ?? "No client"}</span><span>{caseRecord?.caseNumber ?? "Case pending"}</span><span>{project?.propertyName ?? "Project pending"}</span></div>
    {focus === "case" ? <div className="focused-form-body"><dl className="focused-summary"><div><dt>Approved proposal</dt><dd>{proposal ? "Ready" : "Missing"}</dd></div><div><dt>Confirmed advance</dt><dd>{advance ? "Ready" : "Missing"}</dd></div><div><dt>Vastu Case ID</dt><dd>{caseRecord?.caseNumber ?? "Created only after both gates"}</dd></div></dl>{caseRecord ? <div className="step-complete-note">Case and project are ready. Continue to floor setup.</div> : <button className="button" type="button" onClick={() => void save()} disabled={disabled}>{busy ? "Creating…" : "Create Vastu case"}</button>}</div> : <div className="focused-form-body"><div className="compact-floor-selector" aria-label="Floor workspaces">{floors.map((item) => <a key={item.id} className={item.id === floor?.id ? "active" : undefined} href={`/founder/02?caseId=${encodeURIComponent(caseRecord?.id ?? "")}&floorId=${encodeURIComponent(item.id)}`}>{item.floorLabel}<span>{item.locked ? "Ready" : "Draft"}</span></a>)}</div>{!floor || addingFloor ? <label className="field"><span>Floor name</span><input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={80} placeholder="Ground floor" /></label> : <div className="focused-summary-card"><strong>{floor.floorLabel}</strong><span>{floor.locked ? "Ready for its independent workflow" : "Review this floor, then mark it ready"}</span></div>}<button className="button" type="button" onClick={() => void save()} disabled={disabled}>{busy ? "Saving…" : action === "floor-create" ? "Create floor workspace" : floor?.locked ? "Floor ready" : "Mark floor ready"}</button>{floor && !addingFloor ? <details><summary>More options</summary><button className="button-secondary" type="button" onClick={() => { setLabel(""); setAddingFloor(true); setMessage("Name the new floor, then create its independent workspace."); }}>Add another floor</button></details> : addingFloor ? <button className="button-secondary" type="button" onClick={() => setAddingFloor(false)}>Cancel new floor</button> : null}</div>}
    {conflict ? <div className="conflict-recovery" role="alert"><strong>The record changed while you were working.</strong><p>Your input is still visible. Reload the latest version before retrying.</p><button className="button-secondary" type="button" onClick={() => void refresh()}>Reload latest</button></div> : null}
    <div className="footer-note" role={/could not|missing|changed/i.test(message) ? "alert" : "status"} aria-live="polite">{message}</div>
  </section>;
}
