import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { FounderRouteIntro } from "@/components/founder-route-intro";
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
        <FounderRouteIntro eyebrow="System check" title="Know what is ready before you proceed." description="This page checks Founder staging infrastructure without exposing secrets or changing application data." context="Founder Edition · one SUPER_ADMIN owner · client delivery deferred" status={{ label: "Readiness only", tone: "neutral" }} />
        <DiagnosticsConsole />
    </main>
  );
}
