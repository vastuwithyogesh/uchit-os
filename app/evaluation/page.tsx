import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { FounderRouteIntro } from "@/components/founder-route-intro";
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

      <FounderRouteIntro
        eyebrow="Evaluation"
        title="Complete the next verified evaluation input."
        description="Open the exact floor context, confirm evidence and prerequisites, then review the deterministic evaluation output. Blocked methodology stays blocked until its approved input exists."
        primaryAction={{ href: "/files", label: "Open files and drawings" }}
        secondaryAction={{ href: "/assessment", label: "Open assessment workspace" }}
        context="Founder Edition · direction and element layers only"
        status={{ label: "Review prerequisites", tone: "attention" }}
      >
        <details className="route-secondary-links">
          <summary>More evaluation tools</summary>
          <div className="route-link-list">
            <a href="/assets" className="button-secondary">Open chart uploads</a>
            <a href="/diagnostics" className="button-secondary">View system check</a>
          </div>
        </details>
      </FounderRouteIntro>

      <EvaluationConsole />
      <ChartAssetBoard />
    </main>
  );
}
