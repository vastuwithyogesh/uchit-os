import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { FounderRouteIntro } from "@/components/founder-route-intro";
import { OperationsIntelligenceView } from "@/components/operations-intelligence-view";
import { SiteHeader } from "@/components/site-header";
import { requirePageAccess } from "@/lib/page-access";
import { loadStateFromPersistence } from "@/lib/persistence";
import { projectOperatingIntelligence } from "@/lib/operating-intelligence";

export default async function InsightsPage() {
  const access = await requirePageAccess("ADMIN");
  if (!access.allowed) {
    return <main className="page-shell"><SiteHeader title="Operations" subtitle="Aggregate workload and release attention" /><AccessDeniedPanel area="Operations intelligence" requiredRole="ADMIN" actorRole={access.actor.role} /></main>;
  }

  try {
    const state = await loadStateFromPersistence();
    const projection = projectOperatingIntelligence(state, access.actor, new Date().toISOString());
    return <main className="page-shell"><SiteHeader title="Operations" subtitle="Aggregate workload and release attention" /><FounderRouteIntro eyebrow="Operations" title="See where Founder attention is needed." description="Aggregate workload, delivery and release gates without exposing client identities, staff names or financial projections." context="Founder Edition · aggregate view only" status={{ label: "Internal view", tone: "neutral" }} /><OperationsIntelligenceView projection={projection} /></main>;
  } catch {
    return <main className="page-shell"><SiteHeader title="Operations" subtitle="Aggregate workload and release attention" /><FounderRouteIntro eyebrow="Operations" title="The aggregate view is unavailable." description="Nothing was changed. Retry once, then use System Check if the problem continues." primaryAction={{ href: "/insights", label: "Retry operations" }} secondaryAction={{ href: "/diagnostics", label: "Open system check" }} status={{ label: "Needs attention", tone: "attention" }} /><section className="card" role="alert" aria-live="polite"><p className="subtle">No aggregate result is available.</p></section></main>;
  }
}
