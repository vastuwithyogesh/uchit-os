import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { FounderRouteIntro } from "@/components/founder-route-intro";
import { MethodologyConsole } from "@/components/methodology-console";
import { AouMethodologyConsole } from "@/components/aou-methodology-console";
import { SiteHeader } from "@/components/site-header";
import { requirePageAccess } from "@/lib/page-access";

export default async function MethodologyPage() {
  const access = await requirePageAccess("SUPER_ADMIN");
  if (!access.allowed) return <main className="page-shell"><SiteHeader title="Methodology" subtitle="Versioned rules and golden fixtures" /><AccessDeniedPanel area="Methodology control" requiredRole="SUPER_ADMIN" actorRole={access.actor.role} /></main>;
  return <main className="page-shell"><SiteHeader title="Methodology" subtitle="Approve before the engine computes" /><FounderRouteIntro eyebrow="Methodology control" title="Approve the rule source before it can compute." description="Keep source text, versions, provenance and review status visible to the Founder. Missing or contradictory inputs remain blocked." context="Founder Edition · methodology owner only" status={{ label: "Approval required", tone: "attention" }} /><MethodologyConsole /><AouMethodologyConsole /></main>;
}
