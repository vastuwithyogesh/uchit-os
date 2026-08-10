"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { RoleSwitcher } from "@/components/role-switcher";
import { useSession } from "@/components/session-provider";
import { getAccessiblePageRules } from "@/lib/access-policy";

export function SiteHeader({ title, subtitle }: { title: string; subtitle: string }) {
  const { activeUser, isLocalDemo, sessionStatus, sessionError, retrySession } = useSession();
  const pathname = usePathname();
  const visibleNavigation = sessionStatus === "ready" ? getAccessiblePageRules(activeUser.role) : [];

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
        {visibleNavigation.map((item) => (
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
        {sessionStatus === "loading" ? <div className="pill" role="status">Verifying session…</div> : null}
        {sessionStatus === "error" ? (
          <div className="session-error" role="alert">
            <span>Access is paused because your session could not be verified. {sessionError}</span>
            <button type="button" className="button-secondary" onClick={retrySession}>Try again</button>
          </div>
        ) : null}
        {sessionStatus === "ready" ? (
          <>
            <div className="header-session-copy">
              <div className="pill">Signed in as {activeUser.fullName}</div>
              <div className="pill">{isLocalDemo ? "Local demo role mode" : "Verified staff session"}</div>
            </div>
            <RoleSwitcher />
          </>
        ) : null}
      </div>
    </header>
  );
}
