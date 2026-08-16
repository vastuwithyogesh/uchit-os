import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { BrandDocumentTemplatesConsole } from "@/components/brand-document-templates-console";
import { SiteHeader } from "@/components/site-header";
import { requirePageAccess } from "@/lib/page-access";

export default async function BrandTemplatesPage() {
  const access = await requirePageAccess("ADMIN");
  if (!access.allowed) return <main className="page-shell"><SiteHeader title="Brand & Document Templates" subtitle="Central OS branding authority" /><AccessDeniedPanel area="Brand & Document Templates" requiredRole="ADMIN" actorRole={access.actor.role} /></main>;
  return <main className="page-shell"><SiteHeader title="Brand & Document Templates" subtitle="One organisation profile · governed templates · immutable artifact snapshots" /><BrandDocumentTemplatesConsole /></main>;
}
