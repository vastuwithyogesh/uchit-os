import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { CaseWorkspace } from "@/components/case-workspace";
import { SiteHeader } from "@/components/site-header";
import { buildCaseWorkspaceProjection } from "@/lib/case-workspace";
import { requirePageAccess } from "@/lib/page-access";
import { loadStateFromPersistence } from "@/lib/persistence";

export default async function WorkspacePage() {
  const access = await requirePageAccess("SETTER");
  if (!access.allowed) {
    return <main className="page-shell"><SiteHeader title="Case Workspace" subtitle="Your team queue" /><AccessDeniedPanel area="Case workspace" requiredRole="SETTER" actorRole={access.actor.role} /></main>;
  }

  try {
    const state = await loadStateFromPersistence();
    const items = buildCaseWorkspaceProjection(state, access.actor);
    return <main className="page-shell"><SiteHeader title="Case Workspace" subtitle="What to do now and what happens next" /><CaseWorkspace items={items} /></main>;
  } catch {
    return <main className="page-shell"><SiteHeader title="Case Workspace" subtitle="Your team queue" /><section className="workspace-state" role="alert"><h1>We could not load the workspace</h1><p>Your data has not been changed. Refresh the page to try again.</p></section></main>;
  }
}
