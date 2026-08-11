import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { FounderRouteIntro } from "@/components/founder-route-intro";
import { SiteHeader } from "@/components/site-header";
import { UnifiedLeadsWorkspace } from "@/components/unified-leads-workspace";
import { requirePageAccess } from "@/lib/page-access";

export default async function LeadPipelinePage() {
  const access = await requirePageAccess("SETTER");
  if (!access.allowed) {
    return <main className="page-shell"><SiteHeader title="Lead Pipeline" subtitle="Acquisition and qualification" /><AccessDeniedPanel area="Lead Pipeline" requiredRole="SETTER" actorRole={access.actor.role} /></main>;
  }
  return (
    <main className="page-shell">
      <SiteHeader title="Lead Pipeline" subtitle="Acquisition and qualification" />
      <FounderRouteIntro eyebrow="Lead Pipeline" title="Move one lead to its next qualification stage." description="This workspace stops at acquisition and qualification. Cases, floors, payments and reports continue in Clients & Cases and Evaluation." primaryAction={{ href: "#unified-leads-title", label: "Review lead stages" }} secondaryAction={{ href: "/crm", label: "Back to Leads" }} context="Founder Edition · canonical stage transitions" status={{ label: "Server-gated", tone: "ready" }} />
      <UnifiedLeadsWorkspace mode="pipeline" />
    </main>
  );
}
