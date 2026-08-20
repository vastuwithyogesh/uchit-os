"use client";

import type { MouseEvent } from "react";

export function FounderReviewStepLink({ href, label }: { href: string; label: string }) {
  function review(event: MouseEvent<HTMLAnchorElement>) {
    const target = document.getElementById("founder-step-workspace");
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    target.focus({ preventScroll: true });
    window.history.replaceState(null, "", href);
  }

  return <a className="button founder-flow-primary" href={href} onClick={review}>{label}</a>;
}
