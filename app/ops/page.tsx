import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { CaseMasterConsole } from "@/components/case-master-console";
import { FounderRouteIntro } from "@/components/founder-route-intro";
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

      <FounderRouteIntro
        eyebrow="Case setup"
        title="Prepare the active case before evaluation starts."
        description="Confirm the commercial gate, project and floor context, then move only the current case revision forward. Every change remains auditable."
        primaryAction={{ href: "/workspace", label: "Open my workspace" }}
        secondaryAction={{ href: "/files", label: "Review evidence" }}
        context="Founder Edition · active case and floor context"
        status={{ label: "Case setup", tone: "ready" }}
      />

      <CaseMasterConsole />
      <WorkflowConsole />
    </main>
  );
}
