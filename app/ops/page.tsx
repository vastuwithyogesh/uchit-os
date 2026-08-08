import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { CaseMasterConsole } from "@/components/case-master-console";
import { SiteHeader } from "@/components/site-header";
import { WorkflowConsole } from "@/components/workflow-console";
import { requirePageAccess } from "@/lib/page-access";

export default async function OpsPage() {
  const access = await requirePageAccess("CONSULTANT");
  if (!access.allowed) {
    return (
      <main className="page-shell">
        <SiteHeader title="Workflow Console" subtitle="Case operations and release controls" />
        <AccessDeniedPanel area="Workflow console" requiredRole="CONSULTANT" actorRole={access.actor.role} />
      </main>
    );
  }

  return (
    <main className="page-shell">
      <SiteHeader title="Workflow Console" subtitle="Case operations and release controls" />

      <section className="hero-panel" style={{ marginTop: 22 }}>
        <div className="eyebrow">Operations spine</div>
        <h1>Run approvals, case creation, preview generation, and verdict release from one controlled surface.</h1>
        <p className="lede">
          This page brings together the main working systems for consultants and admins so the case journey can be managed end to end with one shared audit trail.
        </p>
      </section>

      <CaseMasterConsole />
      <WorkflowConsole />
    </main>
  );
}
