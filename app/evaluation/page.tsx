import { SiteHeader } from "@/components/site-header";
import { EvaluationConsole } from "@/components/evaluation-console";
import { ChartAssetBoard } from "@/components/chart-asset-board";

export default function EvaluationPage() {
  return (
    <main className="page-shell">
      <SiteHeader title="Evaluation Engine" subtitle="Utility matrix and report template" />

      <section className="hero-panel" style={{ marginTop: 22 }}>
        <div className="eyebrow">Residential evaluation</div>
        <h1>Bring the CSV-backed utility matrix and the Stage-A report template into one view.</h1>
        <p className="lede">
          This screen is meant to show the exact rule table behind the GOOD / BAD / OK-OK output, plus the preview watermark state the report template uses before the balance gate clears.
        </p>
        <div className="hero-actions" style={{ marginTop: 14 }}>
          <a href="/assets" className="button">
            Open chart uploads
          </a>
          <a href="/diagnostics" className="button-secondary">
            View snapshot diagnostics
          </a>
        </div>
      </section>

      <EvaluationConsole />
      <ChartAssetBoard />
    </main>
  );
}
