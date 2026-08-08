import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { SiteHeader } from "@/components/site-header";
import { StateConsole } from "@/components/state-console";
import { requirePageAccess } from "@/lib/page-access";

export default async function StatePage() {
  const access = await requirePageAccess("SUPER_ADMIN");
  if (!access.allowed) {
    return (
      <main className="page-shell">
        <SiteHeader title="State Snapshot" subtitle="Export and restore application state" />
        <AccessDeniedPanel area="State snapshot" requiredRole="SUPER_ADMIN" actorRole={access.actor.role} />
      </main>
    );
  }

  return (
    <main className="page-shell">
      <SiteHeader title="State Snapshot" subtitle="Export and restore application state" />

      <section className="hero-panel" style={{ marginTop: 22 }}>
        <div className="eyebrow">State control</div>
        <h1>Capture, inspect, and restore the current application snapshot with confidence.</h1>
        <p className="lede">
          This is the safest way to move the working build forward while backend setup continues. It gives us one place to export the current state, review integrity warnings, and re-import a known-good snapshot when needed.
        </p>
        <div className="hero-actions" style={{ marginTop: 14 }}>
          <a href="/bootstrap" className="button">
            Open bootstrap controls
          </a>
          <a href="/integrity" className="button-secondary">
            Review integrity status
          </a>
        </div>
        <div className="pill-row" style={{ marginTop: 16 }}>
          <span className="pill">Snapshot export</span>
          <span className="pill">Integrity review</span>
          <span className="pill">Controlled restore path</span>
        </div>
      </section>

      <StateConsole />
    </main>
  );
}
