import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { SiteHeader } from "@/components/site-header";
import { buildCaseWorkspaceProjection } from "@/lib/case-workspace";
import { requirePageAccess } from "@/lib/page-access";
import { loadStateFromPersistence } from "@/lib/persistence";

export default async function HomePage() {
  const access = await requirePageAccess("SETTER");
  if (!access.allowed) {
    return (
      <main className="page-shell">
        <SiteHeader title="Uchit Vastu" subtitle="Your work, in one place" />
        <AccessDeniedPanel area="Staff home" requiredRole="SETTER" actorRole={access.actor.role} />
      </main>
    );
  }

  try {
    const state = await loadStateFromPersistence();
    const work = buildCaseWorkspaceProjection(state, access.actor);
    const needsAttention = work.filter((item) => item.sla === "OVERDUE" || item.sla === "DUE_SOON");
    const firstItem = needsAttention[0] ?? work.find((item) => item.stage !== "Complete") ?? work[0];
    const hasNoClients = state.clients.length === 0;

    return (
      <main className="page-shell">
        <SiteHeader title="Uchit Vastu" subtitle="Your work, in one place" />

        <section className="hero">
          <div className="hero-panel">
            <div className="eyebrow">Staff home</div>
            <h1>{hasNoClients ? "Start by adding your first client" : firstItem ? "Start with the next client task" : "You are all caught up"}</h1>
            <p className="lede">
              {hasNoClients
                ? "Import website opt-ins or add a client in the Clients area. The workspace will then show one clear next step at a time."
                : firstItem
                ? "The workspace puts urgent work first and explains what to do, what is waiting, and what happens after."
                : "There are no client tasks in your queue. New work will appear here when it is assigned to you."}
            </p>
            <div className="hero-actions">
              <a href={hasNoClients ? "/crm" : "/workspace"} className="button">{hasNoClients ? "Add first client" : "Open my workspace"}</a>
              <a href={hasNoClients ? "/workspace" : "/crm"} className="button-secondary">{hasNoClients ? "View empty workspace" : "Add or find a client"}</a>
            </div>
          </div>

          <aside className="hero-side">
            <div className="stat-grid" aria-label="Work summary">
              <div className="stat-card"><span className="stat-value">{needsAttention.length}</span><span className="stat-label">need attention</span></div>
              <div className="stat-card"><span className="stat-value">{work.filter((item) => item.sla === "OVERDUE").length}</span><span className="stat-label">past due</span></div>
              <div className="stat-card"><span className="stat-value">{work.filter((item) => item.stage !== "Complete").length}</span><span className="stat-label">still in progress</span></div>
              <div className="stat-card"><span className="stat-value">{work.filter((item) => item.stage === "Complete").length}</span><span className="stat-label">completed</span></div>
            </div>
          </aside>
        </section>

        {firstItem ? (
          <section className="card" aria-labelledby="next-task-title">
            <div className="eyebrow">Do this next</div>
            <h2 id="next-task-title">{firstItem.nextAction}</h2>
            <p className="subtle">For {firstItem.clientName}{firstItem.caseNumber ? ` · ${firstItem.caseNumber}` : ""}. {firstItem.blocker}.</p>
            <div className="hero-actions" style={{ marginTop: 16 }}>
              <a className="button" href="/workspace">Show me the task</a>
              <a className="button-secondary" href={firstItem.links[0]?.href ?? "/workspace"}>Open work area</a>
            </div>
          </section>
        ) : null}

        <section className="section-grid" aria-label="Other work areas">
          <div className="card span-6">
            <div className="eyebrow">Common tasks</div>
            <h2>Go straight to what you need</h2>
            <div className="list" style={{ marginTop: 14 }}>
              <a href="/crm" className="list-item"><strong>Add or update a client</strong><span className="meta">Leads, calls, proposals, and assignments</span></a>
              <a href="/payment-proofs" className="list-item"><strong>Check a payment</strong><span className="meta">Review advance or balance proof</span></a>
              <a href="/evaluation" className="list-item"><strong>Work on an evaluation</strong><span className="meta">Floor plans, direction, and Vastu findings</span></a>
              <a href="/reports" className="list-item"><strong>Review or send a report</strong><span className="meta">Preview, approvals, and final delivery</span></a>
            </div>
          </div>
          <div className="card span-6">
            <div className="eyebrow">Need context?</div>
            <h2>See the full client story</h2>
            <p className="subtle">The client history shows calls, payments, case work, reports, and delivery in time order.</p>
            <div className="hero-actions" style={{ marginTop: 16 }}><a href="/timeline" className="button-secondary">Open client history</a></div>
          </div>
        </section>
      </main>
    );
  } catch {
    return (
      <main className="page-shell">
        <SiteHeader title="Uchit Vastu" subtitle="Your work, in one place" />
        <section className="workspace-state" role="alert">
          <h1>We could not load your work</h1>
          <p>Nothing has been changed. Refresh this page to try again. If it still does not load, ask an administrator for help.</p>
        </section>
      </main>
    );
  }
}
