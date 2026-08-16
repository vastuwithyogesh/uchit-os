import { notFound } from "next/navigation";
import { ImageUtilityVisualPreview } from "@/components/image-utility-console";

export default function ImageUtilityVisualReviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <main className="image-utility-visual-review"><ImageUtilityVisualPreview /></main>;
}
