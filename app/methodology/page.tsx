import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { MethodologyConsole } from "@/components/methodology-console";
import { AouMethodologyConsole } from "@/components/aou-methodology-console";
import { SiteHeader } from "@/components/site-header";
import { requirePageAccess } from "@/lib/page-access";

export default async function MethodologyPage() {
  const access = await requirePageAccess("SUPER_ADMIN");
  if (!access.allowed) return <main className="page-shell"><SiteHeader title="Methodology" subtitle="Versioned rules and golden fixtures" /><AccessDeniedPanel area="Methodology control" requiredRole="SUPER_ADMIN" actorRole={access.actor.role} /></main>;
  return <main className="page-shell"><SiteHeader title="Methodology" subtitle="Approve before the engine computes" /><MethodologyConsole /><AouMethodologyConsole /></main>;
}
