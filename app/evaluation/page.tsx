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
        <h1>Review the case, then turn verified findings into a clear action plan.</h1>
        <p className="lede">
          Complete the technical evaluation here. When it is ready, open the action plan to record what you saw, what should change, and who will do it.
        </p>
        <div className="pill-row" style={{ marginTop: 16 }}>
          <span className="pill">Residential rule source of truth</span>
          <span className="pill">16-value Shakti input</span>
          <span className="pill">±2 tie-break support</span>
        </div>
        <div className="hero-actions" style={{ marginTop: 14 }}>
          <a href="/assessment" className="button">Open assessment workspace</a>
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
