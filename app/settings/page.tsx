import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { SiteHeader } from "@/components/site-header";
import { SettingsConsole } from "@/components/settings-console";
import { requirePageAccess } from "@/lib/page-access";

export default async function SettingsPage() {
  const access = await requirePageAccess("ADMIN");
  if (!access.allowed) {
    return (
      <main className="page-shell">
        <SiteHeader title="Settings" subtitle="Runtime profile and integration readiness" />
        <AccessDeniedPanel area="Settings" requiredRole="ADMIN" actorRole={access.actor.role} />
      </main>
    );
  }

  return (
    <main className="page-shell">
      <SiteHeader title="Settings" subtitle="Runtime profile and integration readiness" />

      <section className="hero-panel" style={{ marginTop: 22 }}>
        <div className="eyebrow">Workspace configuration</div>
        <h1>Manage the saved connection profile and confirm exactly what the app can use at runtime.</h1>
        <p className="lede">
          This page lets you maintain workspace settings, check D1 and R2 readiness, confirm staff-role mappings, and copy an env block when needed for environment setup.
        </p>
        <div className="hero-actions" style={{ marginTop: 14 }}>
          <a href="/diagnostics" className="button">
            Open diagnostics
          </a>
          <a href="/admin" className="button-secondary">
            Review admin controls
          </a>
        </div>
        <div className="pill-row" style={{ marginTop: 16 }}>
          <span className="pill">Connection profile</span>
          <span className="pill">D1 and R2 readiness</span>
          <span className="pill">Copyable env block</span>
        </div>
      </section>

      <SettingsConsole />
    </main>
  );
}
