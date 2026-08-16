import { notFound } from "next/navigation";
import { DocumentDeliveryVisualReview } from "@/components/document-delivery-visual-review";

export default async function DeliveryVisualReview({ searchParams }: { searchParams: Promise<{ scenario?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { scenario = "dashboard" } = await searchParams;
  return <DocumentDeliveryVisualReview scenario={scenario} />;
}
