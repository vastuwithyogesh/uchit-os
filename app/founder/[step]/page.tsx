import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { FounderFlowPage } from "@/components/founder-flow";
import { SiteHeader } from "@/components/site-header";
import { buildFounderScorecard } from "@/lib/founder-scorecard";
import { requireFounderPageAccess } from "@/lib/page-access";
import { loadStateFromPersistence } from "@/lib/persistence";
import { headers } from "next/headers";
import { isExplicitLocalDemo } from "@/lib/auth";
import { buildLocalFounderWalkthroughState } from "@/lib/founder-walkthrough.server";
import { canAccessFounderCase } from "@/lib/founder-case-access";

export default async function FounderStepPage({ params, searchParams }: { params: Promise<{ step: string }>; searchParams: Promise<{ caseId?: string; floorId?: string; walkthrough?: string }> }) {
  const access = await requireFounderPageAccess("SETTER");
  if (!access.allowed) return <main className="page-shell"><SiteHeader title="Founder workflow" subtitle="Focused module" /><AccessDeniedPanel area="Founder workflow" requiredRole="SETTER" actorRole={access.actor.role} /></main>;
  const { step } = await params;
  const stepNumber = Number.parseInt(step, 10);
  try {
    const context = await searchParams;
    // TEST_ONLY is a read-only local review projection. It never changes the
    // workflow service, storage or gate decisions used by normal routes.
    const requestHeaders = await headers();
    const walkthrough = context.walkthrough === "TEST_ONLY" && isExplicitLocalDemo(requestHeaders);
    // This adapter is intentionally impossible to activate on a hosted request.
    const state = walkthrough ? await buildLocalFounderWalkthroughState() : await loadStateFromPersistence();
    if (context.caseId) {
      const candidate = state.vastuCases.find((item) => item.id === context.caseId);
      if (!candidate || !canAccessFounderCase(state, access.actor, candidate)) {
        return <main className="page-shell"><SiteHeader title="Founder workflow" subtitle="Focused module" /><section className="workspace-state" role="alert"><h1>CASE_NOT_ACCESSIBLE</h1><p>The requested case does not exist or is outside your organisation. Nothing was changed.</p><a className="button-secondary" href="/">Back to command center</a></section></main>;
      }
      if (context.floorId) {
        const floor = state.floorWorkspaces.find((item) => item.id === context.floorId);
        if (!floor) return <main className="page-shell"><SiteHeader title="Founder workflow" subtitle="Focused module" /><section className="workspace-state" role="alert"><h1>FLOOR_NOT_ACCESSIBLE</h1><p>The requested floor does not exist or is outside your organisation. Nothing was changed.</p><a className="button-secondary" href={`/founder/${step}?caseId=${encodeURIComponent(context.caseId)}`}>Return to case</a></section></main>;
        if (floor.caseId !== candidate.id) return <main className="page-shell"><SiteHeader title="Founder workflow" subtitle="Focused module" /><section className="workspace-state" role="alert"><h1>FLOOR_CASE_MISMATCH</h1><p>The requested floor does not belong to this case. Nothing was changed.</p><a className="button-secondary" href={`/founder/${step}?caseId=${encodeURIComponent(context.caseId)}`}>Return to case</a></section></main>;
      }
    }
    const scorecard = buildFounderScorecard(state, access.actor, undefined, context.caseId, context.floorId);
    return <main className="page-shell"><SiteHeader title="Founder workflow" subtitle="One governed step at a time" /><FounderFlowPage scorecard={scorecard} stepNumber={stepNumber} walkthrough={walkthrough} /></main>;
  } catch {
    return <main className="page-shell"><SiteHeader title="Founder workflow" subtitle="One governed step at a time" /><section className="workspace-state" role="alert"><h1>We could not load this step</h1><p>Nothing has changed. Refresh to retry or return to the command center.</p><a className="button-secondary" href="/">Back to command center</a></section></main>;
  }
}
