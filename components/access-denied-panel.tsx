import Link from "next/link";
import type { UserRole } from "@/lib/domain";

export function AccessDeniedPanel({
  area,
  requiredRole,
  actorRole
}: {
  area: string;
  requiredRole: UserRole;
  actorRole: UserRole;
}) {
  return (
    <section className="hero-panel access-panel" style={{ marginTop: 22 }}>
      <div className="eyebrow">Access restricted</div>
      <h1>{area} is not available for this account.</h1>
      <p className="lede">
        Your current role is {actorRole}. This screen has a specific access rule for {requiredRole} accounts, so its protected data has not been opened.
      </p>
      <div className="pill-row" style={{ marginTop: 16 }}>
        <span className="pill">Current role {actorRole}</span>
        <span className="pill">Required role {requiredRole}</span>
        <span className="pill">Protected operational view</span>
      </div>
      <div className="panel access-panel-card" style={{ marginTop: 18 }}>
        <strong>What you can do next</strong>
        <div className="meta" style={{ marginTop: 8 }}>
          Return to the overview, continue working in the CRM, or switch roles in local workspace mode if you are testing access before publish.
        </div>
      </div>
      <div className="hero-actions">
        <Link prefetch={false} href="/" className="button">
          Return to overview
        </Link>
        <Link prefetch={false} href="/crm" className="button-secondary">
          Open CRM workbench
        </Link>
      </div>
    </section>
  );
}
