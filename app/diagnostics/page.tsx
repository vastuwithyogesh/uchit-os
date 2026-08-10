import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { SiteHeader } from "@/components/site-header";
import { DiagnosticsConsole } from "@/components/diagnostics-console";
import { requirePageAccess } from "@/lib/page-access";

export default async function DiagnosticsPage() {
  const access = await requirePageAccess("ADMIN");
  if (!access.allowed) {
    return (
      <main className="page-shell">
        <SiteHeader title="System Check" subtitle="Safe release readiness" />
        <AccessDeniedPanel area="System Check" requiredRole="ADMIN" actorRole={access.actor.role} />
      </main>
    );
  }

  return (
    <main className="page-shell">
      <SiteHeader title="System Check" subtitle="Safe release readiness" />
      <DiagnosticsConsole />
    </main>
  );
}
