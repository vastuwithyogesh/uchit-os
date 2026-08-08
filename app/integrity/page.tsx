import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { SiteHeader } from "@/components/site-header";
import { IntegrityConsole } from "@/components/integrity-console";
import { requirePageAccess } from "@/lib/page-access";

export default async function IntegrityPage() {
  const access = await requirePageAccess("ADMIN");
  if (!access.allowed) {
    return (
      <main className="page-shell">
        <SiteHeader title="Integrity" subtitle="Record consistency" />
        <AccessDeniedPanel area="Integrity" requiredRole="ADMIN" actorRole={access.actor.role} />
      </main>
    );
  }

  return (
    <main className="page-shell">
      <SiteHeader title="Integrity" subtitle="Record consistency" />

      <section className="hero-panel" style={{ marginTop: 22 }}>
        <div className="eyebrow">Consistency scan</div>
        <h1>Keep the links between clients, cases, reports, and snapshots honest.</h1>
        <p className="lede">
          This is a small backend safety net that helps us spot broken relationships while the system is still being built out.
        </p>
        <div className="hero-actions" style={{ marginTop: 14 }}>
          <a href="/diagnostics" className="button">
            Open diagnostics
          </a>
          <a href="/models" className="button-secondary">
            Review data model counts
          </a>
        </div>
        <div className="pill-row" style={{ marginTop: 16 }}>
          <span className="pill">Relationship checks</span>
          <span className="pill">Storage binding context</span>
          <span className="pill">Issue severity trail</span>
        </div>
      </section>

      <IntegrityConsole />
    </main>
  );
}
