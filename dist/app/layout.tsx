import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@/app/globals.css";
import { SessionProvider } from "@/components/session-provider";

export const metadata: Metadata = {
  title: "Uchit Vastu Client CRM + Evaluation Engine",
  description: "ScoreApp-style lead intake, commercial approvals, payment gates, workspace control, utility evaluation, Shakti ranking, and report release for the Uchit Vastu flow."
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
