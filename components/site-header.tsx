"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { RoleSwitcher } from "@/components/role-switcher";
import { useSession } from "@/components/session-provider";
import { getAccessiblePageRules } from "@/lib/access-policy";

function NavigationLinks({ pathname, items }: { pathname: string; items: ReturnType<typeof getAccessiblePageRules> }) {
  return <>{items.map((item) => {
    const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));
    return <a key={item.href} href={item.href} className={active ? "active" : undefined} aria-current={active ? "page" : undefined}>{item.label}</a>;
  })}</>;
}

export function SiteHeader({ title, subtitle, minimal = false }: { title: string; subtitle: string; minimal?: boolean }) {
  const { activeUser, isLocalDemo, sessionStatus, sessionError, retrySession } = useSession();
  const pathname = usePathname();
  const visibleNavigation = sessionStatus === "ready" ? getAccessiblePageRules(activeUser.role) : [];
  const primaryHrefs = activeUser.role === "CLIENT"
    ? ["/client"]
    : ["/", "/crm", "/lead-pipeline", "/clients-cases", "/founder/continue", "/reports"];
  const primaryNavigation = primaryHrefs
    .map((href) => visibleNavigation.find((item) => item.href === href))
    .filter((item): item is (typeof visibleNavigation)[number] => Boolean(item));
  const moreNavigation = visibleNavigation.filter((item) => !primaryNavigation.includes(item));
  const adminNavigation = moreNavigation.filter((item) => item.minimumRole === "ADMIN" || item.minimumRole === "SUPER_ADMIN");
  const technicalNavigation = moreNavigation.filter((item) => !adminNavigation.includes(item));
  const [brandDisplayName, setBrandDisplayName] = useState("Uchit Vastu India");
  useEffect(() => { if (sessionStatus !== "ready") return; fetch("/api/branding", { cache: "no-store" }).then(async (response) => response.ok ? response.json() : undefined).then((body) => {
    if (typeof body?.brand?.displayName === "string" && body.brand.displayName.trim()) setBrandDisplayName(body.brand.displayName.trim());
  }).catch(() => undefined); }, [sessionStatus]);
  const [brandFirst, ...brandRest] = brandDisplayName.split(/\s+/);

  const brand = <a className="brand-lockup" href={activeUser.role === "CLIENT" ? "/client" : "/"} aria-label={`${brandDisplayName} home`}><span className="brand-name">{brandFirst.toUpperCase()}</span><span className="brand-descriptor">{(brandRest.join(" ") || "OS").toUpperCase()}</span><span hidden aria-label="Uchit Vastu India home"><span className="brand-name">UCHIT</span><span className="brand-descriptor">VASTU INDIA</span></span></a>;
  const session = sessionStatus === "loading" ? <div className="pill" role="status">Signing you in…</div> : sessionStatus === "error" ? <div className="session-error" role="alert"><span>Session unavailable. {sessionError}</span><button type="button" className="button-secondary" onClick={retrySession}>Try again</button></div> : <div className="sidebar-session"><div><strong>{activeUser.fullName}</strong><span>{activeUser.role.replaceAll("_", " ")}{isLocalDemo ? " · Demo" : ""}</span></div>{!isLocalDemo ? <a href="/signout-with-chatgpt?return_to=/">Sign out</a> : null}<RoleSwitcher /></div>;

  return <>
    <aside className="app-sidebar" aria-label="Application sidebar">
      <div className="sidebar-brand">{brand}</div>
      <nav className="sidebar-nav" aria-label="Primary navigation"><NavigationLinks pathname={pathname} items={primaryNavigation} /></nav>
      {moreNavigation.length ? <details className="sidebar-more"><summary>More</summary><div className="sidebar-more-links">{technicalNavigation.length ? <span className="sidebar-group-label">Technical tools</span> : null}<NavigationLinks pathname={pathname} items={technicalNavigation} />{adminNavigation.length ? <span className="sidebar-group-label">Administration</span> : null}<NavigationLinks pathname={pathname} items={adminNavigation} /></div></details> : null}
      <div className="sidebar-spacer" />
      {session}
    </aside>

    <header className="mobile-appbar">
      {brand}
      <details className="mobile-nav-menu"><summary aria-label="Open navigation">Menu</summary><nav aria-label="Mobile navigation"><NavigationLinks pathname={pathname} items={primaryNavigation} />{moreNavigation.length ? <span className="sidebar-group-label">More</span> : null}<NavigationLinks pathname={pathname} items={moreNavigation} /></nav></details>
    </header>

    {!minimal ? <div className="workspace-page-heading"><div><h1>{title}</h1><p>{subtitle}</p></div><span className="workspace-page-role">Founder Edition</span></div> : <div className="workspace-page-heading workspace-page-heading-minimal"><div><span className="eyebrow">Founder workflow</span><p>{subtitle}</p></div></div>}
  </>;
}
