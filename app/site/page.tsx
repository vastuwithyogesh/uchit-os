import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { SiteAnalysisConsole } from "@/components/site-analysis-console";
import { FounderRouteIntro } from "@/components/founder-route-intro";
import { SiteHeader } from "@/components/site-header";
import { requirePageAccess } from "@/lib/page-access";

export default async function SiteAnalysisPage() {
  const access = await requirePageAccess("CONSULTANT");
  if (!access.allowed) return <main className="page-shell"><SiteHeader title="Site Analysis" subtitle="Floor observations after Stage A presentation" /><AccessDeniedPanel area="Site Analysis" requiredRole="CONSULTANT" actorRole={access.actor.role} /></main>;
  return <main className="page-shell"><SiteHeader title="Site Analysis" subtitle="One exact floor at a time" /><FounderRouteIntro eyebrow="Site and environment" title="Record what was observed after Stage A." description="Capture the floor-scoped visit or video analysis, then add the post-site findings summary without rerunning the evaluation engine." primaryAction={{ href: "/reports", label: "Review Stage A and report" }} secondaryAction={{ href: "/timeline", label: "Open history" }} context="Founder Edition · linked to the exact verdict version" status={{ label: "Methodology-bound", tone: "ready" }} /><SiteAnalysisConsole /></main>;
}
