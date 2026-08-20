import type { FounderScorecard } from "@/lib/founder-scorecard";
import { FounderCaseSetupStep } from "@/components/founder-case-setup-step";
import { ClientIntakeForm } from "@/components/client-intake-form";
import { SpatialWorkspace } from "@/components/spatial-workspace";
import { FilesDrawingsConsole } from "@/components/files-drawings-console";
import { EvaluationConsole } from "@/components/evaluation-console";
import { DirectionalEvaluationConsoleV1 } from "@/components/directional-evaluation-console-v1";
import { DirectionalReportCardV1 } from "@/components/directional-report-card-v1";
import { FounderReportStep } from "@/components/founder-report-step";
import { SiteAnalysisConsole } from "@/components/site-analysis-console";
import { PaymentProofConsole } from "@/components/payment-proof-console";
import { FounderWalkthroughWorkspace } from "@/components/founder-walkthrough-workspace";
import { RemediationReportWorkspace } from "@/components/remediation-report-workspace";
import { V1SiteElementalWorkspace } from "@/components/v1-site-elemental-workspace";
import { V1FullBalanceClearance } from "@/components/v1-full-balance-clearance";
import { V1RemedyTypeHandoffWorkspace } from "@/components/v1-remedy-type-handoff-workspace";

export function FounderStepWorkspace({ scorecard, stepNumber, walkthrough = false, fastFlow = false }: { scorecard: FounderScorecard; stepNumber: number; walkthrough?: boolean; fastFlow?: boolean }) {
  if (walkthrough) return <FounderWalkthroughWorkspace stepNumber={stepNumber} />;
  const common = { clientId: scorecard.client?.id, caseId: scorecard.caseRecord?.id, floorId: scorecard.selectedFloorId };
  if (stepNumber === 1) return <FounderCaseSetupStep focus="case" {...common} />;
  if (stepNumber === 2) return <FounderCaseSetupStep focus="floor" {...common} />;
  if (stepNumber === 3) return <ClientIntakeForm clientId={common.clientId} caseId={common.caseId} projectId={scorecard.project?.id} />;
  if (stepNumber === 4) return <SpatialWorkspace focus="orientation" {...common} />;
  if (stepNumber === 5) return <SpatialWorkspace focus="plan" {...common} />;
  if (stepNumber === 6) return <SpatialWorkspace focus="gridding" fastFlow={fastFlow} {...common} />;
  if (stepNumber === 7) return <FilesDrawingsConsole focus="manual-sheet" {...common} />;
  if (stepNumber === 8) return scorecard.caseRecord?.evaluationArchitectureVersion === "V1" ? <DirectionalEvaluationConsoleV1 {...common} projectId={scorecard.project?.id} /> : <EvaluationConsole {...common} />;
  if (stepNumber === 9) return scorecard.caseRecord?.evaluationArchitectureVersion === "V1" ? <DirectionalReportCardV1 {...common} projectId={scorecard.project?.id} /> : <FounderReportStep focus="stage-a" {...common} />;
  if (stepNumber === 10) return scorecard.caseRecord?.evaluationArchitectureVersion === "V1" ? <V1SiteElementalWorkspace focus="site" {...common} projectId={scorecard.project?.id} /> : <SiteAnalysisConsole focus="site" {...common} />;
  if (stepNumber === 11) return scorecard.caseRecord?.evaluationArchitectureVersion === "V1" ? <V1SiteElementalWorkspace focus="post-site" {...common} projectId={scorecard.project?.id} /> : <SiteAnalysisConsole focus="post-site" {...common} />;
  if (stepNumber === 12) return scorecard.caseRecord?.evaluationArchitectureVersion === "V1" ? <V1FullBalanceClearance caseId={common.caseId} projectId={scorecard.project?.id} floorId={common.floorId} /> : <PaymentProofConsole focus="balance" clientId={common.clientId} caseId={common.caseId} />;
  // RemediationReportWorkspace composes Section A with the frozen StageBRemedyWorkspace child.
  if (stepNumber === 13) return scorecard.caseRecord?.evaluationArchitectureVersion === "V1"
    ? scorecard.stageBReady ? <RemediationReportWorkspace caseId={common.caseId} floorId={common.floorId} /> : <V1RemedyTypeHandoffWorkspace caseId={common.caseId} projectId={scorecard.project?.id} floorId={common.floorId} />
    : <RemediationReportWorkspace caseId={common.caseId} floorId={common.floorId} />;
  if (stepNumber === 14) return <FounderReportStep focus="assembly" {...common} />;
  if (stepNumber === 15) return <FounderReportStep focus="approval" {...common} />;
  if (stepNumber === 16) return <FounderReportStep focus="pdf" {...common} />;
  return null;
}
