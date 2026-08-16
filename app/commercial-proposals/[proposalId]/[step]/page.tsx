import { AccessDeniedPanel } from "@/components/access-denied-panel";
import { FounderCommercialProposalEditor } from "@/components/founder-commercial-proposal-editor";
import { FounderStatutoryReadinessCard } from "@/components/founder-statutory-readiness-card";
import { SiteHeader } from "@/components/site-header";
import { getFounderProposalBlockers } from "@/lib/founder-commercial";
import { projectStatutoryReadiness } from "@/lib/founder-statutory-documents";
import { requireFounderCommercialPageAccess } from "@/lib/page-access";
import { loadStateSnapshotFromPersistence } from "@/lib/persistence";

export default async function FounderCommercialProposalStepPage({ params }: { params: Promise<{ proposalId: string; step: string }> }) {
  const access = await requireFounderCommercialPageAccess();
  if (!access.allowed) return <main className="page-shell"><SiteHeader title="Commercial proposal" subtitle="Founder-only" minimal /><AccessDeniedPanel area="Commercial proposal" requiredRole="SUPER_ADMIN" actorRole={access.actor.role} /></main>;
  const { proposalId, step } = await params; const snapshot = await loadStateSnapshotFromPersistence(); const proposal = snapshot.state.founderProposalVersions.find((item) => item.id === proposalId && (!item.organisationId || item.organisationId === access.actor.organisationId));
  if (!proposal) return <main className="page-shell"><SiteHeader title="Commercial proposal" subtitle="Version unavailable" minimal /><section className="workspace-state" role="alert"><h1>Proposal unavailable</h1><p>The version does not exist in this organisation or is no longer accessible.</p><a className="button-secondary" href="/commercial-proposals">Back to proposals</a></section></main>;
  const readiness = Number(step) === 6 ? projectStatutoryReadiness(snapshot.state, proposal.id) : undefined;
  const activeNoRefundPolicy = snapshot.state.founderCommercialLegalPolicies.find((item) => item.organisationId === access.actor.organisationId && item.kind === "CANCELLATION_REFUND_DELAY" && item.status === "ACTIVE");
  return <main className="page-shell"><SiteHeader title="Commercial proposal" subtitle="One section at a time" minimal /><FounderCommercialProposalEditor proposal={proposal} step={Number(step)} revision={snapshot.revision ?? 0} blockers={getFounderProposalBlockers(snapshot.state, proposal)} hasArtifact={snapshot.state.founderProposalArtifacts.some((item) => item.proposalVersionId === proposal.id)} activeNoRefundPolicy={activeNoRefundPolicy ? { title: activeNoRefundPolicy.title, version: activeNoRefundPolicy.version, exactText: activeNoRefundPolicy.exactText } : undefined} />{readiness ? <FounderStatutoryReadinessCard status={readiness.status} blockers={readiness.blockers} documents={readiness.documents} revision={snapshot.revision ?? 0} /> : null}</main>;
}
