"use client";

import { useMemo, useState } from "react";
import type { CaseWorkspaceItem } from "@/lib/case-workspace";

type View = "ATTENTION" | "ACTIVE" | "COMPLETE" | "ALL";

function whatHappensAfter(item: CaseWorkspaceItem) {
  if (item.stage === "Complete") return "The delivery record stays available in the client history.";
  if (item.nextAction.includes("qualification")) return "You can prepare the proposal.";
  if (item.nextAction.includes("proposal") || item.nextAction.includes("advance")) return "The case can open after the advance is approved.";
  if (item.nextAction.includes("floor") || item.nextAction.includes("evaluation")) return "A preview can be prepared after the evaluation is complete.";
  if (item.nextAction.includes("balance")) return "The final report can move to approval after payment is confirmed.";
  if (item.nextAction.includes("approval") || item.nextAction.includes("Review report")) return "Two eligible people must approve before release.";
  if (item.nextAction.includes("Release")) return "The client receives the final verdict and delivery is recorded.";
  return "The workspace will show the next task when this step is complete.";
}

export function CaseWorkspace({ items }: { items: CaseWorkspaceItem[] }) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>(() => items.some((item) => item.sla === "OVERDUE" || item.sla === "DUE_SOON") ? "ATTENTION" : "ACTIVE");
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesSearch = !term || [item.clientName, item.city, item.caseNumber, item.stage, item.nextAction].some((value) => value?.toLowerCase().includes(term));
      const matchesView = view === "ALL"
        || (view === "ATTENTION" && (item.sla === "OVERDUE" || item.sla === "DUE_SOON"))
        || (view === "ACTIVE" && item.stage !== "Complete")
        || (view === "COMPLETE" && item.stage === "Complete");
      return matchesSearch && matchesView;
    });
  }, [items, query, view]);

  const attentionCount = items.filter((item) => item.sla === "OVERDUE" || item.sla === "DUE_SOON").length;

  return (
    <section className="workspace" aria-labelledby="workspace-title">
      <div className="workspace-toolbar">
        <div>
          <div className="eyebrow">Your client tasks</div>
          <h1 id="workspace-title">What needs attention?</h1>
          <p className="subtle">Choose a client, do the next task, and the system will guide you to the following step.</p>
        </div>
        <label className="workspace-search">
          <span>Find a client or case</span>
          <input aria-label="Find a client or case" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Type a name, city, or case number" />
        </label>
      </div>

      <div className="workspace-actions" role="group" aria-label="Choose which tasks to show">
        {([
          ["ATTENTION", `Needs attention (${attentionCount})`],
          ["ACTIVE", "In progress"],
          ["COMPLETE", "Completed"],
          ["ALL", "Show all"]
        ] as Array<[View, string]>).map(([value, label]) => (
          <button key={value} type="button" className={view === value ? "button" : "button-secondary"} aria-pressed={view === value} onClick={() => setView(value)}>{label}</button>
        ))}
      </div>

      <div className="workspace-summary" aria-live="polite">
        <strong>{filtered.length}</strong> {filtered.length === 1 ? "task" : "tasks"} shown
        <span>{items.filter((item) => item.sla === "OVERDUE").length} past due</span>
        <span>{items.filter((item) => item.sla === "DUE_SOON").length} due soon</span>
      </div>

      {items.length === 0 ? <div className="workspace-state"><h2>No client work yet</h2><p>Add or import the first client. Their next task will appear here automatically.</p><a className="button" href="/crm">Add first client</a></div> : null}
      {items.length > 0 && filtered.length === 0 ? <div className="workspace-state" role="status"><h2>Nothing to show here</h2><p>Try another filter, or clear the search to see more client tasks.</p><button className="button-secondary" type="button" onClick={() => { setQuery(""); setView("ALL"); }}>Show all tasks</button></div> : null}

      <div className="workspace-list">
        {filtered.map((item) => (
          <article className="workspace-item" key={`${item.clientId}:${item.caseId ?? "lead"}`}>
            <div className="workspace-identity">
              <div><h2>{item.clientName}</h2><p>{item.caseNumber ?? "Case not opened"} · {item.city || "City not added"}</p></div>
              <span className={`tag ${item.sla === "OVERDUE" ? "bad" : item.sla === "DUE_SOON" ? "warn" : item.sla === "ON_TRACK" ? "good" : "neutral"}`}>{item.slaLabel}</span>
            </div>
            {item.serviceType ? (
              <div className="pill-row" aria-label={`Service progress for ${item.clientName}`}>
                <span className="pill">Service: {item.serviceType}</span>
                <span className="pill">Stage: {item.canonicalStage}</span>
                <span className="pill">Information: {item.readiness}</span>
              </div>
            ) : null}
            <dl className="workspace-details">
              <div><dt>Where things stand</dt><dd>{item.stage}</dd></div>
              <div><dt>What is waiting</dt><dd>{item.blocker}</dd></div>
              <div><dt>Do this next</dt><dd><strong>{item.nextAction}</strong></dd></div>
              <div><dt>Who should do it</dt><dd>{item.owner}</dd></div>
            </dl>
            <div className="card">
              <strong>What happens after</strong>
              <p className="subtle">{whatHappensAfter(item)}</p>
            </div>
            <div className="workspace-actions" aria-label={`Actions for ${item.clientName}`}>
              {item.links.map((link, index) => <a className={index === 0 ? "button" : "button-secondary"} href={link.href} key={link.href}>{index === 0 ? `Do this: ${item.nextAction}` : link.label}</a>)}
            </div>
            <details>
              <summary>Show task details</summary>
              <p className="meta">Next action: {item.nextAction} · Blocked by: {item.blocker} · Responsible role: {item.ownerRole.toLowerCase()} · Internal status: {item.stage} · Timing: {item.slaLabel}</p>
              {item.caseNumber?.match(/-R\d+$/) ? <p className="meta">This is a rectification revision linked to predecessor case {item.caseNumber.replace(/-R\d+$/, "")}. The earlier report remains unchanged. <a href="/timeline">View revision history</a>.</p> : null}
            </details>
          </article>
        ))}
      </div>
    </section>
  );
}
