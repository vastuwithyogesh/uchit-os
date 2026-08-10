import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { FilesDrawingsConsole } from "@/components/files-drawings-console";
import { SiteHeader } from "@/components/site-header";
import { requirePageAccess } from "@/lib/page-access";

export default async function FilesPage() {
  const access = await requirePageAccess("CONSULTANT");
  if (!access.allowed) return <main className="page-shell"><SiteHeader title="Files" subtitle="Drawings and document checks" /><AccessDeniedPanel area="Files and drawings" requiredRole="CONSULTANT" actorRole={access.actor.role} /></main>;
  return <main className="page-shell"><SiteHeader title="Files" subtitle="Drawings, versions, and corrections" /><FilesDrawingsConsole /></main>;
}
