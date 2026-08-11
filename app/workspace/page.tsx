import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { CaseWorkspace } from "@/components/case-workspace";
import { FounderRouteIntro } from "@/components/founder-route-intro";
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
    return <main className="page-shell"><SiteHeader title="My Workspace" subtitle="See what needs attention and do the next task" /><FounderRouteIntro eyebrow="Next task" title="Do one clear piece of work at a time." description="Your workspace keeps the active case, blocker and next action together. Conflicts preserve your draft and ask you to reload deliberately." primaryAction={{ href: items[0]?.links[0]?.href ?? "/crm", label: items[0] ? "Open next task" : "Open clients" }} secondaryAction={{ href: "/crm", label: "Find a client" }} context="Founder Edition · task queue" status={{ label: items.length ? "Work available" : "Queue clear", tone: items.length ? "attention" : "ready" }} /><CaseWorkspace items={items} /></main>;
  } catch {
    return <main className="page-shell"><SiteHeader title="My Workspace" subtitle="Your client tasks" /><section className="workspace-state" role="alert"><h1>We could not load your tasks</h1><p>Nothing has been changed. Refresh the page to try again. If it still does not load, ask an administrator for help.</p></section></main>;
  }
}
