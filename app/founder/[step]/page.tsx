import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { FounderFlowPage } from "@/components/founder-flow";
import { SiteHeader } from "@/components/site-header";
import { buildFounderScorecard } from "@/lib/founder-scorecard";
import { requirePageAccess } from "@/lib/page-access";
import { loadStateFromPersistence } from "@/lib/persistence";

export default async function FounderStepPage({ params, searchParams }: { params: Promise<{ step: string }>; searchParams: Promise<{ caseId?: string; floorId?: string; walkthrough?: string }> }) {
  const access = await requirePageAccess("SETTER");
  if (!access.allowed) return <main className="page-shell"><SiteHeader title="Founder workflow" subtitle="Focused module" minimal /><AccessDeniedPanel area="Founder workflow" requiredRole="SETTER" actorRole={access.actor.role} /></main>;
  const { step } = await params;
  const stepNumber = Number.parseInt(step, 10);
  try {
    const context = await searchParams;
    // TEST_ONLY is a read-only local review projection. It never changes the
    // workflow service, storage or gate decisions used by normal routes.
    // @ts-expect-error JavaScript fixture is also consumed by Node contract tests.
    const fixture = context.walkthrough === "TEST_ONLY" ? await import("@/tests/fixtures/founder-pilot-fixture.mjs") : undefined;
    const state = fixture ? fixture.buildReleaseableFounderPilotFixture().state : await loadStateFromPersistence();
    if (fixture) {
      const profile = state.clientIntakeProfiles[0];
      if (profile) {
        profile.contactPreference = { whatsapp: "+910000000001", preferredLanguage: "English" };
        profile.decisionMakerStatus = "SOLE";
        profile.propertyContext = { ...profile.propertyContext, propertyType: "Residential", floorCount: 1, locationLink: "https://maps.example.test/test-only", latitude: 28.6139, longitude: 77.209 };
      }
      const floor = state.floorWorkspaces[0];
      if (floor) floor.stageAVerdictStatus = "PRESENTED";
    }
    const scorecard = buildFounderScorecard(state, access.actor, undefined, context.caseId, context.floorId);
    return <main className="page-shell"><SiteHeader title="Founder workflow" subtitle="One module at a time" minimal /><FounderFlowPage scorecard={scorecard} stepNumber={stepNumber} /></main>;
  } catch {
    return <main className="page-shell"><SiteHeader title="Founder workflow" subtitle="One module at a time" minimal /><section className="workspace-state" role="alert"><h1>We could not load this step</h1><p>Nothing has changed. Refresh to retry or return to the scorecard.</p><a className="button-secondary" href="/">Back to scorecard</a></section></main>;
  }
}
