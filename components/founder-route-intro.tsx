import type { ReactNode } from "react";

type RouteAction = {
  href: string;
  label: string;
};

type FounderRouteIntroProps = {
  eyebrow: string;
  title: string;
  description: string;
  primaryAction?: RouteAction;
  secondaryAction?: RouteAction;
  context?: string;
  status?: { label: string; tone: "neutral" | "attention" | "blocked" | "ready" | "approved" | "released" };
  children?: ReactNode;
};

export function FounderRouteIntro({
  eyebrow,
  title,
  description,
  primaryAction,
  secondaryAction,
  context,
  status,
  children
}: FounderRouteIntroProps) {
  return (
    <section className="route-intro" aria-labelledby="route-intro-title">
      <div className="route-intro-copy">
        <div className="eyebrow">{eyebrow}</div>
        <h1 id="route-intro-title">{title}</h1>
        <p className="lede">{description}</p>
        {context ? <p className="context-line"><span className="context-line-label">Current context</span>{context}</p> : null}
        {children}
      </div>
      {(primaryAction || secondaryAction || status) ? (
        <div className="route-intro-side">
          {status ? <span className={`status-${status.tone}`}>{status.label}</span> : null}
          {primaryAction || secondaryAction ? (
            <div className="route-intro-actions">
              {primaryAction ? <a className="button" href={primaryAction.href}>{primaryAction.label}</a> : null}
              {secondaryAction ? <a className="button-secondary" href={secondaryAction.href}>{secondaryAction.label}</a> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
