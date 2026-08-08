import { CrmWorkbench } from "@/components/crm-workbench";
import { SiteHeader } from "@/components/site-header";
import {
  clients,
  commercialProposals,
  floorWorkspaces,
  leadQualifications,
  payments,
  reportVersions,
  seedTotals,
  users,
  timelineEvents,
  utilityRules,
  vastuCases,
  whatsappTemplates
} from "@/lib/seed";

export default function HomePage() {
  return (
    <main className="page-shell">
      <SiteHeader title="Uchit Vastu" subtitle="CRM + evaluation engine" />

      <section className="hero">
        <div className="hero-panel">
          <div className="eyebrow">v0.2 foundation</div>
          <h1>Lead intake, commercial approval, payment gating, and verdict release in one controlled flow.</h1>
          <p className="lede">
            This build maps the PRD into a single operating surface for setters, consultants, admins, and super-admins. The demo keeps the full shape of the product visible: ScoreApp-style intake, Rs 51,000 proposals, Rs 11,000 minimum advances, floor workspace locking, utility evaluation, Shakti ranking, report approvals, WhatsApp templates, and a permanent client timeline.
          </p>
          <div className="hero-actions">
            <a href="/crm" className="button">Open the CRM workbench</a>
            <a href="/timeline" className="button-secondary">Review the timeline</a>
          </div>
          <div className="pill-row" style={{ marginTop: 18 }}>
            <span className="pill">Super-admin approval only</span>
            <span className="pill">Balance gate before verdict</span>
            <span className="pill">Two-person report approval</span>
            <span className="pill">Supabase ready</span>
            <span className="pill">Prisma schema included</span>
          </div>
        </div>

        <aside className="hero-side">
          <div className="stat-grid">
            <div className="stat-card">
              <span className="stat-value">{seedTotals.clients}</span>
              <span className="stat-label">clients in the demo flow</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{seedTotals.leads}</span>
              <span className="stat-label">qualified conversations</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{seedTotals.utilityRules}</span>
              <span className="stat-label">utility rules seeded from CSV</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{whatsappTemplates.length}</span>
              <span className="stat-label">WhatsApp templates</span>
            </div>
          </div>
          <div className="card">
            <div className="eyebrow">Current operator</div>
            <h3>Local role session</h3>
            <p className="subtle">Use the role picker in the header to switch between setter, consultant, admin, and Super-Admin views.</p>
            <div className="pill-row" style={{ marginTop: 14 }}>
              <span className="pill">Case pipeline {vastuCases[0]?.caseNumber}</span>
              <span className="pill">Preview {reportVersions[0]?.status}</span>
            </div>
          </div>
        </aside>
      </section>

      <section className="section-grid">
        <div className="card span-4">
          <div className="eyebrow">Lead pipeline</div>
          <h2>Setter dashboard and qualification call</h2>
          <p className="subtle">The lead starts with a guided conversation, moves through the 2-minute qualification call, and triggers a deliverable when the score crosses the acceptance threshold.</p>
          <div className="list" style={{ marginTop: 14 }}>
            {leadQualifications.map((lead) => (
              <div key={lead.id} className="list-item">
                <strong>{clients.find((client) => client.id === lead.clientId)?.displayName}</strong>
                <span className="meta">{lead.notes}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card span-4">
          <div className="eyebrow">Commercials</div>
          <h2>Rs 51,000 default proposal flow</h2>
          <p className="subtle">The proposal stays blocked until a Super-Admin approves it, and the case cannot open until the minimum advance is approved.</p>
          <div className="list" style={{ marginTop: 14 }}>
            {commercialProposals.map((proposal) => (
              <div key={proposal.id} className="list-item">
                <strong>{proposal.status}</strong>
                <span className="meta">Advance floor {proposal.minAdvanceInr.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card span-4">
          <div className="eyebrow">Report gate</div>
          <h2>Preview watermark and verdict release</h2>
          <p className="subtle">Stage-A stays watermarked while payment is pending. The official verdict only unlocks after balance approval and two report approvals.</p>
          <div className="list" style={{ marginTop: 14 }}>
            {reportVersions.map((report) => (
              <div key={report.id} className="list-item">
                <strong>{report.versionLabel}</strong>
                <span className="meta">{report.status}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CrmWorkbench
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

      <section className="section-grid">
        <div className="card span-6">
          <div className="eyebrow">Model coverage</div>
          <h2>Domain objects included in the scaffold</h2>
          <div className="pill-row">
            <span className="pill">Client</span>
            <span className="pill">LeadQualification</span>
            <span className="pill">CommercialProposal</span>
            <span className="pill">Payment</span>
            <span className="pill">VastuCase</span>
            <span className="pill">FloorWorkspace</span>
            <span className="pill">ReportVersion</span>
            <span className="pill">EvaluationSnapshot</span>
            <span className="pill">Mapping32D</span>
            <span className="pill">Mapping16D</span>
            <span className="pill">UtilityRule</span>
            <span className="pill">ShaktiSnapshot</span>
            <span className="pill">WhatsAppTemplate</span>
            <span className="pill">ClientTimelineEvent</span>
          </div>
        </div>
        <div className="card span-6">
          <div className="eyebrow">Backend setup</div>
          <h2>Supabase and Vercel ready</h2>
          <p className="subtle">
            The repo includes a Prisma schema, Supabase client helpers, environment templates, and a Vercel config so the project can connect to a real backend as soon as credentials are filled in.
          </p>
          <div className="pill-row" style={{ marginTop: 14 }}>
            <span className="pill">/prisma/schema.prisma</span>
            <span className="pill">/.env.example</span>
            <span className="pill">/supabase/config.toml</span>
            <span className="pill">/vercel.json</span>
          </div>
        </div>
      </section>
    </main>
  );
}
