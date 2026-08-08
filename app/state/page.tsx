import { SiteHeader } from "@/components/site-header";
import { StateConsole } from "@/components/state-console";

export default function StatePage() {
  return (
    <main className="page-shell">
      <SiteHeader title="State Snapshot" subtitle="Export and restore the local build state" />

      <section className="hero-panel" style={{ marginTop: 22 }}>
        <div className="eyebrow">Local snapshot</div>
        <h1>Capture, inspect, and restore the current app state.</h1>
        <p className="lede">
          This is the safest way to move the whole build around while we continue the backend work. It’s deliberately more about control than presentation.
        </p>
      </section>

      <StateConsole />
    </main>
  );
}
