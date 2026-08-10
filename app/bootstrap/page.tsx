import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { SiteHeader } from "@/components/site-header";
import { BootstrapConsole } from "@/components/bootstrap-console";
import { requirePageAccess } from "@/lib/page-access";

export default async function BootstrapPage() {
  const access = await requirePageAccess("ADMIN");
  if (!access.allowed) {
    return (
      <main className="page-shell">
        <SiteHeader title="Data Readiness" subtitle="Safe state inspection and recovery" />
        <AccessDeniedPanel area="Data readiness" requiredRole="ADMIN" actorRole={access.actor.role} />
      </main>
    );
  }

  return (
    <main className="page-shell">
      <SiteHeader title="Data Readiness" subtitle="Safe state inspection and recovery" />

      <section className="hero-panel" style={{ marginTop: 22 }}>
        <div className="eyebrow">Production data safety</div>
        <h1>Check the saved records without replacing them.</h1>
        <p className="lede">
          Production records always come from durable storage. This screen can inspect the current snapshot, while full restoration stays in the owner-only recovery area.
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
          <span className="pill">Read-only inspection</span>
          <span className="pill">No demo overwrite</span>
          <span className="pill">Owner-controlled recovery</span>
        </div>
      </section>

      <BootstrapConsole />
    </main>
  );
}
