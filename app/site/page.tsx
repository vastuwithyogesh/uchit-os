import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { SiteAnalysisConsole } from "@/components/site-analysis-console";
import { SiteHeader } from "@/components/site-header";
import { requirePageAccess } from "@/lib/page-access";

export default async function SiteAnalysisPage() {
  const access = await requirePageAccess("CONSULTANT");
  if (!access.allowed) return <main className="page-shell"><SiteHeader title="Site Analysis" subtitle="Floor observations after Stage A presentation" /><AccessDeniedPanel area="Site Analysis" requiredRole="CONSULTANT" actorRole={access.actor.role} /></main>;
  return <main className="page-shell"><SiteHeader title="Site Analysis" subtitle="One exact floor at a time" /><SiteAnalysisConsole /></main>;
}
