import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { SiteHeader } from "@/components/site-header";
import { EvaluationConsole } from "@/components/evaluation-console";
import { ChartAssetBoard } from "@/components/chart-asset-board";
import { requirePageAccess } from "@/lib/page-access";

export default async function EvaluationPage() {
  const access = await requirePageAccess("CONSULTANT");
  if (!access.allowed) {
    return (
      <main className="page-shell">
        <SiteHeader title="Evaluation Engine" subtitle="Utility matrix and report template" />
        <AccessDeniedPanel area="Evaluation engine" requiredRole="CONSULTANT" actorRole={access.actor.role} />
      </main>
    );
  }

  return (
    <main className="page-shell">
      <SiteHeader title="Evaluation Engine" subtitle="Utility matrix and report template" />

      <section className="hero-panel" style={{ marginTop: 22 }}>
        <div className="eyebrow">Residential evaluation</div>
        <h1>Work from the CSV-backed utility matrix and the Shakti snapshot in one evaluation surface.</h1>
        <p className="lede">
          This screen shows the exact rule table behind the GOOD / BAD / OK-OK output, the Shakti input snapshot, and the preview watermark state that stays in place until the balance gate clears.
        </p>
        <div className="pill-row" style={{ marginTop: 16 }}>
          <span className="pill">Residential rule source of truth</span>
          <span className="pill">16-value Shakti input</span>
          <span className="pill">±2 tie-break support</span>
        </div>
        <div className="hero-actions" style={{ marginTop: 14 }}>
          <a href="/assets" className="button">
            Open chart uploads
          </a>
          <a href="/diagnostics" className="button-secondary">
            View snapshot diagnostics
          </a>
        </div>
      </section>

      <EvaluationConsole />
      <ChartAssetBoard />
    </main>
  );
}
