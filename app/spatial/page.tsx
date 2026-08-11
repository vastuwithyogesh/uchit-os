import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { SiteHeader } from "@/components/site-header";
import { SpatialWorkspace } from "@/components/spatial-workspace";
import { requirePageAccess } from "@/lib/page-access";

export default async function SpatialPage() {
  const access = await requirePageAccess("CONSULTANT");
  if (!access.allowed) return <main className="page-shell"><SiteHeader title="Spatial Setup" subtitle="Plans, evidence, orientation, and mapping" /><AccessDeniedPanel area="Spatial setup" requiredRole="CONSULTANT" actorRole={access.actor.role} /></main>;
  return <main className="page-shell"><SiteHeader title="Spatial Setup" subtitle="One verified floor at a time" /><SpatialWorkspace /></main>;
}
