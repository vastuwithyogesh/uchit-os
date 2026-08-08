import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { SiteHeader } from "@/components/site-header";
import { PaymentProofConsole } from "@/components/payment-proof-console";
import { requirePageAccess } from "@/lib/page-access";

export default async function PaymentProofsPage() {
  const access = await requirePageAccess("SETTER");
  if (!access.allowed) {
    return (
      <main className="page-shell">
        <SiteHeader title="Payment Proofs" subtitle="Advance and balance proof uploads" />
        <AccessDeniedPanel area="Payment proofs" requiredRole="SETTER" actorRole={access.actor.role} />
      </main>
    );
  }

  return (
    <main className="page-shell">
      <SiteHeader title="Payment Proofs" subtitle="Advance and balance proof uploads" />

      <section className="hero-panel" style={{ marginTop: 22 }}>
        <div className="eyebrow">Proof handoff</div>
        <h1>Upload the advance and balance screenshots that drive the commercial gates.</h1>
        <p className="lede">
          This page keeps the payment proof lane visible on its own, so the team can quickly confirm what’s uploaded before opening the case or unlocking the final report.
        </p>
        <div className="pill-row" style={{ marginTop: 16 }}>
          <span className="pill">Advance proof opens the case</span>
          <span className="pill">Balance proof unlocks the final report</span>
          <span className="pill">Images only in v1</span>
        </div>
        <div className="hero-actions" style={{ marginTop: 14 }}>
          <a href="/crm" className="button">
            Open CRM
          </a>
          <a href="/reports" className="button-secondary">
            Open report flow
          </a>
        </div>
      </section>

      <PaymentProofConsole />
    </main>
  );
}
