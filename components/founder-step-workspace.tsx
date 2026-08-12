import type { FounderScorecard } from "@/lib/founder-scorecard";
import { FounderCaseSetupStep } from "@/components/founder-case-setup-step";
import { ClientIntakeForm } from "@/components/client-intake-form";
import { SpatialWorkspace } from "@/components/spatial-workspace";
import { FilesDrawingsConsole } from "@/components/files-drawings-console";
import { EvaluationConsole } from "@/components/evaluation-console";
import { FounderReportStep } from "@/components/founder-report-step";
import { SiteAnalysisConsole } from "@/components/site-analysis-console";
import { PaymentProofConsole } from "@/components/payment-proof-console";

export function FounderStepWorkspace({ scorecard, stepNumber }: { scorecard: FounderScorecard; stepNumber: number }) {
  const common = { clientId: scorecard.client?.id, caseId: scorecard.caseRecord?.id, floorId: scorecard.selectedFloorId };
  if (stepNumber === 1) return <FounderCaseSetupStep focus="case" {...common} />;
  if (stepNumber === 2) return <FounderCaseSetupStep focus="floor" {...common} />;
  if (stepNumber === 3) return <ClientIntakeForm clientId={common.clientId} />;
  if (stepNumber === 4) return <SpatialWorkspace focus="orientation" {...common} />;
  if (stepNumber === 5) return <SpatialWorkspace focus="plan" {...common} />;
  if (stepNumber === 6) return <SpatialWorkspace focus="gridding" {...common} />;
  if (stepNumber === 7) return <FilesDrawingsConsole focus="manual-sheet" {...common} />;
  if (stepNumber === 8) return <EvaluationConsole {...common} />;
  if (stepNumber === 9) return <FounderReportStep focus="stage-a" {...common} />;
  if (stepNumber === 10) return <SiteAnalysisConsole focus="site" {...common} />;
  if (stepNumber === 11) return <SiteAnalysisConsole focus="post-site" {...common} />;
  if (stepNumber === 12) return <PaymentProofConsole focus="balance" clientId={common.clientId} caseId={common.caseId} />;
  if (stepNumber === 14) return <FounderReportStep focus="assembly" {...common} />;
  if (stepNumber === 15) return <FounderReportStep focus="approval" {...common} />;
  if (stepNumber === 16) return <FounderReportStep focus="pdf" {...common} />;
  return null;
}
