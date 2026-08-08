import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { CrmWorkbench } from "@/components/crm-workbench";
import { CommercialConsole } from "@/components/commercial-console";
import { LeadInboxConsole } from "@/components/lead-inbox-console";
import { SiteHeader } from "@/components/site-header";
import { requirePageAccess } from "@/lib/page-access";
import { loadStateFromPersistence } from "@/lib/persistence";

export default async function CrmPage() {
  const access = await requirePageAccess("SETTER");
  if (!access.allowed) {
    return (
      <main className="page-shell">
        <SiteHeader title="CRM Workbench" subtitle="Lead flow, approvals, and workspace control" />
        <AccessDeniedPanel area="CRM workbench" requiredRole="SETTER" actorRole={access.actor.role} />
      </main>
    );
  }

  const state = await loadStateFromPersistence();

  return (
    <main className="page-shell">
      <SiteHeader title="CRM Workbench" subtitle="Lead flow, approvals, and workspace control" />

      <section className="hero-panel" style={{ marginTop: 22 }}>
        <div className="eyebrow">Lead operations</div>
        <h1>Import website opt-in leads, filter them, and qualify the right ones into the CRM.</h1>
        <p className="lede">
          This page is now centered on the real intake flow: download the CSV from your website dashboard, upload it here, filter the rows, and qualify the leads that are ready.
        </p>
        <div className="stat-grid" style={{ marginTop: 22 }}>
          <div className="stat-card">
            <span className="stat-value">{state.clients.length}</span>
            <span className="stat-label">Active clients</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{state.optInLeads.length}</span>
            <span className="stat-label">Opt-in leads imported</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{state.reviewCallBookings.length}</span>
            <span className="stat-label">Review calls booked</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{state.advanceVerifications.length}</span>
            <span className="stat-label">Advance proofs verified</span>
          </div>
        </div>
        <div className="panel" style={{ marginTop: 18 }}>
          <div className="panel-head">
            <div>
              <strong>Current operating snapshot</strong>
              <div className="meta">This is the live state the team is working from right now.</div>
            </div>
            <span className="tag neutral">CRM workbench</span>
          </div>
          <div className="pill-row" style={{ marginTop: 12 }}>
            <span className="pill">Leads {state.leadQualifications.length}</span>
            <span className="pill">Proposals {state.commercialProposals.length}</span>
            <span className="pill">Cases {state.vastuCases.length}</span>
            <span className="pill">Reports {state.reportVersions.length}</span>
            <span className="pill">Outreach logs {state.timelineEvents.filter((event) => event.category === "Outreach").length}</span>
          </div>
        </div>
      </section>

      <LeadInboxConsole
        leadQualifications={state.leadQualifications}
        proposals={state.commercialProposals}
        reviewCallBookings={state.reviewCallBookings}
      />

      <CrmWorkbench
        clients={state.clients}
        leads={state.leadQualifications}
        proposals={state.commercialProposals}
        payments={state.payments}
        cases={state.vastuCases}
        floors={state.floorWorkspaces}
        reports={state.reportVersions}
        utilityRules={state.utilityRules}
        templates={state.whatsappTemplates}
        timeline={state.timelineEvents}
      />

      <CommercialConsole
        clients={state.clients}
        proposals={state.commercialProposals}
        reviewCallBookings={state.reviewCallBookings}
        payments={state.payments}
        advanceVerifications={state.advanceVerifications}
        cases={state.vastuCases}
        reports={state.reportVersions}
      />
    </main>
  );
}
