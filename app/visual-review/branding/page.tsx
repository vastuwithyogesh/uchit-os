import { notFound } from "next/navigation";
import { BrandDocumentTemplatesConsole } from "@/components/brand-document-templates-console";
import { requirePageAccess } from "@/lib/page-access";

export default async function BrandingVisualReview({ searchParams }: { searchParams: Promise<{ scenario?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const access = await requirePageAccess("ADMIN"); if (!access.allowed) notFound();
  const { scenario = "navigation" } = await searchParams;
  return <main className="branding-visual-review"><BrandDocumentTemplatesConsole visualScenario={scenario} /></main>;
}
