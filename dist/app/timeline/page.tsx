import { SiteHeader } from "@/components/site-header";
import { TimelineConsole } from "@/components/timeline-console";

export default function TimelinePage() {
  return (
    <main className="page-shell">
      <SiteHeader title="Permanent Timeline" subtitle="Every event tied back to the client" />

      <section className="hero-panel" style={{ marginTop: 22 }}>
        <div className="eyebrow">Client history</div>
        <h1>One permanent timeline for every lead, payment, workspace edit, report version, and verdict release.</h1>
        <p className="lede">
          The timeline intentionally aggregates the entire client journey so the team can audit what happened, when it happened, and who touched it. This keeps the CRM, case flow, and report trail aligned.
        </p>
      </section>

      <TimelineConsole />
    </main>
  );
}
