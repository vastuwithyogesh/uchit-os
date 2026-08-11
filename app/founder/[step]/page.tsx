import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { FounderFlowPage } from "@/components/founder-flow";
import { SiteHeader } from "@/components/site-header";
import { buildFounderScorecard } from "@/lib/founder-scorecard";
import { requirePageAccess } from "@/lib/page-access";
import { loadStateFromPersistence } from "@/lib/persistence";

export default async function FounderStepPage({ params }: { params: Promise<{ step: string }> }) {
  const access = await requirePageAccess("SETTER");
  if (!access.allowed) return <main className="page-shell"><SiteHeader title="Founder workflow" subtitle="Focused module" minimal /><AccessDeniedPanel area="Founder workflow" requiredRole="SETTER" actorRole={access.actor.role} /></main>;
  const { step } = await params;
  const stepNumber = Number.parseInt(step, 10);
  try {
    const state = await loadStateFromPersistence();
    const scorecard = buildFounderScorecard(state, access.actor);
    return <main className="page-shell"><SiteHeader title="Founder workflow" subtitle="One module at a time" minimal /><FounderFlowPage scorecard={scorecard} stepNumber={stepNumber} /></main>;
  } catch {
    return <main className="page-shell"><SiteHeader title="Founder workflow" subtitle="One module at a time" minimal /><section className="workspace-state" role="alert"><h1>We could not load this step</h1><p>Nothing has changed. Refresh to retry or return to the scorecard.</p><a className="button-secondary" href="/">Back to scorecard</a></section></main>;
  }
}
