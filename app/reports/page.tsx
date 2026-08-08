import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { SiteHeader } from "@/components/site-header";
import { ReportConsole } from "@/components/report-console";
import { requirePageAccess } from "@/lib/page-access";

export default async function ReportsPage() {
  const access = await requirePageAccess("CONSULTANT");
  if (!access.allowed) {
    return (
      <main className="page-shell">
        <SiteHeader title="Report Flow" subtitle="Preview, approvals, and verdict release" />
        <AccessDeniedPanel area="Report flow" requiredRole="CONSULTANT" actorRole={access.actor.role} />
      </main>
    );
  }

  return (
    <main className="page-shell">
      <SiteHeader title="Report Flow" subtitle="Preview, approvals, and verdict release" />

      <section className="hero-panel" style={{ marginTop: 22 }}>
        <div className="eyebrow">Report operations</div>
        <h1>Track the Stage-A preview, final report approvals, and verdict release from one screen.</h1>
        <p className="lede">
          This is the report control surface for the whole release chain: preview first, watermark while balance is pending, final report after payment clearance, and verdict release only after two approvals.
        </p>
        <div className="hero-actions" style={{ marginTop: 14 }}>
          <a href="/ops" className="button">
            Open operations console
          </a>
          <a href="/timeline" className="button-secondary">
            Review the client trail
          </a>
        </div>
        <div className="pill-row" style={{ marginTop: 16 }}>
          <span className="pill">Preview watermark control</span>
          <span className="pill">Two-person report approval</span>
          <span className="pill">Balance gate before verdict</span>
        </div>
      </section>

      <ReportConsole />
    </main>
  );
}
