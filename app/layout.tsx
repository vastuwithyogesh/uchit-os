import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import "@/app/globals.css";
import { SessionProvider } from "@/components/session-provider";

async function resolveMetadataBase() {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? "localhost:3003";
  const protocol = headerStore.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return new URL(`${protocol}://${host}`);
}

export async function generateMetadata(): Promise<Metadata> {
  const metadataBase = await resolveMetadataBase();

  return {
    metadataBase,
    title: {
      default: "Uchit Vastu Workspace",
      template: "%s | Uchit Vastu"
    },
    description:
      "A simple, secure workspace for Uchit Vastu cases, evaluations, payments and reports.",
    openGraph: {
      title: "Uchit Vastu Client CRM + Evaluation Engine",
      description:
        "Lead intake, commercial approvals, payment gates, case operations, and verdict release in one controlled operating flow.",
      type: "website",
      url: metadataBase,
      images: [
        {
          url: new URL("/og.png", metadataBase).toString(),
          width: 1536,
          height: 1024,
          alt: "Uchit Vastu Client CRM and Evaluation Engine overview"
        }
      ]
    },
    twitter: {
      card: "summary_large_image",
      title: "Uchit Vastu Client CRM + Evaluation Engine",
      description:
        "Role-aware lead intake, approvals, case operations, report flow, and verdict release in one dashboard.",
      images: [new URL("/og.png", metadataBase).toString()]
    }
  };
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
