"use client";

import { useEffect } from "react";

export function FounderProgressAutoScroll() {
  useEffect(() => {
    const active = document.querySelector<HTMLElement>('[data-current-stage="true"]');
    active?.scrollIntoView({ block: "nearest", inline: "center" });
  }, []);

  return null;
}
