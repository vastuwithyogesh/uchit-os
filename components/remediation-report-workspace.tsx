"use client";

import { useEffect, useMemo, useState } from "react";
import { SectionARemediationWorkspace } from "@/components/section-a-remediation-workspace";
import { SectionCExtrasWorkspace } from "@/components/section-c-extras-workspace";
import { StageBRemedyWorkspace } from "@/components/stage-b-remedy-workspace";
import {
  REMEDIATION_WORKSPACE_PAGES, sectionCWorkspacePages, visualSectionCWorkspaceKey, visualWorkspacePage,
  type AnyRemediationWorkspacePageKey, type SectionAWorkspacePageType
} from "@/lib/remediation-workspace-view";
import type { SectionCExtraPageRecord, StageBRemedyType } from "@/lib/domain";
import type { AppState } from "@/lib/store";

function sectionForKey(key: AnyRemediationWorkspacePageKey) { return key.startsWith("A:") ? "A" : key.startsWith("B:") ? "B" : "C"; }

function visualExtraPages(scenario = "navigation"): SectionCExtraPageRecord[] {
  if (scenario === "extras-empty" || scenario === "extra-add") return [];
  const owned = { organisationId: "visual-org", createdByActorUserId: "visual-founder", updatedByActorUserId: "visual-founder", recordVersion: 2 };
  return ["Entrance Enhancements", "Devotional Objects", "Seasonal References"].map((title, orderIndex) => ({ ...owned, id: `visual-extra-page-${orderIndex + 1}`, workspaceId: "visual-section-c",
    remediationId: "visual-remediation", reportId: "visual-report", caseId: "visual-case", floorId: "visual-floor", pageId: `visual-extra-placement-page-${orderIndex + 1}`,
    title, orderIndex, status: "ACTIVE", createdAt: "2026-08-13T09:00:00.000Z", creationIdempotencyKey: `visual-extra-${orderIndex}`, creationRequestHash: `visual-extra-hash-${orderIndex}` }));
}

export function RemediationReportWorkspaceVisualPreview() { return <RemediationReportWorkspace caseId="visual-case" floorId="visual-floor" visualFixture />; }

export function RemediationReportWorkspace({ caseId, floorId, visualFixture = false }: { caseId?: string; floorId?: string; visualFixture?: boolean }) {
  const [activeKey, setActiveKey] = useState<AnyRemediationWorkspacePageKey>("A:EXISTING_LAYOUT");
  const [extraPages, setExtraPages] = useState<SectionCExtraPageRecord[]>(() => visualFixture ? visualExtraPages() : []);

  useEffect(() => {
    if (!visualFixture) {
      void fetch("/api/bootstrap", { cache: "no-store" }).then(async (response) => response.ok ? response.json() as Promise<AppState> : undefined).then((state) => {
        if (!state) return;
        const remediation = state.stageBRemediations.find((item) => item.caseId === caseId && item.floorId === floorId);
        setExtraPages(state.sectionCExtraPages.filter((item) => item.remediationId === remediation?.id && item.status === "ACTIVE"));
      }).catch(() => undefined);
      return;
    }
    const scenario = new URLSearchParams(window.location.search).get("remediationVisual") ?? "navigation";
    setExtraPages(visualExtraPages(scenario)); setActiveKey(visualSectionCWorkspaceKey(scenario) ?? visualWorkspacePage(scenario));
  }, [caseId, floorId, visualFixture]);

  const dynamicPages = useMemo(() => sectionCWorkspacePages(extraPages), [extraPages]);
  const activePage = useMemo(() => REMEDIATION_WORKSPACE_PAGES.find((item) => item.key === activeKey) ?? dynamicPages.find((item) => item.key === activeKey), [activeKey, dynamicPages]);
  const activeSection = sectionForKey(activeKey);

  return <section className="remediation-report-workspace" aria-labelledby="remediation-report-workspace-title">
    <header className="remediation-report-heading"><div><div className="eyebrow">Remedy &amp; Report Engine · Sections A, B and C</div><h1 id="remediation-report-workspace-title">Remediation report workspace</h1></div><div className="remediation-report-heading-state"><span>One floor</span><strong>Final Revised Layout</strong></div></header>
    <nav className="remediation-report-nav" aria-label="Remediation report pages">
      {(["A", "B", "C"] as const).map((section) => <div className="remediation-report-nav-group" data-section={section} key={section}>
        <header><span>Section {section}</span><small>{section === "A" ? "Layout, furniture, appliances and colour reference" : section === "B" ? "Five fixed remedy pages" : "Dynamic Extra pages before the Master Appendix"}</small></header>
        <div>{(section === "C" ? dynamicPages : REMEDIATION_WORKSPACE_PAGES.filter((item) => item.section === section)).map((item) => <button key={item.key} className={item.key === activeKey ? "is-active" : ""} aria-current={item.key === activeKey ? "page" : undefined} onClick={() => setActiveKey(item.key)}>
          <span>{item.shortLabel}</span><strong>{item.label}</strong><small>{"pageType" in item && item.pageType.endsWith("_IMPLEMENTATION") || "mode" in item && item.mode === "IMPLEMENTATION" ? "Implementation follows visual page" : `Report order ${item.ordinal}`}</small>
        </button>)}{section === "C" && <button className={activeKey === "C:HOME" ? "is-active remediation-extra-add-nav" : "remediation-extra-add-nav"} aria-current={activeKey === "C:HOME" ? "page" : undefined} onClick={() => setActiveKey("C:HOME")}><span>+</span><strong>+ Add Page</strong><small>{dynamicPages.length ? "Manage Extra pages" : "No Extra pages yet"}</small></button>}</div>
      </div>)}
    </nav>
    <div className="remediation-report-active-page" data-section={activeSection} data-page={activePage && "pageType" in activePage ? activePage.pageType : activePage?.mode ?? "HOME"}>
      {activeSection === "A" && activePage && "pageType" in activePage
        ? <SectionARemediationWorkspace caseId={caseId} floorId={floorId} pageType={activePage.pageType as SectionAWorkspacePageType} visualFixture={visualFixture} />
        : activeSection === "B" && activePage && "pageType" in activePage
          ? <StageBRemedyWorkspace caseId={caseId} floorId={floorId} activePageType={activePage.pageType as StageBRemedyType} onActivePageTypeChange={(pageType) => setActiveKey(`B:${pageType}`)} hideNavigation visualFixture={visualFixture} />
          : <SectionCExtrasWorkspace caseId={caseId} floorId={floorId} activeExtraPageId={activePage && "extraPageId" in activePage ? activePage.extraPageId : undefined}
              mode={activePage && "mode" in activePage ? activePage.mode : "MANAGE"} visualFixture={visualFixture} onPagesChange={setExtraPages} onNavigate={(extraPageId, mode) => setActiveKey(`C:${extraPageId}:${mode}`)} />}
    </div>
  </section>;
}
