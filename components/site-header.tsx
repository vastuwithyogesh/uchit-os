"use client";

import { usePathname } from "next/navigation";
import { RoleSwitcher } from "@/components/role-switcher";
import { useSession } from "@/components/session-provider";
import { getAccessiblePageRules } from "@/lib/access-policy";

export function SiteHeader({ title, subtitle, minimal = false }: { title: string; subtitle: string; minimal?: boolean }) {
  const { activeUser, isLocalDemo, sessionStatus, sessionError, retrySession } = useSession();
  const pathname = usePathname();
  const visibleNavigation = sessionStatus === "ready" ? getAccessiblePageRules(activeUser.role) : [];
  const primaryHrefs = activeUser.role === "CLIENT"
    ? ["/client"]
    : ["/", "/crm", "/lead-pipeline", "/clients-cases", "/founder/06", "/reports"];
  const primaryNavigation = primaryHrefs
    .map((href) => visibleNavigation.find((item) => item.href === href))
    .filter((item): item is (typeof visibleNavigation)[number] => Boolean(item));
  const moreNavigation = visibleNavigation.filter((item) => !primaryNavigation.includes(item));
  const adminNavigation = moreNavigation.filter((item) => item.minimumRole === "ADMIN" || item.minimumRole === "SUPER_ADMIN");
  const workNavigation = moreNavigation.filter((item) => !adminNavigation.includes(item));
  const activeMoreItem = moreNavigation.find((item) => item.href === pathname);

  return (
    <header className="topbar">
      <div className="brand">
        <a className="brand-lockup" href={activeUser.role === "CLIENT" ? "/client" : "/workspace"} aria-label="Uchit Vastu India home">
          <span className="brand-name">UCHIT</span>
          <span className="brand-descriptor">VASTU INDIA</span>
        </a>
        <div className="brand-context">
          <strong>{title}</strong>
          <span className="meta">{subtitle}</span>
        </div>
      </div>
      {!minimal ? <nav className="nav" aria-label="Main navigation">
        {primaryNavigation.map((item) => (
          <a key={item.href} href={item.href} className={pathname === item.href ? "active" : undefined} aria-current={pathname === item.href ? "page" : undefined}>
            {item.label}
          </a>
        ))}
        {moreNavigation.length ? (
          <details className="nav-more">
            <summary aria-label="Open navigation menu">
              <span className="nav-more-label">Menu</span>
              {activeMoreItem ? <span className="nav-more-current">{activeMoreItem.label}</span> : null}
              <span className="nav-more-chevron" aria-hidden="true" />
            </summary>
            <div className="nav-more-menu" aria-label="All pages">
              {workNavigation.length ? <strong className="nav-more-heading">Work</strong> : null}
              {workNavigation.map((item) => (
                <a key={item.href} href={item.href} className={pathname === item.href ? "active" : undefined} aria-current={pathname === item.href ? "page" : undefined}>
                  {item.label}
                </a>
              ))}
              {adminNavigation.length ? <strong className="nav-more-heading">Administration</strong> : null}
              {adminNavigation.map((item) => (
                <a key={item.href} href={item.href} className={pathname === item.href ? "active" : undefined} aria-current={pathname === item.href ? "page" : undefined}>
                  {item.label}
                </a>
              ))}
            </div>
          </details>
        ) : null}
      </nav> : <span className="header-flow-label">Founder workflow</span>}
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
              {!isLocalDemo ? <a className="header-signout" href="/signout-with-chatgpt?return_to=/">Sign out</a> : null}
            </div>
            <RoleSwitcher />
          </>
        ) : null}
      </div>
    </header>
  );
}
