import type { Metadata } from "next";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Uchit Vastu Client CRM + Evaluation Engine",
  description: "ScoreApp-style lead intake, commercial approvals, payment gates, workspace control, utility evaluation, Shakti ranking, and report release for the Uchit Vastu flow."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
