import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { SiteHeader } from "@/components/site-header";
import { TimelineConsole } from "@/components/timeline-console";
import { requirePageAccess } from "@/lib/page-access";

export default async function TimelinePage() {
  const access = await requirePageAccess("SETTER");
  if (!access.allowed) {
    return (
      <main className="page-shell">
        <SiteHeader title="Permanent Timeline" subtitle="Every event tied back to the client" />
        <AccessDeniedPanel area="Permanent timeline" requiredRole="SETTER" actorRole={access.actor.role} />
      </main>
    );
  }

  return (
    <main className="page-shell">
      <SiteHeader title="Permanent Timeline" subtitle="Every event tied back to the client" />

      <section className="hero-panel" style={{ marginTop: 22 }}>
        <div className="eyebrow">Client history</div>
        <h1>One permanent timeline for every lead, payment, workspace edit, report version, and verdict release.</h1>
        <p className="lede">
          The timeline intentionally aggregates the entire client journey so the team can audit what happened, when it happened, and who touched it. This keeps the CRM, case flow, and report trail aligned.
        </p>
        <div className="hero-actions" style={{ marginTop: 14 }}>
          <a href="/crm" className="button">
            Open CRM workbench
          </a>
          <a href="/reports" className="button-secondary">
            Review report flow
          </a>
        </div>
        <div className="pill-row" style={{ marginTop: 16 }}>
          <span className="pill">Lead to verdict history</span>
          <span className="pill">Client-wide audit trail</span>
          <span className="pill">Filter by system or client</span>
        </div>
      </section>

      <TimelineConsole />
    </main>
  );
}
