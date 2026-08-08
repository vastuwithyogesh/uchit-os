import { SiteHeader } from "@/components/site-header";
import { ChartUploadBoard } from "@/components/chart-upload-board";

export default function AssetsPage() {
  return (
    <main className="page-shell">
      <SiteHeader title="Chart Assets" subtitle="Local upload pipeline" />

      <section className="hero-panel" style={{ marginTop: 22 }}>
        <div className="eyebrow">Image pipeline</div>
        <h1>Upload the team’s chart images for each v1 slot.</h1>
        <p className="lede">
          These are just image assets for now. We’ll keep the logic separate and only connect the calculations after the team has uploaded the source visuals.
        </p>
      </section>

      <ChartUploadBoard />
    </main>
  );
}
