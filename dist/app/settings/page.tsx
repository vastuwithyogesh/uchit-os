import { SiteHeader } from "@/components/site-header";
import { SettingsConsole } from "@/components/settings-console";

export default function SettingsPage() {
  return (
    <main className="page-shell">
      <SiteHeader title="Settings" subtitle="Database and Supabase connection info" />

      <section className="hero-panel" style={{ marginTop: 22 }}>
        <div className="eyebrow">Local configuration</div>
        <h1>Store your database and Supabase connection details locally for this workspace.</h1>
        <p className="lede">
          This page lets you fill in the connection profile, check which values are present, and copy a ready-to-use env block for later.
        </p>
      </section>

      <SettingsConsole />
    </main>
  );
}
