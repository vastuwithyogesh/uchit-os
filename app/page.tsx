import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { FounderScorecard } from "@/components/founder-scorecard";
import { SiteHeader } from "@/components/site-header";
import { buildFounderScorecard } from "@/lib/founder-scorecard";
import { requirePageAccess } from "@/lib/page-access";
import { loadStateFromPersistence } from "@/lib/persistence";

export default async function HomePage() {
  const access = await requirePageAccess("SETTER");
  if (!access.allowed) {
    return (
      <main className="page-shell">
        <SiteHeader title="Uchit Vastu" subtitle="Founder scorecard" />
        <AccessDeniedPanel area="Founder scorecard" requiredRole="SETTER" actorRole={access.actor.role} />
      </main>
    );
  }

  try {
    const state = await loadStateFromPersistence();
    const scorecard = buildFounderScorecard(state, access.actor);
    return (
      <main className="page-shell">
        <SiteHeader title="Founder scorecard" subtitle="One project, one next step" />
        <FounderScorecard scorecard={scorecard} />
      </main>
    );
  } catch {
    return (
      <main className="page-shell">
        <SiteHeader title="Founder scorecard" subtitle="One project, one next step" />
        <section className="workspace-state" role="alert">
          <h1>We could not load the scorecard</h1>
          <p>Nothing has been changed. Refresh this page to try again. If it still does not load, open System check for recovery guidance.</p>
          <a className="button-secondary" href="/diagnostics">Open System check</a>
        </section>
      </main>
    );
  }
}
