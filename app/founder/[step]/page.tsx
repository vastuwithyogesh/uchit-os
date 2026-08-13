import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { FounderFlowPage } from "@/components/founder-flow";
import { SiteHeader } from "@/components/site-header";
import { buildFounderScorecard } from "@/lib/founder-scorecard";
import { requirePageAccess } from "@/lib/page-access";
import { loadStateFromPersistence } from "@/lib/persistence";
import { headers } from "next/headers";
import { isExplicitLocalDemo } from "@/lib/auth";
import { buildLocalFounderWalkthroughState } from "@/lib/founder-walkthrough.server";

export default async function FounderStepPage({ params, searchParams }: { params: Promise<{ step: string }>; searchParams: Promise<{ caseId?: string; floorId?: string; walkthrough?: string }> }) {
  const access = await requirePageAccess("SETTER");
  if (!access.allowed) return <main className="page-shell"><SiteHeader title="Founder workflow" subtitle="Focused module" minimal /><AccessDeniedPanel area="Founder workflow" requiredRole="SETTER" actorRole={access.actor.role} /></main>;
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
    const scorecard = buildFounderScorecard(state, access.actor, undefined, context.caseId, context.floorId);
    return <main className="page-shell"><SiteHeader title="Founder workflow" subtitle="One module at a time" minimal /><FounderFlowPage scorecard={scorecard} stepNumber={stepNumber} walkthrough={walkthrough} /></main>;
  } catch {
    return <main className="page-shell"><SiteHeader title="Founder workflow" subtitle="One module at a time" minimal /><section className="workspace-state" role="alert"><h1>We could not load this step</h1><p>Nothing has changed. Refresh to retry or return to the scorecard.</p><a className="button-secondary" href="/">Back to scorecard</a></section></main>;
  }
}
