import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { SiteHeader } from "@/components/site-header";
import { ChartUploadBoard } from "@/components/chart-upload-board";
import { chartAssetDefinitions } from "@/lib/chart-asset-definitions";
import { requirePageAccess } from "@/lib/page-access";

export default async function AssetsPage() {
  const access = await requirePageAccess("CONSULTANT");
  if (!access.allowed) {
    return (
      <main className="page-shell">
        <SiteHeader title="Chart Assets" subtitle="Upload pipeline and readiness" />
        <AccessDeniedPanel area="Chart assets" requiredRole="CONSULTANT" actorRole={access.actor.role} />
      </main>
    );
  }

  return (
    <main className="page-shell">
      <SiteHeader title="Chart Assets" subtitle="Upload pipeline and readiness" />

      <section className="hero-panel" style={{ marginTop: 22 }}>
        <div className="eyebrow">Asset pipeline</div>
        <h1>Upload the team’s chart images for every v1 report slot.</h1>
        <p className="lede">
          These remain image-driven in v1. We keep the chart logic separate for now and use this screen to make sure the visual asset set is fully uploaded and launch-ready.
        </p>
        <div className="pill-row" style={{ marginTop: 16 }}>
          <span className="pill">Required charts {chartAssetDefinitions.length}</span>
          <span className="pill">Location, angular, brahmsthan, marma</span>
          <span className="pill">16D, 32D, hand gridded chart</span>
        </div>
        <div className="hero-actions" style={{ marginTop: 14 }}>
          <a href="/evaluation" className="button">
            Open evaluation engine
          </a>
          <a href="/diagnostics" className="button-secondary">
            Check launch readiness
          </a>
        </div>
      </section>

      <ChartUploadBoard />
    </main>
  );
}
