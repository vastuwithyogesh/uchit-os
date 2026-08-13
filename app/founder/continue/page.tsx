import { redirect } from "next/navigation";
import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { SiteHeader } from "@/components/site-header";
import { buildFounderScorecard } from "@/lib/founder-scorecard";
import { getCurrentFounderFlowStep } from "@/lib/founder-flow";
import { requirePageAccess } from "@/lib/page-access";
import { loadStateFromPersistence } from "@/lib/persistence";

export default async function FounderContinuePage({ searchParams }: { searchParams: Promise<{ caseId?: string; floorId?: string }> }) {
  const access = await requirePageAccess("SETTER");
  if (!access.allowed) {
    return <main className="page-shell"><SiteHeader title="Evaluation" subtitle="Continue the current floor" minimal /><AccessDeniedPanel area="Evaluation" requiredRole="SETTER" actorRole={access.actor.role} /></main>;
  }

  let current;
  try {
    const state = await loadStateFromPersistence();
    const context = await searchParams;
    const scorecard = buildFounderScorecard(state, access.actor, undefined, context.caseId, context.floorId);
    current = getCurrentFounderFlowStep(scorecard);
  } catch {
    return <main className="page-shell"><SiteHeader title="Evaluation" subtitle="Continue the current floor" minimal /><section className="workspace-state" role="alert"><h1>Evaluation context is unavailable</h1><p>Nothing has changed. Return to the scorecard and retry after the current case and floor context is available.</p><a className="button-secondary" href="/">Back to scorecard</a></section></main>;
  }

  if (current) redirect(current.flowPath);
  return null;
}
