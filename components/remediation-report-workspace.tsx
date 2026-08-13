"use client";

import { useEffect, useMemo, useState } from "react";
import { SectionARemediationWorkspace } from "@/components/section-a-remediation-workspace";
import { StageBRemedyWorkspace } from "@/components/stage-b-remedy-workspace";
import {
  REMEDIATION_WORKSPACE_PAGES,
  visualWorkspacePage,
  type RemediationWorkspacePageKey,
  type SectionAWorkspacePageType
} from "@/lib/remediation-workspace-view";
import type { StageBRemedyType } from "@/lib/domain";

function sectionForKey(key: RemediationWorkspacePageKey) {
  return key.startsWith("A:") ? "A" : "B";
}

export function RemediationReportWorkspaceVisualPreview() {
  return <RemediationReportWorkspace caseId="visual-case" floorId="visual-floor" visualFixture />;
}

export function RemediationReportWorkspace({ caseId, floorId, visualFixture = false }: { caseId?: string; floorId?: string; visualFixture?: boolean }) {
  const [activeKey, setActiveKey] = useState<RemediationWorkspacePageKey>("A:EXISTING_LAYOUT");

  useEffect(() => {
    if (!visualFixture) return;
    const scenario = new URLSearchParams(window.location.search).get("remediationVisual") ?? "navigation";
    setActiveKey(visualWorkspacePage(scenario));
  }, [visualFixture]);

  const activePage = useMemo(() => REMEDIATION_WORKSPACE_PAGES.find((item) => item.key === activeKey) ?? REMEDIATION_WORKSPACE_PAGES[0], [activeKey]);

  return <section className="remediation-report-workspace" aria-labelledby="remediation-report-workspace-title">
    <header className="remediation-report-heading">
      <div>
        <div className="eyebrow">Remedy &amp; Report Engine · Sections A and B</div>
        <h1 id="remediation-report-workspace-title">Remediation report workspace</h1>
      </div>
      <div className="remediation-report-heading-state"><span>One floor</span><strong>Final Revised Layout</strong></div>
    </header>

    <nav className="remediation-report-nav" aria-label="Remediation report pages">
      {(["A", "B"] as const).map((section) => <div className="remediation-report-nav-group" data-section={section} key={section}>
        <header><span>Section {section}</span><small>{section === "A" ? "Layout, furniture, appliances and colour reference" : "Five fixed remedy pages"}</small></header>
        <div>{REMEDIATION_WORKSPACE_PAGES.filter((item) => item.section === section).map((item) => <button key={item.key} className={item.key === activePage.key ? "is-active" : ""} aria-current={item.key === activePage.key ? "page" : undefined} onClick={() => setActiveKey(item.key)}>
          <span>{item.shortLabel}</span><strong>{item.label}</strong><small>{item.pageType.endsWith("_IMPLEMENTATION") ? "Implementation follows visual page" : `Report order ${item.ordinal}`}</small>
        </button>)}</div>
      </div>)}
    </nav>

    <div className="remediation-report-active-page" data-section={sectionForKey(activePage.key)} data-page={activePage.pageType}>
      {activePage.section === "A"
        ? <SectionARemediationWorkspace caseId={caseId} floorId={floorId} pageType={activePage.pageType as SectionAWorkspacePageType} visualFixture={visualFixture} />
        : <StageBRemedyWorkspace caseId={caseId} floorId={floorId} activePageType={activePage.pageType as StageBRemedyType} onActivePageTypeChange={(pageType) => setActiveKey(`B:${pageType}`)} hideNavigation visualFixture={visualFixture} />}
    </div>
  </section>;
}
