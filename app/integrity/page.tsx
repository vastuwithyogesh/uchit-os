import { SiteHeader } from "@/components/site-header";
import { IntegrityConsole } from "@/components/integrity-console";

export default function IntegrityPage() {
  return (
    <main className="page-shell">
      <SiteHeader title="Integrity" subtitle="Record consistency" />

      <section className="hero-panel" style={{ marginTop: 22 }}>
        <div className="eyebrow">Consistency scan</div>
        <h1>Keep the links between clients, cases, reports, and snapshots honest.</h1>
        <p className="lede">
          This is a small backend safety net that helps us spot broken relationships while the system is still being built out.
        </p>
      </section>

      <IntegrityConsole />
    </main>
  );
}
