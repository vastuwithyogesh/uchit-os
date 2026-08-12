import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { SiteHeader } from "@/components/site-header";
import { UnifiedLeadsWorkspace } from "@/components/unified-leads-workspace";
import { requirePageAccess } from "@/lib/page-access";

export default async function LeadPipelinePage() {
  const access = await requirePageAccess("SETTER");
  if (!access.allowed) return <main className="page-shell"><SiteHeader title="Lead Pipeline" subtitle="Acquisition and qualification" /><AccessDeniedPanel area="Lead Pipeline" requiredRole="SETTER" actorRole={access.actor.role} /></main>;
  return <main className="page-shell"><SiteHeader title="Lead Pipeline" subtitle="Acquisition and qualification" /><UnifiedLeadsWorkspace mode="pipeline" /></main>;
}
