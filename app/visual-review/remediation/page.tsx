import { notFound } from "next/navigation";
import { RemediationReportWorkspaceVisualPreview } from "@/components/remediation-report-workspace";

export default function RemediationVisualReviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <main className="remediation-visual-review-page"><RemediationReportWorkspaceVisualPreview /></main>;
}
