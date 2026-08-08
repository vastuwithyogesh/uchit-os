import { SiteHeader } from "@/components/site-header";
import { AdminConsole } from "@/components/admin-console";

export default function AdminPage() {
  return (
    <main className="page-shell">
      <SiteHeader title="Admin Control" subtitle="Templates, roles, and admin utilities" />

      <section className="hero-panel" style={{ marginTop: 22 }}>
        <div className="eyebrow">Local admin surface</div>
        <h1>Manage template lifecycle and inspect the role matrix from one place.</h1>
        <p className="lede">
          This is the first proper admin surface in the local app. It lets you create and pause WhatsApp templates, and it keeps the role permissions visible while we continue wiring the backend.
        </p>
      </section>

      <AdminConsole />
    </main>
  );
}
