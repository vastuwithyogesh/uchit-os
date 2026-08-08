import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { SiteHeader } from "@/components/site-header";
import { DiagnosticsConsole } from "@/components/diagnostics-console";
import { requirePageAccess } from "@/lib/page-access";

export default async function DiagnosticsPage() {
  const access = await requirePageAccess("ADMIN");
  if (!access.allowed) {
    return (
      <main className="page-shell">
        <SiteHeader title="Diagnostics" subtitle="Snapshot and report trail" />
        <AccessDeniedPanel area="Diagnostics" requiredRole="ADMIN" actorRole={access.actor.role} />
      </main>
    );
  }

  return (
    <main className="page-shell">
      <SiteHeader title="Diagnostics" subtitle="Snapshot and report trail" />

      <section className="hero-panel" style={{ marginTop: 22 }}>
        <div className="eyebrow">Operational diagnostics</div>
        <h1>Check launch readiness, persisted snapshots, and workflow records in one review screen.</h1>
        <p className="lede">
          This page sits just outside the main workflow and helps us confirm that stored model data, approvals, payment proofs, bookings, and report records are all lining up before publish.
        </p>
        <div className="hero-actions" style={{ marginTop: 14 }}>
          <a href="/settings" className="button">
            Review workspace settings
          </a>
          <a href="/state" className="button-secondary">
            Inspect application state
          </a>
        </div>
        <div className="pill-row" style={{ marginTop: 16 }}>
          <span className="pill">Runtime bindings</span>
          <span className="pill">Launch readiness checklist</span>
          <span className="pill">Snapshot persistence trail</span>
        </div>
      </section>

      <DiagnosticsConsole />
    </main>
  );
}
