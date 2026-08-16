import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { FounderFlowHome } from "@/components/founder-flow";
import { SiteHeader } from "@/components/site-header";
import { buildFounderScorecard } from "@/lib/founder-scorecard";
import { requireFounderPageAccess } from "@/lib/page-access";
import { loadStateFromPersistence } from "@/lib/persistence";

export default async function HomePage({ searchParams }: { searchParams?: Promise<{ caseId?: string; floorId?: string }> }) {
  const access = await requireFounderPageAccess("SETTER");
  if (!access.allowed) {
    return (
      <main className="page-shell">
        <SiteHeader title="Uchit Vastu" subtitle="Founder workflow" />
        <AccessDeniedPanel area="Founder scorecard" requiredRole="SETTER" actorRole={access.actor.role} />
      </main>
    );
  }

  try {
    const state = await loadStateFromPersistence();
    const context = await searchParams;
    const scorecard = buildFounderScorecard(state, access.actor, undefined, context?.caseId, context?.floorId);
    return (
      <main className="page-shell">
        <SiteHeader title="Founder Command Center" subtitle="Start, continue, and monitor governed work" />
        <FounderFlowHome scorecard={scorecard} />
      </main>
    );
  } catch {
    return (
      <main className="page-shell">
        <SiteHeader title="Founder Command Center" subtitle="Start, continue, and monitor governed work" />
        <section className="workspace-state" role="alert">
          <h1>We could not load the scorecard</h1>
          <p>Nothing has been changed. Refresh this page to try again. If it still does not load, open System check for recovery guidance.</p>
          <a className="button-secondary" href="/diagnostics">Open System check</a>
        </section>
      </main>
    );
  }
}
