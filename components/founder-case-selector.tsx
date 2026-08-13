"use client";

import { useEffect, useMemo, useState } from "react";
import type { AppState } from "@/lib/store";
import { useSession } from "@/components/session-provider";

type Bootstrap = AppState & { persistenceRevision?: number | null };

/** Navigation-only selector. Server routes revalidate every Case/Floor context. */
export function FounderCaseSelector({ caseId, floorId, caseLabel }: { caseId?: string; floorId?: string; caseLabel?: string }) {
  const { activeUser } = useSession();
  const [state, setState] = useState<Bootstrap | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(!caseId);
  const [message, setMessage] = useState("Loading permitted cases…");
  const memoryKey = `uchit:founder-case:${activeUser.id}:${activeUser.organisationId ?? "none"}`;
  useEffect(() => {
    void fetch("/api/bootstrap", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("Case selection is unavailable.");
      const next = await response.json() as Bootstrap;
      setState(next); setMessage(next.vastuCases.length ? "Choose a case and floor." : "No permitted cases are available.");
    }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Case selection is unavailable."));
  }, []);
  const cases = useMemo(() => (state?.vastuCases ?? []).map((item) => {
    const client = state?.clients.find((candidate) => candidate.id === item.clientId);
    const project = state?.projects.find((candidate) => candidate.id === item.projectId);
    const floors = state?.floorWorkspaces.filter((candidate) => candidate.caseId === item.id) ?? [];
    return { item, client, project, floors };
  }).filter(({ item, client, project }) => `${item.caseNumber} ${client?.displayName ?? ""} ${project?.propertyName ?? ""}`.toLowerCase().includes(query.toLowerCase())), [state, query]);
  function choose(nextCaseId: string, nextFloorId?: string) {
    if (!nextFloorId) { setMessage("Choose a floor for this case."); return; }
    localStorage.setItem(memoryKey, JSON.stringify({ caseId: nextCaseId, floorId: nextFloorId }));
    window.location.assign(`/founder/continue?caseId=${encodeURIComponent(nextCaseId)}&floorId=${encodeURIComponent(nextFloorId)}`);
  }
  const selected = cases.find(({ item }) => item.id === caseId);
  return <section className="founder-case-selector" aria-label="Case selection">
    <button className="button-secondary" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{caseId ? `Case: ${selected?.item.caseNumber ?? caseLabel ?? "Unavailable"}` : "Select a case to continue"}</button>
    {open ? <div className="founder-case-selector-panel" role="dialog" aria-label="Select an authorised case"><label>Search cases<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Case, client, project or location" autoFocus /></label><p className="meta">All permitted cases · navigation only · no confidential notes</p>{cases.length ? <ul>{cases.map(({ item, client, project, floors }) => <li key={item.id}><strong>{item.caseNumber}</strong><span>{client?.displayName ?? "Client unavailable"} · {project?.propertyName ?? "Project pending"}</span><div>{floors.length ? floors.map((floor) => <button key={floor.id} type="button" className="button-secondary" onClick={() => choose(item.id, floor.id)}>{floor.floorLabel}{floor.id === floorId ? " · current" : ""}</button>) : <span className="meta">Floor setup pending</span>}</div></li>)}</ul> : <p role="status">{message}</p>}<button type="button" className="button-secondary" onClick={() => setOpen(false)}>Close</button></div> : null}
  </section>;
}
