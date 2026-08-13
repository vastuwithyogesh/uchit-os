import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { FounderRouteIntro } from "@/components/founder-route-intro";
import { SiteHeader } from "@/components/site-header";
import { ReportConsole } from "@/components/report-console";
import { requirePageAccess } from "@/lib/page-access";

export default async function ReportsPage() {
  const access = await requirePageAccess("CONSULTANT");
  if (!access.allowed) {
    return (
      <main className="page-shell">
        <SiteHeader title="Reports" subtitle="Protected report preparation and history" />
        <AccessDeniedPanel area="Report flow" requiredRole="CONSULTANT" actorRole={access.actor.role} />
      </main>
    );
  }

  return (
    <main className="page-shell">
      <SiteHeader title="Reports" subtitle="Protected report preparation and history" />

      <FounderRouteIntro
        eyebrow="Reports"
        title="Release one protected report at a time."
        description="Prepare the watermarked preview, clear payment and Founder approval gates, then release an immutable report version. Historical releases never change in place."
        primaryAction={{ href: "/founder/continue", label: "Select a case and continue" }}
        secondaryAction={{ href: "/timeline", label: "View history" }}
        context="Founder Edition · preview, approval and protected release"
        status={{ label: "Gated release", tone: "attention" }}
      >
        <div className="pill-row route-quiet-pills">
          <span className="pill">Watermarked preview</span>
          <span className="pill">Founder approval</span>
          <span className="pill">Balance required</span>
        </div>
      </FounderRouteIntro>

      <details className="route-secondary-links legacy-console-disclosure">
        <summary>Open advanced report console</summary>
        <ReportConsole />
      </details>
    </main>
  );
}
