import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { CaseMasterConsole } from "@/components/case-master-console";
import { SiteHeader } from "@/components/site-header";
import { WorkflowConsole } from "@/components/workflow-console";
import { requirePageAccess } from "@/lib/page-access";

export default async function OpsPage() {
  const access = await requirePageAccess("CONSULTANT");
  if (!access.allowed) return <main className="page-shell"><SiteHeader title="Legacy technical console" subtitle="Backward-compatible operations tools" /><AccessDeniedPanel area="Legacy technical console" requiredRole="CONSULTANT" actorRole={access.actor.role} /></main>;
  return <main className="page-shell"><SiteHeader title="Legacy technical console" subtitle="Diagnostics and backward-compatible recovery tools" /><div className="legacy-console-notice" role="note"><strong>Legacy technical console</strong><span>The primary Founder journey now runs through Clients &amp; Cases and the focused scorecard. Use this console only for diagnostics or recovery.</span><a href="/clients-cases">Return to Clients &amp; Cases</a></div><CaseMasterConsole /><WorkflowConsole /></main>;
}
