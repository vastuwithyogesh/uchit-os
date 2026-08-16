import { SiteHeader } from "@/components/site-header";
import { ClientPortal } from "@/components/client-portal";

export default async function ClientPage() {
  return <main className="page-shell"><SiteHeader title="Uchit Vastu" subtitle="Founder Edition" />
    <ClientPortal />
  </main>;
}
