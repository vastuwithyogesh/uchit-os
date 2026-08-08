import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { SiteHeader } from "@/components/site-header";
import { requirePageAccess } from "@/lib/page-access";
import { loadStateFromPersistence } from "@/lib/persistence";

export default async function ModelsPage() {
  const access = await requirePageAccess("ADMIN");
  if (!access.allowed) {
    return (
      <main className="page-shell">
        <SiteHeader title="Backend Model Summary" subtitle="Counts and coverage for the core domain objects" />
        <AccessDeniedPanel area="Backend model summary" requiredRole="ADMIN" actorRole={access.actor.role} />
      </main>
    );
  }

  const state = await loadStateFromPersistence();

  const counts = [
    ["Clients", state.clients.length],
    ["Lead qualifications", state.leadQualifications.length],
    ["Commercial proposals", state.commercialProposals.length],
    ["Review call bookings", state.reviewCallBookings.length],
    ["Payments", state.payments.length],
    ["Advance verifications", state.advanceVerifications.length],
    ["Vastu cases", state.vastuCases.length],
    ["Floor workspaces", state.floorWorkspaces.length],
    ["Report versions", state.reportVersions.length],
    ["Evaluation snapshots", state.evaluationSnapshots.length],
    ["Mapping32D entries", state.mapping32D.length],
    ["Mapping16D entries", state.mapping16D.length],
    ["Utility rules", state.utilityRules.length],
    ["Shakti snapshots", state.shaktiSnapshots.length],
    ["Timeline events", state.timelineEvents.length],
    ["WhatsApp templates", state.whatsappTemplates.length],
    ["WhatsApp logs", state.whatsappLogs.length]
  ] as const;

  return (
    <main className="page-shell">
      <SiteHeader title="Backend Model Summary" subtitle="Counts and coverage for the core domain objects" />

      <section className="hero-panel" style={{ marginTop: 22 }}>
        <div className="eyebrow">Data model</div>
        <h1>A quick readout of the main entities already scaffolded into the system.</h1>
        <p className="lede">
          This page is intentionally straightforward. It helps us verify that the Prisma-backed shape, the live application state, and the persistence bridge are all tracking the same core objects.
        </p>
        <div className="hero-actions" style={{ marginTop: 14 }}>
          <a href="/integrity" className="button">
            Run integrity review
          </a>
          <a href="/diagnostics" className="button-secondary">
            Open diagnostics
          </a>
        </div>
        <div className="pill-row" style={{ marginTop: 16 }}>
          <span className="pill">Core domain counts</span>
          <span className="pill">Persistence-backed readout</span>
          <span className="pill">Coverage verification</span>
        </div>
      </section>

      <section className="section-grid">
        <div className="card span-8">
          <div className="eyebrow">Entity counts</div>
          <h2>Core records currently loaded</h2>
          <div className="stat-grid" style={{ marginTop: 18 }}>
            <div className="stat-card">
              <span className="stat-value">{state.clients.length}</span>
              <span className="stat-label">clients</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{state.vastuCases.length}</span>
              <span className="stat-label">vastu cases</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{state.reportVersions.length}</span>
              <span className="stat-label">report versions</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{state.timelineEvents.length}</span>
              <span className="stat-label">timeline events</span>
            </div>
          </div>
          <div className="list" style={{ marginTop: 16 }}>
            {counts.map(([label, value]) => (
              <div key={label} className="list-item">
                <strong>{label}</strong>
                <span className="meta">{value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card span-4">
          <div className="eyebrow">Coverage notes</div>
          <h2>What is already scaffolded</h2>
          <div className="list" style={{ marginTop: 16 }}>
            <div className="list-item">
              <strong>Charts</strong>
              <span className="meta">Tracked upload pipeline with readiness counts for all seven required charts</span>
            </div>
            <div className="list-item">
              <strong>Evaluation</strong>
              <span className="meta">CSV-backed utility matrix and Shakti snapshots</span>
            </div>
            <div className="list-item">
              <strong>Bookings</strong>
              <span className="meta">Review-call holds and advance-proof checks</span>
            </div>
            <div className="list-item">
              <strong>Timeline</strong>
              <span className="meta">Live client-wide history feed</span>
            </div>
            <div className="list-item">
              <strong>Reports</strong>
              <span className="meta">Preview watermark and verdict release gates</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
