import { SiteHeader } from "@/components/site-header";
import { DiagnosticsConsole } from "@/components/diagnostics-console";

export default function DiagnosticsPage() {
  return (
    <main className="page-shell">
      <SiteHeader title="Diagnostics" subtitle="Snapshot and report trail" />

      <section className="hero-panel" style={{ marginTop: 22 }}>
        <div className="eyebrow">Backend sanity</div>
        <h1>Check that snapshots and report records are being persisted cleanly.</h1>
        <p className="lede">
          This page stays out of the main workflow and is only here to confirm that the stored model data is lining up with the workflow engine outputs.
        </p>
      </section>

      <DiagnosticsConsole />
    </main>
  );
}
