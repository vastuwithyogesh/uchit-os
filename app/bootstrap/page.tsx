import { SiteHeader } from "@/components/site-header";
import { BootstrapConsole } from "@/components/bootstrap-console";

export default function BootstrapPage() {
  return (
    <main className="page-shell">
      <SiteHeader title="Bootstrap Control Room" subtitle="Local persistence sync" />

      <section className="hero-panel" style={{ marginTop: 22 }}>
        <div className="eyebrow">Local-first setup</div>
        <h1>Seed the database from the demo state, then reload the live snapshot.</h1>
        <p className="lede">
          We use this page whenever we want the local app, Prisma tables, and seeded workflow data to line up before testing the CRM and evaluation engine.
        </p>
      </section>

      <BootstrapConsole />
    </main>
  );
}
