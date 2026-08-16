import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { FounderRouteIntro } from "@/components/founder-route-intro";
import { SiteHeader } from "@/components/site-header";
import { SpatialWorkspace } from "@/components/spatial-workspace";
import { requirePageAccess } from "@/lib/page-access";

export default async function SpatialPage({ searchParams }: { searchParams: Promise<{ caseId?: string; floorId?: string }> }) {
  const access = await requirePageAccess("CONSULTANT");
  if (!access.allowed) return <main className="page-shell"><SiteHeader title="Spatial Setup" subtitle="Plans, evidence, orientation, and mapping" /><AccessDeniedPanel area="Spatial setup" requiredRole="CONSULTANT" actorRole={access.actor.role} /></main>;
  const context = await searchParams;
  const suffix = context.caseId || context.floorId ? `?${new URLSearchParams({ ...(context.caseId ? { caseId: context.caseId } : {}), ...(context.floorId ? { floorId: context.floorId } : {}) }).toString()}` : "";
  return <main className="page-shell"><SiteHeader title="Spatial Setup" subtitle="One verified floor at a time" /><FounderRouteIntro eyebrow="Floor workspace" title="Lock the plan and orientation before mapping." description="Work on one floor and one plan version at a time. Computed geometry stays deferred when its methodology is not approved." primaryAction={{ href: `/founder/continue${suffix}`, label: "Continue to evaluation" }} secondaryAction={{ href: `/files${suffix}`, label: "Review evidence" }} context="Founder Edition · one floor per report" status={{ label: "Exact scope required", tone: "attention" }} /><SpatialWorkspace caseId={context.caseId} floorId={context.floorId} /></main>;
}
