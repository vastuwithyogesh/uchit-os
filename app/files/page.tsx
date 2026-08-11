import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { FilesDrawingsConsole } from "@/components/files-drawings-console";
import { FounderRouteIntro } from "@/components/founder-route-intro";
import { SiteHeader } from "@/components/site-header";
import { requirePageAccess } from "@/lib/page-access";

export default async function FilesPage() {
  const access = await requirePageAccess("CONSULTANT");
  if (!access.allowed) return <main className="page-shell"><SiteHeader title="Files" subtitle="Drawings and document checks" /><AccessDeniedPanel area="Files and drawings" requiredRole="CONSULTANT" actorRole={access.actor.role} /></main>;
  return <main className="page-shell"><SiteHeader title="Files" subtitle="Drawings, versions, and corrections" /><FounderRouteIntro eyebrow="Evidence" title="Make the exact floor evidence trustworthy." description="Upload protected plan and drawing versions, confirm the required hand-marked evidence, and keep every replacement traceable." primaryAction={{ href: "/spatial", label: "Continue to spatial setup" }} secondaryAction={{ href: "/evaluation", label: "Check evaluation readiness" }} context="Founder Edition · protected files and exact floor scope" status={{ label: "Evidence first", tone: "attention" }} /><FilesDrawingsConsole /></main>;
}
