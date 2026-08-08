"use client";

import Link from "next/link";
import { RoleSwitcher } from "@/components/role-switcher";
import { useSession } from "@/components/session-provider";

export function SiteHeader({ title, subtitle }: { title: string; subtitle: string }) {
  const { activeUser } = useSession();

  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark" />
        <div>
          <div>{title}</div>
          <div className="meta">{subtitle}</div>
        </div>
      </div>
      <nav className="nav" aria-label="Primary">
        <Link href="/">Overview</Link>
        <Link href="/crm">CRM workbench</Link>
        <Link href="/timeline">Timeline</Link>
        <Link href="/ops">Ops</Link>
        <Link href="/evaluation">Evaluation</Link>
        <Link href="/assets">Assets</Link>
        <Link href="/reports">Reports</Link>
        <Link href="/models">Models</Link>
        <Link href="/diagnostics">Diagnostics</Link>
        <Link href="/integrity">Integrity</Link>
        <Link href="/state">State</Link>
        <Link href="/admin">Admin</Link>
        <Link href="/bootstrap">Bootstrap</Link>
        <Link href="/settings">Settings</Link>
      </nav>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div className="pill">Signed in as {activeUser.fullName}</div>
        <RoleSwitcher />
      </div>
    </header>
  );
}
