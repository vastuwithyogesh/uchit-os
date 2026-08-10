import { ClientPortal } from "@/components/client-portal";
import { SiteHeader } from "@/components/site-header";
import { headers } from "next/headers";
import { resolveRequestActor } from "@/lib/auth";
import { AccessDeniedPanel } from "@/components/access-denied-panel";

export default async function ClientPage() {
  const actor = await resolveRequestActor(await headers());
  if (actor.role !== "CLIENT") {
    return <main className="page-shell"><SiteHeader title="Uchit Vastu" subtitle="Client portal" /><AccessDeniedPanel area="Client portal" requiredRole="CLIENT" actorRole={actor.role} /></main>;
  }
  return <main className="page-shell client-portal"><SiteHeader title="Uchit Vastu" subtitle="Your secure client portal" /><ClientPortal /></main>;
}
