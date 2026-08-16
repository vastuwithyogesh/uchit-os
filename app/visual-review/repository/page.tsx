import { notFound } from "next/navigation";
import { RepositoryAdminVisualPreview } from "@/components/repository-admin-console";

export default function RepositoryVisualReviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <main className="page-shell repository-visual-review"><RepositoryAdminVisualPreview /></main>;
}
