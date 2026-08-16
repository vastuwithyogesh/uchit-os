import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { SiteHeader } from "@/components/site-header";
import { AdminConsole } from "@/components/admin-console";
import { CommercialPolicyEditor } from "@/components/commercial-policy-editor";
import { RepositoryAdminConsole } from "@/components/repository-admin-console";
import { ImageUtilityConsole } from "@/components/image-utility-console";
import { requirePageAccess } from "@/lib/page-access";

export default async function AdminPage() {
  const access = await requirePageAccess("ADMIN");
  if (!access.allowed) {
    return (
      <main className="page-shell">
        <SiteHeader title="Admin Control" subtitle="Templates, roles, and admin utilities" />
        <AccessDeniedPanel area="Admin control" requiredRole="ADMIN" actorRole={access.actor.role} />
      </main>
    );
  }

  return (
    <main className="page-shell">
      <SiteHeader title="Admin Control" subtitle="Templates, roles, and admin utilities" />

      <section className="hero-panel" style={{ marginTop: 22 }}>
        <div className="eyebrow">Admin control</div>
        <h1>Manage templates, staff roles, and admin-only controls from one place.</h1>
        <p className="lede">
          This surface now combines outbound template management with server-side staff role assignments, so the live app can be governed from inside the product instead of through seeded defaults alone.
        </p>
        <div className="hero-actions" style={{ marginTop: 14 }}>
          <a href="/settings" className="button">
            Open workspace settings
          </a>
          <a href="/timeline" className="button-secondary">
            Review client timeline
          </a>
        </div>
        <div className="pill-row" style={{ marginTop: 16 }}>
          <span className="pill">Template governance</span>
          <span className="pill">Staff role assignments</span>
          <span className="pill">Permission visibility</span>
        </div>
      </section>

      <RepositoryAdminConsole />
      <ImageUtilityConsole />
      <AdminConsole />
      <CommercialPolicyEditor />
    </main>
  );
}
