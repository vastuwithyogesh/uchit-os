"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { CaseWorkspaceItem } from "@/lib/case-workspace";

export function CaseWorkspace({ items }: { items: CaseWorkspaceItem[] }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) => [item.clientName, item.city, item.caseNumber, item.stage, item.nextAction].some((value) => value?.toLowerCase().includes(term)));
  }, [items, query]);

  return (
    <section className="workspace" aria-labelledby="workspace-title">
      <div className="workspace-toolbar">
        <div>
          <div className="eyebrow">One team queue</div>
          <h1 id="workspace-title">What needs attention?</h1>
          <p className="subtle">Find a client, see what is blocking progress, and open the right work area.</p>
        </div>
        <label className="workspace-search">
          <span>Search clients or cases</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, city, case number…" />
        </label>
      </div>

      <div className="workspace-summary" aria-live="polite">
        <strong>{filtered.length}</strong> {filtered.length === 1 ? "item" : "items"} shown
        <span>{items.filter((item) => item.sla === "OVERDUE").length} overdue</span>
        <span>{items.filter((item) => item.sla === "DUE_SOON").length} due soon</span>
      </div>

      {items.length === 0 ? <div className="workspace-state"><h2>Your queue is clear</h2><p>No clients or cases are assigned to you.</p></div> : null}
      {items.length > 0 && filtered.length === 0 ? <div className="workspace-state" role="status"><h2>No match found</h2><p>Try a client name, city, or case number.</p></div> : null}

      <div className="workspace-list">
        {filtered.map((item) => (
          <article className="workspace-item" key={`${item.clientId}:${item.caseId ?? "lead"}`}>
            <div className="workspace-identity">
              <div>
                <h2>{item.clientName}</h2>
                <p>{item.caseNumber ?? "No case yet"} · {item.city || "City not added"}</p>
              </div>
              <span className={`tag ${item.sla === "OVERDUE" ? "bad" : item.sla === "DUE_SOON" ? "warn" : item.sla === "ON_TRACK" ? "good" : "neutral"}`}>{item.slaLabel}</span>
            </div>
            <dl className="workspace-details">
              <div><dt>Now</dt><dd>{item.stage}</dd></div>
              <div><dt>Blocked by</dt><dd>{item.blocker}</dd></div>
              <div><dt>Next action</dt><dd><strong>{item.nextAction}</strong></dd></div>
              <div><dt>Owner</dt><dd>{item.owner} · {item.ownerRole.toLowerCase()}</dd></div>
            </dl>
            <div className="workspace-actions" aria-label={`Open work areas for ${item.clientName}`}>
              {item.links.map((link, index) => <Link className={index === 0 ? "button" : "button-secondary"} href={link.href} key={link.href}>{link.label}</Link>)}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
