import Link from "next/link";
import { CrmWorkbench } from "@/components/crm-workbench";
import {
  clients,
  commercialProposals,
  floorWorkspaces,
  leadQualifications,
  payments,
  reportVersions,
  users,
  timelineEvents,
  utilityRules,
  vastuCases,
  whatsappTemplates
} from "@/lib/seed";

export default function CrmPage() {
  return (
    <main className="page-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" />
          <div>
            <div>CRM Workbench</div>
            <div className="meta">Lead flow, approvals, and workspace control</div>
          </div>
        </div>
        <nav className="nav" aria-label="Primary">
          <Link href="/">Overview</Link>
          <Link href="/crm">CRM workbench</Link>
          <Link href="/timeline">Timeline</Link>
        </nav>
      </header>

      <section className="hero-panel" style={{ marginTop: 22 }}>
        <div className="eyebrow">Interactive demo</div>
        <h1>Run the qualification conversation, verify the commercial gate, and test the release path.</h1>
        <p className="lede">
          This page is the operational heart of the build. It brings together the setter flow, the Super-Admin approval lock, payment gates, floor workspace regeneration, preview watermarking, utility evaluation, and the Shakti engine in one place.
        </p>
      </section>

      <CrmWorkbench
        users={users}
        clients={clients}
        leads={leadQualifications}
        proposals={commercialProposals}
        payments={payments}
        cases={vastuCases}
        floors={floorWorkspaces}
        reports={reportVersions}
        utilityRules={utilityRules}
        templates={whatsappTemplates}
        timeline={timelineEvents}
      />
    </main>
  );
}
