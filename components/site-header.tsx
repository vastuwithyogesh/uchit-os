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
  const primaryNavigation = visibleNavigation.filter((item) =>
    activeUser.role === "CLIENT" ? item.href === "/client" : item.href === "/workspace"
  );
  const moreNavigation = visibleNavigation.filter((item) => !primaryNavigation.includes(item));
  const activeMoreItem = moreNavigation.find((item) => item.href === pathname);

  return (
    <header className="topbar">
      <div className="brand">
        <Link prefetch={false} className="brand-lockup" href={activeUser.role === "CLIENT" ? "/client" : "/workspace"} aria-label="Uchit Vastu India home">
          <span className="brand-name">UCHIT</span>
          <span className="brand-descriptor">VASTU INDIA</span>
        </Link>
        <div className="brand-context">
          <strong>{title}</strong>
          <span className="meta">{subtitle}</span>
        </div>
      </div>
      <nav className="nav" aria-label="Main navigation">
        {primaryNavigation.map((item) => (
          <Link prefetch={false} key={item.href} href={item.href} className={pathname === item.href ? "active" : undefined} aria-current={pathname === item.href ? "page" : undefined}>
            {item.label}
          </Link>
        ))}
        {moreNavigation.length ? (
          <details className="nav-more">
            <summary aria-label="Open navigation menu">
              <span className="nav-more-label">Menu</span>
              {activeMoreItem ? <span className="nav-more-current">{activeMoreItem.label}</span> : null}
              <span className="nav-more-chevron" aria-hidden="true" />
            </summary>
            <div className="nav-more-menu" aria-label="All pages">
              <strong className="nav-more-heading">Go to</strong>
              {moreNavigation.map((item) => (
                <Link prefetch={false} key={item.href} href={item.href} className={pathname === item.href ? "active" : undefined} aria-current={pathname === item.href ? "page" : undefined}>
                  {item.label}
                </Link>
              ))}
            </div>
          </details>
        ) : null}
      </nav>
      <div className="header-session">
        {sessionStatus === "loading" ? <div className="pill" role="status">Signing you in...</div> : null}
        {sessionStatus === "error" ? (
          <div className="session-error" role="alert">
            <span>We could not sign you in. {sessionError}</span>
            <button type="button" className="button-secondary" onClick={retrySession}>Try again</button>
          </div>
        ) : null}
        {sessionStatus === "ready" ? (
          <>
            <div className="header-session-copy">
              <div className="signed-in-name" title={activeUser.role}>Hi, {activeUser.fullName}</div>
              {isLocalDemo ? <div className="pill">Demo mode</div> : null}
            </div>
            <RoleSwitcher />
          </>
        ) : null}
      </div>
    </header>
  );
}
