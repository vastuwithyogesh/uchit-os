import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { FounderRouteIntro } from "@/components/founder-route-intro";
import { SiteHeader } from "@/components/site-header";
import { ClientCasePipeline } from "@/components/client-case-pipeline";
import { requirePageAccess } from "@/lib/page-access";
import { loadStateFromPersistence } from "@/lib/persistence";

export default async function ClientsCasesPage() {
  const access = await requirePageAccess("SETTER");
  if (!access.allowed) {
    return <main className="page-shell"><SiteHeader title="Clients & Cases" subtitle="Case and floor progress" /><AccessDeniedPanel area="Clients and Cases" requiredRole="SETTER" actorRole={access.actor.role} /></main>;
  }
  const state = await loadStateFromPersistence();
  return (
    <main className="page-shell">
      <SiteHeader title="Clients & Cases" subtitle="Case and floor progress" />
      <FounderRouteIntro eyebrow="Client & case pipeline" title="Keep every case moving without duplicating the client." description="Each permanent Client ID can own multiple cases. Every active case gets its own card and every floor keeps its own progress and report." primaryAction={{ href: "/lead-pipeline", label: "Open Lead Pipeline" }} secondaryAction={{ href: "/timeline", label: "Open history" }} context={`Founder Edition · ${state.vastuCases.length} cases · ${state.floorWorkspaces.length} floors`} status={{ label: "One case per card", tone: "ready" }} />
      <ClientCasePipeline state={state} />
    </main>
  );
}
