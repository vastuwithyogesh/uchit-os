import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { SiteHeader } from "@/components/site-header";
import { BootstrapConsole } from "@/components/bootstrap-console";
import { requirePageAccess } from "@/lib/page-access";

export default async function BootstrapPage() {
  const access = await requirePageAccess("ADMIN");
  if (!access.allowed) {
    return (
      <main className="page-shell">
        <SiteHeader title="Bootstrap Control Room" subtitle="State sync and recovery" />
        <AccessDeniedPanel area="Bootstrap control room" requiredRole="ADMIN" actorRole={access.actor.role} />
      </main>
    );
  }

  return (
    <main className="page-shell">
      <SiteHeader title="Bootstrap Control Room" subtitle="State sync and recovery" />

      <section className="hero-panel" style={{ marginTop: 22 }}>
        <div className="eyebrow">State management</div>
        <h1>Sync the working state into persistence and reload the current snapshot.</h1>
        <p className="lede">
          Use this page whenever you want the application state, persistence layer, and seeded workflow records to line up before a broader verification pass.
        </p>
        <div className="hero-actions" style={{ marginTop: 14 }}>
          <a href="/state" className="button">
            Open state snapshot
          </a>
          <a href="/integrity" className="button-secondary">
            Run integrity review
          </a>
        </div>
        <div className="pill-row" style={{ marginTop: 16 }}>
          <span className="pill">State sync and recovery</span>
          <span className="pill">Persistence alignment</span>
          <span className="pill">Verification support</span>
        </div>
      </section>

      <BootstrapConsole />
    </main>
  );
}
