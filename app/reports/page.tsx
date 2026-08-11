import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { SiteHeader } from "@/components/site-header";
import { ReportConsole } from "@/components/report-console";
import { requirePageAccess } from "@/lib/page-access";

export default async function ReportsPage() {
  const access = await requirePageAccess("CONSULTANT");
  if (!access.allowed) {
    return (
      <main className="page-shell">
        <SiteHeader title="Reports" subtitle="Prepare, approve, and release" />
        <AccessDeniedPanel area="Report flow" requiredRole="CONSULTANT" actorRole={access.actor.role} />
      </main>
    );
  }

  return (
    <main className="page-shell">
      <SiteHeader title="Reports" subtitle="Prepare, approve, and release" />

      <section className="hero-panel" style={{ marginTop: 22 }}>
        <div className="eyebrow">Simple report steps</div>
        <h1>See what is done and what to do next.</h1>
        <p className="lede">
          Create the preview, confirm payment, record Founder review and approval, then release the final report.
        </p>
        <div className="hero-actions" style={{ marginTop: 14 }}>
          <a href="/ops" className="button">
            Back to cases
          </a>
          <a href="/timeline" className="button-secondary">
            View client history
          </a>
        </div>
        <div className="pill-row" style={{ marginTop: 16 }}>
          <span className="pill">Preview watermark control</span>
          <span className="pill">Founder review and approval</span>
          <span className="pill">Balance gate before verdict</span>
        </div>
      </section>

      <ReportConsole />
    </main>
  );
}
