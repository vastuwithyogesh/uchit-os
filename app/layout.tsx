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
      default: "Uchit Vastu India Workspace",
      template: "%s | Uchit Vastu India"
    },
    description:
      "A simple, secure workspace for Uchit Vastu India cases, evaluations, payments and reports.",
    openGraph: {
      title: "Uchit Vastu India Workspace",
      description:
        "Clear, structured and confidential case work from first review to final report.",
      type: "website",
      url: metadataBase
    },
    twitter: {
      card: "summary",
      title: "Uchit Vastu India Workspace",
      description:
        "Clear, structured and confidential case work from first review to final report."
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
