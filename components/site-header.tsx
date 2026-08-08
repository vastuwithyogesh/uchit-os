"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { RoleSwitcher } from "@/components/role-switcher";
import { useSession } from "@/components/session-provider";
import { pageAccessRules, canRoleAccess } from "@/lib/access-policy";

export function SiteHeader({ title, subtitle }: { title: string; subtitle: string }) {
  const { activeUser, isLocalDemo } = useSession();
  const pathname = usePathname();

  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark" />
        <div className="brand-copy">
          <div>{title}</div>
          <div className="meta">{subtitle}</div>
        </div>
      </div>
      <nav className="nav" aria-label="Primary">
        {pageAccessRules
          .filter((item) => canRoleAccess(activeUser.role, item.minimumRole))
          .map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={pathname === item.href ? "active" : undefined}
              aria-current={pathname === item.href ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
      </nav>
      <div className="header-session">
        <div className="header-session-copy">
          <div className="pill">Signed in as {activeUser.fullName}</div>
          <div className="pill">{isLocalDemo ? "Workspace role mode" : "Signed-in staff session"}</div>
        </div>
        <RoleSwitcher />
      </div>
    </header>
  );
}
