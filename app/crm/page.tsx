import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { CrmWorkbench } from "@/components/crm-workbench";
import { CrmPipelineBoard } from "@/components/crm-pipeline-board";
import { ClientIntakeForm } from "@/components/client-intake-form";
import { CommercialConsole } from "@/components/commercial-console";
import { FounderRouteIntro } from "@/components/founder-route-intro";
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

      <FounderRouteIntro
        eyebrow="Client flow"
        title="Move one client from first contact to a confirmed case."
        description="Keep opt-in, qualification, scope, payment and case creation in one auditable sequence. The server remains the source of truth for every transition."
        primaryAction={{ href: "#client-intake", label: "Start client intake" }}
        secondaryAction={{ href: "/timeline", label: "Open client history" }}
        context={`Founder Edition · ${state.clients.length} clients · ${state.vastuCases.length} cases`}
        status={{ label: state.clients.length ? "Ready for intake" : "Attention needed", tone: state.clients.length ? "ready" : "attention" }}
      >
        <div className="stat-grid route-stat-grid" aria-label="CRM summary">
          <div className="stat-card"><span className="stat-value">{state.clients.length}</span><span className="stat-label">clients</span></div>
          <div className="stat-card"><span className="stat-value">{state.optInLeads.length}</span><span className="stat-label">opt-ins</span></div>
          <div className="stat-card"><span className="stat-value">{state.reviewCallBookings.length}</span><span className="stat-label">review calls</span></div>
          <div className="stat-card"><span className="stat-value">{state.advanceVerifications.length}</span><span className="stat-label">advance proofs</span></div>
        </div>
      </FounderRouteIntro>

      <CrmPipelineBoard />
      <div id="client-intake"><ClientIntakeForm /></div>
      <LeadInboxConsole
        leadQualifications={state.leadQualifications}
        proposals={state.commercialProposals}
        reviewCallBookings={state.reviewCallBookings}
      />

      <CrmWorkbench
        commercialPolicy={state.commercialPolicy}
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
        commercialPolicy={state.commercialPolicy}
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
