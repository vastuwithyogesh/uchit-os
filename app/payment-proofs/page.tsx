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
        <SiteHeader title="Payment evidence" subtitle="Protected proof and confirmation status" />
        <AccessDeniedPanel area="Payment proofs" requiredRole="SETTER" actorRole={access.actor.role} />
      </main>
    );
  }

  return (
    <main className="page-shell">
      <SiteHeader title="Payment evidence" subtitle="Protected proof and confirmation status" />

      <FounderRouteIntro
        eyebrow="Payments"
        title="Clear the next payment gate with proof."
        description="Record advance and balance evidence once, verify it server-side, and let the case/report gates respond to the confirmed state."
        primaryAction={{ href: "/founder/continue", label: "Select a case and continue" }}
        secondaryAction={{ href: "/clients-cases", label: "Open Clients & Cases" }}
        context="Founder Edition · ₹11,000 suggested standard advance · full balance before release"
        status={{ label: "Payment gate", tone: "attention" }}
      >
        <div className="pill-row route-quiet-pills">
          <span className="pill">Confirmed advance or approved complimentary exception opens case</span>
          <span className="pill">Balance unlocks release</span>
          <span className="pill">Protected proof only</span>
        </div>
      </FounderRouteIntro>

      <details className="route-secondary-links legacy-console-disclosure">
        <summary>Open advanced receipt uploader</summary>
        <PaymentProofConsole />
      </details>
    </main>
  );
}
