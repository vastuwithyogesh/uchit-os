import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { FounderRouteIntro } from "@/components/founder-route-intro";
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

      <FounderRouteIntro
        eyebrow="Payments"
        title="Clear the next payment gate with proof."
        description="Record advance and balance evidence once, verify it server-side, and let the case/report gates respond to the confirmed state."
        primaryAction={{ href: "/crm", label: "Open CRM" }}
        secondaryAction={{ href: "/reports", label: "Open report flow" }}
        context="Founder Edition · ₹11,000 minimum advance · full balance before release"
        status={{ label: "Payment gate", tone: "attention" }}
      >
        <div className="pill-row route-quiet-pills">
          <span className="pill">Advance opens case</span>
          <span className="pill">Balance unlocks release</span>
          <span className="pill">Protected proof only</span>
        </div>
      </FounderRouteIntro>

      <PaymentProofConsole />
    </main>
  );
}
