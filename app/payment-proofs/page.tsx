import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { SiteHeader } from "@/components/site-header";
import { PaymentProofConsole } from "@/components/payment-proof-console";
import { requirePageAccess } from "@/lib/page-access";

export default async function PaymentProofsPage() {
  const access = await requirePageAccess("SETTER");
  if (!access.allowed) {
    return (
      <main className="page-shell">
        <SiteHeader title="Payment Receipts" subtitle="Upload advance and balance receipts" />
        <AccessDeniedPanel area="Payment proofs" requiredRole="SETTER" actorRole={access.actor.role} />
      </main>
    );
  }

  return (
    <main className="page-shell">
      <SiteHeader title="Payment Receipts" subtitle="Upload advance and balance receipts" />

      <section className="hero-panel" style={{ marginTop: 22 }}>
        <div className="eyebrow">Two simple steps</div>
        <h1>Upload each payment receipt when the client pays.</h1>
        <p className="lede">
          Use the advance receipt to open the case. Use the balance receipt to move the final report forward.
        </p>
        <div className="pill-row" style={{ marginTop: 16 }}>
          <span className="pill">Advance proof opens the case</span>
          <span className="pill">Balance proof unlocks the final report</span>
          <span className="pill">PNG, JPG, WebP, or PDF</span>
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
