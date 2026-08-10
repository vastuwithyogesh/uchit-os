import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { AssessmentActionPlan } from "@/components/assessment-action-plan";
import { SiteHeader } from "@/components/site-header";
import { requirePageAccess } from "@/lib/page-access";

export default async function AssessmentPage() {
  const access = await requirePageAccess("CONSULTANT");
  if (!access.allowed) return <main className="page-shell"><SiteHeader title="Assessment" subtitle="Observations and action plan" /><AccessDeniedPanel area="Assessment and action plan" requiredRole="CONSULTANT" actorRole={access.actor.role} /></main>;
  return <main className="page-shell"><SiteHeader title="Assessment" subtitle="Observe, recommend, assign, and track" /><AssessmentActionPlan /></main>;
}
