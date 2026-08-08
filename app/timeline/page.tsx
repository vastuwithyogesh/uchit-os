import Link from "next/link";
import { clients, timelineEvents } from "@/lib/seed";
import { buildPermanentTimeline } from "@/lib/workflows";
import { formatTimeStamp } from "@/lib/format";

export default function TimelinePage() {
  const orderedEvents = buildPermanentTimeline(timelineEvents);

  return (
    <main className="page-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" />
          <div>
            <div>Permanent Timeline</div>
            <div className="meta">Every event tied back to the client</div>
          </div>
        </div>
        <nav className="nav" aria-label="Primary">
          <Link href="/">Overview</Link>
          <Link href="/crm">CRM workbench</Link>
          <Link href="/timeline">Timeline</Link>
        </nav>
      </header>

      <section className="hero-panel" style={{ marginTop: 22 }}>
        <div className="eyebrow">Client history</div>
        <h1>One permanent timeline for every lead, payment, workspace edit, report version, and verdict release.</h1>
        <p className="lede">
          The timeline intentionally aggregates the entire client journey so the team can audit what happened, when it happened, and who touched it. This keeps the CRM, case flow, and report trail aligned.
        </p>
      </section>

      <section className="section-grid">
        <div className="card span-12">
          <div className="timeline">
            {orderedEvents.map((event) => (
              <article key={event.id} className="timeline-item">
                <header>
                  <div>
                    <strong>{event.headline}</strong>
                    <div className="meta">
                      {clients.find((client) => client.id === event.clientId)?.displayName ?? event.clientId} · {formatTimeStamp(event.happenedAt)}
                    </div>
                  </div>
                  <span className="tag neutral">{event.category}</span>
                </header>
                <p className="subtle">{event.details}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
