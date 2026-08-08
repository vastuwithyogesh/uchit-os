import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { SiteHeader } from "@/components/site-header";
import { formatTimeStamp } from "@/lib/format";
import { requirePageAccess } from "@/lib/page-access";
import { loadStateFromPersistence } from "@/lib/persistence";

export default async function HomePage() {
  const access = await requirePageAccess("SETTER");
  if (!access.allowed) {
    return (
      <main className="page-shell">
        <SiteHeader title="Uchit Vastu" subtitle="CRM + evaluation engine" />
        <AccessDeniedPanel area="Overview" requiredRole="SETTER" actorRole={access.actor.role} />
      </main>
    );
  }

  const state = await loadStateFromPersistence();

  const latestClient = state.clients[0];
  const latestCase = state.vastuCases[0];
  const latestFinalReport = state.reportVersions.find((report) => !report.isPreview);
  const qualifiedLeads = state.optInLeads.filter((lead) => lead.status === "QUALIFIED").length;
  const returningLeads = state.optInLeads.filter((lead) => lead.isReturningLead).length;
  const activeCases = state.vastuCases.filter((caseItem) => caseItem.status !== "VERDICT_RELEASED").length;
  const releasedVerdicts = state.reportVersions.filter((report) => report.status === "RELEASED").length;
  const pendingReports = state.reportVersions.filter((report) => report.status !== "RELEASED").length;
  const recentTimeline = [...state.timelineEvents]
    .sort((a, b) => new Date(b.happenedAt).getTime() - new Date(a.happenedAt).getTime())
    .slice(0, 5);

  const readinessChecklist = [
    {
      label: "Lead intake and return history",
      done: state.optInLeads.length > 0,
      note: `${state.optInLeads.length} imported website opt-in lead${state.optInLeads.length === 1 ? "" : "s"}`
    },
    {
      label: "Commercial approvals and proof checks",
      done: state.commercialProposals.some((proposal) => proposal.status === "APPROVED") && state.advanceVerifications.length > 0,
      note: `${state.commercialProposals.length} proposals, ${state.advanceVerifications.length} advance proof check${state.advanceVerifications.length === 1 ? "" : "s"}`
    },
    {
      label: "Case workspaces and chart uploads",
      done: state.vastuCases.length > 0 && state.floorWorkspaces.length > 0,
      note: `${state.vastuCases.length} case${state.vastuCases.length === 1 ? "" : "s"}, ${state.floorWorkspaces.length} floor workspace${state.floorWorkspaces.length === 1 ? "" : "s"}`
    },
    {
      label: "Evaluation and Shakti engine",
      done: state.evaluationSnapshots.length > 0 && state.shaktiSnapshots.length > 0,
      note: `${state.evaluationSnapshots.length} evaluation snapshot${state.evaluationSnapshots.length === 1 ? "" : "s"}, ${state.shaktiSnapshots.length} Shakti snapshot${state.shaktiSnapshots.length === 1 ? "" : "s"}`
    },
    {
      label: "Report approvals and verdict release",
      done: state.reportVersions.some((report) => report.status === "RELEASED"),
      note: `${state.reportVersions.length} report version${state.reportVersions.length === 1 ? "" : "s"} in the flow`
    }
  ];

  return (
    <main className="page-shell">
      <SiteHeader title="Uchit Vastu" subtitle="CRM + evaluation engine" />

      <section className="hero">
        <div className="hero-panel">
          <div className="eyebrow">Operational overview</div>
          <h1>Run lead intake, approvals, case work, and verdict release from one live operating dashboard.</h1>
          <p className="lede">
            This overview now reflects the real working state of the app on Saturday, August 8, 2026. It brings the core systems together: website lead imports, return-history tracking, review-call flow, payment proof checks, case creation, evaluation, reports, and the permanent client timeline.
          </p>
          <div className="hero-actions">
            <a href="/crm" className="button">
              Open CRM
            </a>
            <a href="/ops" className="button-secondary">
              Open Ops
            </a>
            <a href="/reports" className="button-secondary">
              Open Reports
            </a>
          </div>
          <div className="pill-row" style={{ marginTop: 18 }}>
            <span className="pill">Super-Admin commercial approval</span>
            <span className="pill">Advance gate before case opening</span>
            <span className="pill">Two approvals before verdict</span>
            <span className="pill">Permanent client timeline</span>
            <span className="pill">Sites-ready local build</span>
          </div>
        </div>

        <aside className="hero-side">
          <div className="stat-grid">
            <div className="stat-card">
              <span className="stat-value">{state.optInLeads.length}</span>
              <span className="stat-label">website leads imported</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{qualifiedLeads}</span>
              <span className="stat-label">qualified opt-in leads</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{activeCases}</span>
              <span className="stat-label">active cases in progress</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{releasedVerdicts}</span>
              <span className="stat-label">verdicts released</span>
            </div>
          </div>
          <div className="card">
            <div className="eyebrow">Current operating picture</div>
            <h3>Live snapshot</h3>
            <p className="subtle">
              {latestClient
                ? `${latestClient.displayName} is the first visible client in the live store.`
                : "No client data is loaded yet."}
            </p>
            <div className="pill-row" style={{ marginTop: 14 }}>
              <span className="pill">Latest case {latestCase?.caseNumber ?? "none yet"}</span>
              <span className="pill">Pending reports {pendingReports}</span>
              <span className="pill">Returning leads {returningLeads}</span>
              <span className="pill">Final report {latestFinalReport?.status ?? "not prepared"}</span>
            </div>
          </div>
        </aside>
      </section>

      <section className="section-grid">
        <div className="card span-4">
          <div className="eyebrow">Launch readiness</div>
          <h2>Core system coverage</h2>
          <div className="list" style={{ marginTop: 14 }}>
            {readinessChecklist.map((item) => (
              <div key={item.label} className="list-item">
                <strong>{item.label}</strong>
                <span className={`tag ${item.done ? "good" : "warn"}`}>{item.done ? "Ready" : "Pending"}</span>
                <span className="meta">{item.note}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card span-4">
          <div className="eyebrow">Primary work areas</div>
          <h2>Jump straight into the right module</h2>
          <div className="list" style={{ marginTop: 14 }}>
            <a href="/crm" className="list-item">
              <strong>CRM workbench</strong>
              <span className="meta">Import CSV leads, filter them, qualify them, and run the commercial intake chain.</span>
            </a>
            <a href="/ops" className="list-item">
              <strong>Ops console</strong>
              <span className="meta">Open cases, manage floors, lock orientation, save evaluations, and move operations forward.</span>
            </a>
            <a href="/payment-proofs" className="list-item">
              <strong>Payment proofs</strong>
              <span className="meta">Upload advance and balance screenshots so the commercial gates can move cleanly.</span>
            </a>
            <a href="/reports" className="list-item">
              <strong>Report flow</strong>
              <span className="meta">Generate the preview, prepare the final report, collect approvals, and release the verdict.</span>
            </a>
            <a href="/timeline" className="list-item">
              <strong>Client timeline</strong>
              <span className="meta">Review the permanent history across lead intake, payments, case work, and final delivery.</span>
            </a>
          </div>
        </div>

        <div className="card span-4">
          <div className="eyebrow">Data foundations</div>
          <h2>Launch foundations already in place</h2>
          <div className="pill-row" style={{ marginTop: 14 }}>
            <span className="pill">Prisma schema</span>
            <span className="pill">Supabase helpers</span>
            <span className="pill">Role-aware access</span>
            <span className="pill">Payment proof storage</span>
            <span className="pill">Timeline aggregation</span>
            <span className="pill">Sites configuration</span>
          </div>
          <div className="footer-note" style={{ marginTop: 14 }}>
            The app is now behaving like a real product surface instead of a loose scaffold, which puts us in a much better place for the final polish before publish.
          </div>
        </div>
      </section>

      <section className="section-grid">
        <div className="card span-6">
          <div className="eyebrow">Recent movement</div>
          <h2>Latest timeline activity</h2>
          <div className="timeline" style={{ marginTop: 14 }}>
            {recentTimeline.length ? (
              recentTimeline.map((event) => (
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
              ))
            ) : (
              <div className="list-item">
                <strong>No timeline activity yet</strong>
                <span className="meta">Start with CRM lead intake or use the seed tools to populate the workflow.</span>
              </div>
            )}
          </div>
        </div>

        <div className="card span-6">
          <div className="eyebrow">Module totals</div>
          <h2>What the live store currently holds</h2>
          <div className="list" style={{ marginTop: 14 }}>
            <div className="list-item">
              <strong>Clients</strong>
              <span className="meta">{state.clients.length}</span>
            </div>
            <div className="list-item">
              <strong>Lead qualifications</strong>
              <span className="meta">{state.leadQualifications.length}</span>
            </div>
            <div className="list-item">
              <strong>Commercial proposals</strong>
              <span className="meta">{state.commercialProposals.length}</span>
            </div>
            <div className="list-item">
              <strong>Payments and proof checks</strong>
              <span className="meta">
                {state.payments.length} payments · {state.advanceVerifications.length} verifications
              </span>
            </div>
            <div className="list-item">
              <strong>Evaluation engine data</strong>
              <span className="meta">
                {state.utilityRules.length} utility rules · {state.shaktiSnapshots.length} Shakti snapshots
              </span>
            </div>
            <div className="list-item">
              <strong>WhatsApp templates</strong>
              <span className="meta">{state.whatsappTemplates.length}</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
