import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { DocumentDeliveryConsole } from "@/components/document-delivery-console";
import { SiteHeader } from "@/components/site-header";
import { requirePageAccess } from "@/lib/page-access";

export default async function ReportDeliveriesPage() {
  const access = await requirePageAccess("ADMIN");
  if (!access.allowed) return <main className="page-shell"><SiteHeader title="Report Delivery" subtitle="Immutable client handoff" /><AccessDeniedPanel area="Final report delivery" requiredRole="ADMIN" actorRole={access.actor.role} /></main>;
  return <main className="page-shell"><SiteHeader title="Report Delivery" subtitle="Ready, deliver, and retain each protected floor report" /><DocumentDeliveryConsole /></main>;
}
