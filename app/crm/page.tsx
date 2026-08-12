import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { UnifiedLeadsWorkspace } from "@/components/unified-leads-workspace";
import { SiteHeader } from "@/components/site-header";
import { requirePageAccess } from "@/lib/page-access";

export default async function CrmPage() {
  const access = await requirePageAccess("SETTER");
  if (!access.allowed) return <main className="page-shell"><SiteHeader title="Leads" subtitle="Opt-ins and next action" /><AccessDeniedPanel area="Leads" requiredRole="SETTER" actorRole={access.actor.role} /></main>;
  return <main className="page-shell"><SiteHeader title="Leads" subtitle="Search, open and continue one lead" /><UnifiedLeadsWorkspace mode="leads" /></main>;
}
