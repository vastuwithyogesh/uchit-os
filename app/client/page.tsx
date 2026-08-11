import { SiteHeader } from "@/components/site-header";

export default async function ClientPage() {
  return <main className="page-shell"><SiteHeader title="Uchit Vastu" subtitle="Founder Edition" />
    <section className="hero-panel access-panel" style={{ marginTop: 22 }}>
      <div className="eyebrow">Delivery intentionally disabled</div>
      <h1>The client portal is reserved for a later edition.</h1>
      <p className="lede">Founder Edition keeps all client delivery routes closed while the methodology, evidence, payment and report controls are validated.</p>
      <div className="hero-actions"><a href="/" className="button">Return to Founder workspace</a></div>
    </section>
  </main>;
}
