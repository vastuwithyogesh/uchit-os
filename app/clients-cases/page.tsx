import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { SiteHeader } from "@/components/site-header";
import { ClientCasePipeline } from "@/components/client-case-pipeline";
import { requirePageAccess } from "@/lib/page-access";
import { loadStateFromPersistence } from "@/lib/persistence";

export default async function ClientsCasesPage() {
  const access = await requirePageAccess("SETTER");
  if (!access.allowed) return <main className="page-shell"><SiteHeader title="Clients & Cases" subtitle="Case and floor progress" /><AccessDeniedPanel area="Clients and Cases" requiredRole="SETTER" actorRole={access.actor.role} /></main>;
  const state = await loadStateFromPersistence();
  return <main className="page-shell"><SiteHeader title="Clients & Cases" subtitle="Continue the next case or floor" /><ClientCasePipeline state={state} actorRole={access.actor.role} /></main>;
}
