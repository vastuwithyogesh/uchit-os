"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "@/components/session-provider";
import { buildActionHeaders } from "@/lib/request-helpers";

type CaseProjection = {
  id: string;
  caseNumber: string;
  clientName: string;
  projectName: string;
  variation?: string;
  propertyLocation?: string;
  assignedToViewer: boolean;
  needsAction: boolean;
  updatedAt?: string;
  floors: Array<{ id: string; label: string; currentStep?: number; currentTitle?: string; currentStatus?: string }>;
};
type View = "MY" | "ALL" | "ACTION" | "RECENT";

/** Navigation-only selector. The API and destination route both revalidate Case/Floor access. */
export function FounderCaseSelector({ caseId, floorId, caseLabel }: { caseId?: string; floorId?: string; caseLabel?: string }) {
  const { activeUser } = useSession();
  const [cases, setCases] = useState<CaseProjection[]>([]);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("ALL");
  const [open, setOpen] = useState(!caseId);
  const [status, setStatus] = useState<"LOADING" | "READY" | "ERROR">("LOADING");
  const [message, setMessage] = useState("Loading permitted cases…");
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const memoryKey = `uchit:founder-case:${activeUser.id}:${activeUser.organisationId ?? "none"}`;

  const load = useCallback(async () => {
    setStatus("LOADING");
    setMessage("Loading permitted cases…");
    try {
      const response = await fetch("/api/founder/cases", { cache: "no-store", headers: buildActionHeaders(activeUser.role) });
      if (!response.ok) throw new Error(response.status === 403 ? "You do not have access to Founder cases." : "Case selection is unavailable.");
      const next = await response.json() as { cases: CaseProjection[] };
      setCases(next.cases);
      setStatus("READY");
      setMessage(next.cases.length ? "Choose a case and floor." : "No permitted cases are available.");
      try {
        const remembered = JSON.parse(localStorage.getItem(memoryKey) ?? "{}") as { recentCaseIds?: string[] };
        setRecentIds((remembered.recentCaseIds ?? []).filter((id) => next.cases.some((item) => item.id === id)).slice(0, 8));
      } catch {
        setRecentIds([]);
      }
    } catch (error) {
      setStatus("ERROR");
      setMessage(error instanceof Error ? error.message : "Case selection is unavailable.");
    }
  }, [activeUser.role, memoryKey]);

  useEffect(() => { void load(); }, [load]);

  const visibleCases = useMemo(() => cases.filter((item) => {
    if (view === "MY" && !item.assignedToViewer) return false;
    if (view === "ACTION" && !item.needsAction) return false;
    if (view === "RECENT" && !recentIds.includes(item.id)) return false;
    const searchable = `${item.caseNumber} ${item.clientName} ${item.projectName} ${item.variation ?? ""} ${item.propertyLocation ?? ""}`.toLowerCase();
    return searchable.includes(query.trim().toLowerCase());
  }).sort((left, right) => view === "RECENT" ? recentIds.indexOf(left.id) - recentIds.indexOf(right.id) : (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "")), [cases, query, recentIds, view]);

  function choose(nextCaseId: string, nextFloorId?: string) {
    if (!nextFloorId) { setMessage("Choose a floor for this case."); return; }
    const nextRecent = [nextCaseId, ...recentIds.filter((id) => id !== nextCaseId)].slice(0, 8);
    localStorage.setItem(memoryKey, JSON.stringify({ caseId: nextCaseId, floorId: nextFloorId, recentCaseIds: nextRecent }));
    window.location.assign(`/founder/continue?caseId=${encodeURIComponent(nextCaseId)}&floorId=${encodeURIComponent(nextFloorId)}`);
  }

  function closeSelector() {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  const selected = cases.find((item) => item.id === caseId);
  return <section className="founder-case-selector" aria-label="Case selection">
    <button ref={triggerRef} className="button-secondary" type="button" aria-expanded={open} onClick={() => open ? closeSelector() : setOpen(true)}>{caseId ? `Case: ${selected?.caseNumber ?? caseLabel ?? "Unavailable"}` : "Select a case to continue"}</button>
    {open ? <div className="founder-case-selector-panel" role="dialog" aria-label="Select an authorised case" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); closeSelector(); } }}>
      <label>Search cases<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Case, client, project or location" autoFocus /></label>
      <div className="case-selector-views" role="group" aria-label="Case views">{([['MY', 'My cases'], ['ALL', 'All permitted'], ['ACTION', 'Needs my action'], ['RECENT', 'Recent']] as const).map(([key, label]) => <button key={key} type="button" className={view === key ? "button" : "button-secondary"} aria-pressed={view === key} onClick={() => setView(key)}>{label}</button>)}</div>
      <p className="meta">Permission-scoped navigation only · no confidential notes</p>
      {status === "LOADING" ? <p role="status">{message}</p> : status === "ERROR" ? <div role="alert"><p>{message}</p><button type="button" className="button-secondary" onClick={() => void load()}>Try again</button></div> : visibleCases.length ? <ul>{visibleCases.map((item) => <li key={item.id}><strong>{item.caseNumber}</strong><span>{item.clientName} · {item.projectName}</span>{item.variation || item.propertyLocation ? <span className="meta">{[item.variation, item.propertyLocation].filter(Boolean).join(" · ")}</span> : null}<div>{item.floors.length ? item.floors.map((floor) => <button key={floor.id} type="button" className="button-secondary" onClick={() => choose(item.id, floor.id)}>{floor.label}{floor.id === floorId ? " · current" : ""}{floor.currentStep ? ` · Step ${floor.currentStep.toString().padStart(2, "0")}` : ""}</button>) : <span className="meta">Floor setup pending</span>}</div></li>)}</ul> : <p role="status">{query ? "No permitted cases match this search." : view === "RECENT" ? "No recent permitted case is remembered on this device." : "No permitted cases are available in this view."}</p>}
      <button type="button" className="button-secondary" onClick={closeSelector}>Close</button>
    </div> : null}
  </section>;
}
