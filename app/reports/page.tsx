import { SiteHeader } from "@/components/site-header";
import { ReportConsole } from "@/components/report-console";

export default function ReportsPage() {
  return (
    <main className="page-shell">
      <SiteHeader title="Report Flow" subtitle="Preview, approvals, and verdict release" />

      <section className="hero-panel" style={{ marginTop: 22 }}>
        <div className="eyebrow">Report template view</div>
        <h1>See the Stage-A preview watermark and the final verdict gate in one place.</h1>
        <p className="lede">
          This is the cleanest place to watch the report lifecycle: a preview can be generated early, it stays watermarked while balance is pending, and the final verdict only opens after two approvals.
        </p>
      </section>

      <ReportConsole />
    </main>
  );
}
