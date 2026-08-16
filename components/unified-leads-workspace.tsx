"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppState } from "@/lib/store";
import type { CanonicalPipelineStage, InboundLeadRecord, TimelineEvent } from "@/lib/domain";
import { canonicalPipelineStages } from "@/lib/domain";
import { getAllowedPipelineTransitions, normalizeClientPipeline } from "@/lib/crm-pipeline";
import { buildActionHeaders } from "@/lib/request-helpers";
import { useSession } from "@/components/session-provider";
import { LeadImportSheet } from "@/components/lead-import-sheet";
import { LeadCommunicationSheet, type CommunicationContext } from "@/components/lead-communication-sheet";
import { FounderOpenCaseSheet } from "@/components/founder-open-case-sheet";
import { FounderProjectScopeSheet } from "@/components/founder-project-scope-sheet";
import type { FounderTemplateKey } from "@/lib/founder-communication-templates";

type Bootstrap = AppState & { persistenceRevision?: number | null };
type LeadPayload = { leads: InboundLeadRecord[] };
export type UnifiedLeadsWorkspaceMode = "all" | "leads" | "pipeline";
type Row = {
  id: string; leadId?: string; leadRecordVersion?: number; clientId?: string; name: string; email?: string; phone?: string; city?: string;
  serviceInterest?: string; source: string; sourceRecordId?: string; sourceSystem: string;
  stage: CanonicalPipelineStage; nextAction?: { summary: string; dueAt: string };
  syncStatus?: string; receivedAt?: string; submissions?: number;
  recordVersion: number; country?: string; timeZone?: string;
  privateSourceDetails?: { dob?: string; sourceAssignedTo?: string; propertyStage?: string; sourceRecordId?: string; externalClientCode?: string; sourceDeletedAt?: string };
};

const leadPipelineStages: CanonicalPipelineStage[] = [
  "NEW", "CONTACTED", "VSL_SENT", "VSL_WATCHED", "PAID_REVIEW_PENDING", "PAID_REVIEW_BOOKED",
  "FORM_PENDING", "REVIEW_COMPLETED", "QUALIFIED", "PROPOSAL_SCOPE", "WON", "PRE_CASE_FOLLOW_UP", "DISQUALIFIED", "CLOSED_REFERRAL",
];

const pipelineGroups = [
  { id: "LEAD", label: "Lead", stages: ["NEW"] },
  { id: "ENGAGED", label: "Engaged", stages: ["VSL_SENT", "VSL_WATCHED"] },
  { id: "CONTACTED", label: "Contacted", stages: ["CONTACTED"] },
  { id: "NURTURE", label: "Follow-up / Nurture", stages: ["PRE_CASE_FOLLOW_UP"] },
  { id: "REVIEW", label: "Review", stages: ["PAID_REVIEW_PENDING", "PAID_REVIEW_BOOKED", "FORM_PENDING", "REVIEW_COMPLETED", "QUALIFIED", "PROPOSAL_SCOPE"] },
  { id: "CONVERTED", label: "Converted", stages: ["WON"] },
] as const satisfies ReadonlyArray<{ id: string; label: string; stages: readonly CanonicalPipelineStage[] }>;

type PipelineGroupId = (typeof pipelineGroups)[number]["id"];
const operationalGroupTargets: Readonly<Record<PipelineGroupId, readonly PipelineGroupId[]>> = {
  LEAD: ["ENGAGED"],
  ENGAGED: ["CONTACTED"],
  CONTACTED: ["REVIEW", "NURTURE"],
  NURTURE: ["CONTACTED", "REVIEW"],
  REVIEW: ["CONVERTED", "NURTURE"],
  CONVERTED: [],
};

const terminalStages = new Set<CanonicalPipelineStage>(["DISQUALIFIED", "CLOSED_REFERRAL"]);
const stageLabel = (stage: string) => stage.replaceAll("_", " ").toLowerCase().replace(/^./, (character) => character.toUpperCase());
const toneFor = (stage: CanonicalPipelineStage) => terminalStages.has(stage) ? "blocked" : stage === "WON" ? "approved" : ["QUALIFIED", "PROPOSAL_SCOPE"].includes(stage) ? "ready" : "neutral";
const readableDate = (value?: string) => {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};
const maskEmail = (value?: string) => value ? `${value.slice(0, 2)}•••@${value.split("@")[1] ?? "private"}` : "—";
const maskPhone = (value?: string) => value ? `•••• ${value.replace(/\D/g, "").slice(-4)}` : "—";
const groupContainsStage = (group: (typeof pipelineGroups)[number], stage: CanonicalPipelineStage) =>
  (group.stages as readonly CanonicalPipelineStage[]).includes(stage);
const groupForStage = (stage: CanonicalPipelineStage) => pipelineGroups.find((group) => groupContainsStage(group, stage));

function normaliseRows(state: Bootstrap | null, leads: InboundLeadRecord[]): Row[] {
  const clients = state?.clients ?? [];
  const byClientId = new Map(clients.map((client) => [client.id, client]));
  const intakes = new Map((state?.clientIntakeProfiles ?? []).map((profile) => [profile.clientId, profile]));
  const rows = new Map<string, Row>();
  for (const lead of leads) {
    const client = byClientId.get(lead.convertedClientId ?? lead.uniqueClientId);
    const pipeline = client ? normalizeClientPipeline(client) : undefined;
    rows.set(lead.id, {
      id: lead.id, leadId: lead.id, leadRecordVersion: lead.recordVersion ?? 0, clientId: client?.id, name: client?.displayName ?? lead.fullName,
      email: client?.email ?? lead.email, phone: client?.phone ?? lead.phone, city: client?.city ?? lead.city,
      serviceInterest: client ? intakes.get(client.id)?.propertyContext?.serviceInterest ?? lead.serviceInterest : lead.serviceInterest,
      source: client?.source ?? lead.source, sourceRecordId: lead.sourceRecordId,
      sourceSystem: lead.sourceSystem ?? "UCHIT", stage: pipeline?.stage ?? (lead.status === "QUALIFIED" ? "QUALIFIED" : "NEW"),
      nextAction: pipeline?.nextAction, syncStatus: lead.syncStatus ?? "NATIVE", receivedAt: lead.firstSeenAt ?? lead.importedAt,
      submissions: lead.submissionCount,
      recordVersion: lead.recordVersion ?? 0, country: lead.country, timeZone: lead.timeZone,
      privateSourceDetails: lead.sourceProfile || lead.sourceRecordId || lead.externalClientCode ? {
        dob: lead.sourceProfile?.dob, sourceAssignedTo: lead.sourceProfile?.sourceAssignedTo,
        propertyStage: lead.sourceProfile?.propertyStage, sourceRecordId: lead.sourceRecordId,
        externalClientCode: lead.externalClientCode, sourceDeletedAt: lead.sourceProfile?.sourceDeletedAt
      } : undefined,
    });
  }
  for (const client of clients) {
    if (Array.from(rows.values()).some((row) => row.clientId === client.id)) continue;
    const pipeline = normalizeClientPipeline(client);
    const sourceLead = leads.find((lead) => (lead.convertedClientId ?? lead.uniqueClientId) === client.id);
    rows.set(`client:${client.id}`, {
      id: `client:${client.id}`, leadId: sourceLead?.id, leadRecordVersion: sourceLead?.recordVersion, clientId: client.id, name: client.displayName, email: client.email, phone: client.phone,
      city: client.city, serviceInterest: intakes.get(client.id)?.propertyContext?.serviceInterest,
      source: client.source, sourceSystem: client.source === "LOVABLE" ? "LOVABLE" : "UCHIT",
      stage: pipeline.stage, nextAction: pipeline.nextAction, syncStatus: "NATIVE",
      recordVersion: client.recordVersion ?? 0,
    });
  }
  return Array.from(rows.values());
}

async function fetchJson<T>(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("The latest lead workspace could not be loaded.");
  return response.json() as Promise<T>;
}

export function UnifiedLeadsWorkspace({ mode = "all" }: { mode?: UnifiedLeadsWorkspaceMode }) {
  const { activeUser } = useSession();
  const [state, setState] = useState<Bootstrap | null>(null);
  const [leadPayload, setLeadPayload] = useState<LeadPayload | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [communication, setCommunication] = useState<{ key: FounderTemplateKey; serviceType?: "EXISTING_SPACE" | "NEW_CONSTRUCTION"; prospectiveProjectId?: string }>();
  const [editing, setEditing] = useState(false);
  const [openCase, setOpenCase] = useState(false);
  const [projectScopeOpen, setProjectScopeOpen] = useState(false);
  const [complimentaryProject, setComplimentaryProject] = useState<NonNullable<Bootstrap["prospectiveProjects"]>[number]>();
  const [proposalProject, setProposalProject] = useState<NonNullable<Bootstrap["prospectiveProjects"]>[number]>();
  const [classificationBusy, setClassificationBusy] = useState<string>();
  const [complimentaryReason, setComplimentaryReason] = useState("");
  const [complimentaryBusy, setComplimentaryBusy] = useState(false);
  const [proposalBusy, setProposalBusy] = useState(false);
  const [proposalClassification, setProposalClassification] = useState<"STANDARD_PAID" | "SPECIAL_DISCOUNTED" | "INTERNAL_COMPLIMENTARY">("STANDARD_PAID");
  const [proposalFee, setProposalFee] = useState("");
  const [proposalGst, setProposalGst] = useState("");
  const [proposalAdvance, setProposalAdvance] = useState("");
  const [proposalReason, setProposalReason] = useState("");
  const [profileDraft, setProfileDraft] = useState({ fullName: "", email: "", phone: "", city: "", country: "", timeZone: "", serviceInterest: "" });
  const [editReason, setEditReason] = useState("");
  const [moveGroupId, setMoveGroupId] = useState("");
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [stageFilter, setStageFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [target, setTarget] = useState<CanonicalPipelineStage>("NEW");
  const [nextAction, setNextAction] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("Loading leads…");
  const [errorKind, setErrorKind] = useState<"none" | "offline" | "conflict" | "load">("none");
  const key = useRef(crypto.randomUUID());
  const isPipelinePage = mode === "pipeline";

  const refresh = useCallback(async (preferredId?: string) => {
    setBusy(true); setErrorKind("none");
    try {
      const [nextState, nextLeads] = await Promise.all([fetchJson<Bootstrap>("/api/bootstrap"), fetchJson<LeadPayload>("/api/optin-leads")]);
      setState(nextState); setLeadPayload(nextLeads); setSelectedId((current) => preferredId ?? current);
      setMessage("Leads are up to date.");
    } catch (error) {
      setErrorKind(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "load");
      setMessage(error instanceof Error ? error.message : "The lead workspace could not be loaded.");
    } finally { setBusy(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const rows = useMemo(() => normaliseRows(state, leadPayload?.leads ?? []), [state, leadPayload]);
  const activeCount = rows.filter((row) => !terminalStages.has(row.stage)).length;
  const sources = useMemo(() => Array.from(new Set(rows.map((row) => row.sourceSystem))).sort(), [rows]);
  const visibleRows = useMemo(() => rows.filter((row) => {
    const haystack = `${row.clientId ?? ""} ${row.name} ${row.email ?? ""} ${row.phone ?? ""} ${row.city ?? ""} ${row.serviceInterest ?? ""}`.toLowerCase();
    const received = row.receivedAt ? new Date(row.receivedAt).getTime() : undefined;
    return (!query.trim() || haystack.includes(query.trim().toLowerCase()))
      && (sourceFilter === "ALL" || row.sourceSystem === sourceFilter)
      && (stageFilter === "ALL" || row.stage === stageFilter)
      && (isPipelinePage || showArchived || !terminalStages.has(row.stage))
      && (!dateFrom || (received !== undefined && received >= new Date(`${dateFrom}T00:00:00`).getTime()))
      && (!dateTo || (received !== undefined && received <= new Date(`${dateTo}T23:59:59`).getTime()))
      && (!isPipelinePage || leadPipelineStages.includes(row.stage));
  }), [rows, query, sourceFilter, stageFilter, showArchived, dateFrom, dateTo, isPipelinePage]);
  const selected = rows.find((row) => row.id === selectedId);
  const selectedClient = selected?.clientId ? state?.clients.find((client) => client.id === selected.clientId) : undefined;
  const pipeline = selectedClient ? normalizeClientPipeline(selectedClient) : undefined;
  const allowedTargets = pipeline ? getAllowedPipelineTransitions(pipeline.stage).filter((stage) => leadPipelineStages.includes(stage)) : [];
  const canRecordCorrection = activeUser.role === "ADMIN" || activeUser.role === "SUPER_ADMIN";
  const events = useMemo<TimelineEvent[]>(() => selected?.clientId ? (state?.timelineEvents ?? []).filter((event) => event.clientId === selected.clientId).slice(0, 12) : [], [state, selected?.clientId]);
  const clientCases = useMemo(() => selectedClient ? (state?.vastuCases ?? []).filter((item) => item.clientId === selectedClient.id) : [], [state?.vastuCases, selectedClient?.id]);
  const clientProjects = useMemo(() => selectedClient ? (state?.prospectiveProjects ?? []).filter((item) => item.clientId === selectedClient.id && !item.caseId) : [], [state?.prospectiveProjects, selectedClient?.id]);
  const proposedTargets = useMemo(() => {
    const group = pipelineGroups.find((item) => item.id === moveGroupId);
    if (!group) return allowedTargets;
    const directTargets = allowedTargets.filter((stage) => groupContainsStage(group, stage));
    return directTargets.length || !canRecordCorrection
      ? directTargets
      : group.stages.filter((stage) => stage !== pipeline?.stage);
  }, [allowedTargets, canRecordCorrection, moveGroupId, pipeline?.stage]);

  useEffect(() => {
    if (!selected) return;
    const first = proposedTargets[0] ?? allowedTargets[0] ?? selected.stage;
    const hasDirectTarget = proposedTargets.some((stage) => allowedTargets.includes(stage));
    const groupedCorrectionDueAt = !hasDirectTarget && moveGroupId
      ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16)
      : "";
    setTarget(first); setNextAction(selected.nextAction?.summary ?? ""); setDueAt(selected.nextAction?.dueAt?.slice(0, 16) ?? groupedCorrectionDueAt);
    setCorrectionReason("");
    key.current = crypto.randomUUID();
  }, [selected?.id, selected?.stage, selected?.nextAction?.dueAt, moveGroupId]);

  useEffect(() => {
    if (!selected) return;
    setProfileDraft({ fullName: selected.name, email: selected.email ?? "", phone: selected.phone ?? "", city: selected.city ?? "", country: selected.country ?? "", timeZone: selected.timeZone ?? "", serviceInterest: selected.serviceInterest ?? "" });
    setEditReason(""); setEditing(false); setCommunication(undefined);
  }, [selected?.id]);

  function openLead(row: Row) { setSelectedId(row.id); setDrawerOpen(true); setMoveOpen(false); setMoveGroupId(""); }
  function openConvertedProposal(row: Row) {
    openLead(row);
    const project = row.clientId ? state?.prospectiveProjects.find((item) => item.clientId === row.clientId && !item.caseId && item.serviceType) : undefined;
    if (project) openProposalDraft(project); else setMessage("A converted lead needs a saved project scope before a proposal can be drafted.");
  }
  function proposeMove(row: Row, groupId: string) {
    setSelectedId(row.id); setMoveGroupId(groupId); setDrawerOpen(false);
    const client = row.clientId ? state?.clients.find((item) => item.id === row.clientId) : undefined;
    const permitted = client ? getAllowedPipelineTransitions(normalizeClientPipeline(client).stage) : [];
    const group = pipelineGroups.find((item) => item.id === groupId);
    const directTargets = group ? permitted.filter((stage) => groupContainsStage(group, stage)) : [];
    if (!group || (!directTargets.length && (!canRecordCorrection || !group.stages.length))) {
      setMessage("That skip is not allowed. The lead stayed in its current stage; choose an allowed next stage.");
      setMoveOpen(false); return;
    }
    if (groupId === "REVIEW" && (row.stage === "CONTACTED" || row.stage === "PRE_CASE_FOLLOW_UP")) { setProjectScopeOpen(true); return; }
    setMoveOpen(true);
  }

  async function transitionAfterScope() {
    setProjectScopeOpen(false); setBusy(true); setErrorKind("none");
    try {
      const latest = await fetchJson<Bootstrap>("/api/bootstrap");
      const latestClient = latest.clients.find((client) => client.id === selectedClient?.id);
      if (!latestClient) throw new Error("The saved client context is no longer available. Refresh and try again.");
      const response = await fetch("/api/actions", { method: "POST", headers: buildActionHeaders(activeUser.role), body: JSON.stringify({ action: "client-pipeline-transition", clientId: latestClient.id, pipelineStage: "PAID_REVIEW_PENDING", nextAction: "Complete Founder review", nextActionDueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), idempotencyKey: crypto.randomUUID(), expectedRecordVersion: latestClient.recordVersion ?? 0, expectedRevision: latest.persistenceRevision ?? null }) });
      const payload = await response.json(); if (!response.ok || payload.ok === false) throw new Error(payload.error?.message ?? payload.error ?? "The Review transition could not be saved.");
      setMessage("Project scope saved and the lead entered Review."); await refresh(selected?.id);
    } catch (error) { setMessage(error instanceof Error ? error.message : "The Review transition could not be saved."); }
    finally { setBusy(false); }
  }

  async function saveTransition() {
    if (!selectedClient || !state || target === pipeline?.stage) return;
    const terminal = terminalStages.has(target);
    const correction = !allowedTargets.includes(target);
    if (correction && (!canRecordCorrection || correctionReason.trim().length < 20 || correctionReason.trim().length > 500)) {
      setMessage("An out-of-sequence Founder correction requires a reason of 20–500 characters."); return;
    }
    if (!terminal && (!nextAction.trim() || !dueAt || new Date(dueAt).getTime() <= Date.now())) {
      setMessage("Add a future next action and due date before moving this lead."); return;
    }
    if (correction && !window.confirm("Record this administrative pipeline correction? The reason will remain in immutable history.")) return;
    setBusy(true); setErrorKind("none");
    try {
      const response = await fetch("/api/actions", { method: "POST", headers: buildActionHeaders(activeUser.role), body: JSON.stringify({
        action: "client-pipeline-transition", clientId: selectedClient.id, pipelineStage: target,
        nextAction: terminal ? undefined : nextAction, nextActionDueAt: terminal ? undefined : new Date(dueAt).toISOString(),
        correction, correctionReason: correction ? correctionReason.trim() : undefined,
        idempotencyKey: key.current, expectedRecordVersion: selectedClient.recordVersion ?? 0, expectedRevision: state.persistenceRevision ?? null,
      }) });
      const result = await response.json();
      if (!response.ok || result.ok === false) {
        if (response.status === 409 || response.status === 428) setErrorKind("conflict");
        throw new Error(result.error?.message ?? result.error ?? "The pipeline change could not be saved.");
      }
      key.current = crypto.randomUUID(); setMoveOpen(false); setMessage("Pipeline updated and canonical history refreshed.");
      await refresh(selected?.id);
    } catch (error) { setMessage(error instanceof Error ? error.message : "The pipeline change could not be saved."); }
    finally { setBusy(false); }
  }

  async function saveProfile() {
    if (!selected || !state || !editReason.trim()) { setMessage("Add a private reason before saving profile changes."); return; }
    setBusy(true); setErrorKind("none");
    try {
      const response = await fetch("/api/actions", { method: "POST", headers: buildActionHeaders(activeUser.role), body: JSON.stringify({
        action: "founder-lead-profile-update", leadId: selected.id, changes: profileDraft, reason: editReason,
        idempotencyKey: crypto.randomUUID(), expectedRecordVersion: selected.recordVersion, expectedRevision: state.persistenceRevision ?? null,
      }) });
      const result = await response.json();
      if (!response.ok || result.ok === false) { if ([409, 428].includes(response.status)) setErrorKind("conflict"); throw new Error(result.error ?? "Profile changes could not be saved."); }
      setEditing(false); setMessage("Profile changes saved with immutable Founder audit."); await refresh(selected.id);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Profile changes could not be saved."); }
    finally { setBusy(false); }
  }

  async function createComplimentaryProposal() {
    if (!complimentaryProject || !selectedClient || !state || !complimentaryReason.trim()) { setMessage("Enter the private Founder reason before creating the complimentary proposal."); return; }
    setComplimentaryBusy(true); setErrorKind("none");
    try {
      const latestBootstrap = await fetch("/api/bootstrap", { cache: "no-store" }).then(async (response) => {
        if (!response.ok) throw new Error("The latest case and state versions could not be loaded. Refresh and try again.");
        return response.json() as Promise<{ persistenceRevision?: number; prospectiveProjects?: Array<{ id: string; recordVersion?: number }> }>;
      });
      const latestProject = latestBootstrap.prospectiveProjects?.find((project) => project.id === complimentaryProject.id);
      const response = await fetch("/api/actions", { method: "POST", headers: buildActionHeaders(activeUser.role), body: JSON.stringify({
        action: "founder-proposal-draft-create", clientId: selectedClient.id, prospectiveProjectId: complimentaryProject.id,
        classification: "INTERNAL_COMPLIMENTARY", professionalFeePaise: 0, appliedGstBasisPoints: 0, agreedAdvancePaise: 0,
        classificationReason: complimentaryReason.trim(), idempotencyKey: `founder:complimentary-proposal:${complimentaryProject.id}:${crypto.randomUUID()}`,
        expectedProjectVersion: latestProject?.recordVersion ?? complimentaryProject.recordVersion ?? 0,
        expectedRecordVersion: latestProject?.recordVersion ?? complimentaryProject.recordVersion ?? 0,
        expectedRevision: latestBootstrap.persistenceRevision ?? state.persistenceRevision ?? null,
      }) });
      const result = await response.json();
      if (!response.ok || result.ok === false) throw new Error(result.error?.message ?? result.error ?? "The complimentary proposal could not be created.");
      const proposalId = result.proposal?.id;
      if (!proposalId) throw new Error("The server did not return the new proposal version. Reload and retry.");
      window.location.assign(`/commercial-proposals/${encodeURIComponent(proposalId)}/1`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "The complimentary proposal could not be created."); }
    finally { setComplimentaryBusy(false); }
  }

  function openProposalDraft(project: NonNullable<Bootstrap["prospectiveProjects"]>[number]) {
    const policy = state?.founderCommercialPolicies?.find((item) => item.status === "ACTIVE");
    setProposalProject(project);
    setProposalClassification("STANDARD_PAID");
    setProposalFee(String(Math.round((policy?.referenceFeePaise ?? 5_100_000) / 100)));
    setProposalGst(String((policy?.defaultGstBasisPoints ?? 1_800) / 100));
    setProposalAdvance(String(Math.round((policy?.referenceAdvancePaise ?? 1_100_000) / 100)));
    setProposalReason("");
  }

  async function createEditableProposal() {
    if (!proposalProject || !selectedClient || !state) return;
    const policy = state.founderCommercialPolicies?.find((item) => item.status === "ACTIVE");
    const professionalFeePaise = Math.round(Number(proposalFee) * 100);
    const appliedGstBasisPoints = Math.round(Number(proposalGst) * 100);
    const agreedAdvancePaise = Math.round(Number(proposalAdvance) * 100);
    if (!Number.isSafeInteger(professionalFeePaise) || professionalFeePaise < 0 || !Number.isSafeInteger(appliedGstBasisPoints) || appliedGstBasisPoints < 0 || !Number.isSafeInteger(agreedAdvancePaise) || agreedAdvancePaise < 0) {
      setMessage("Enter valid non-negative commercial amounts before creating the proposal."); return;
    }
    if (proposalClassification !== "INTERNAL_COMPLIMENTARY" && professionalFeePaise <= 0) {
      setMessage("A paid proposal requires a professional fee greater than zero."); return;
    }
    const hasTermDeviation = professionalFeePaise !== (policy?.referenceFeePaise ?? 5_100_000) || appliedGstBasisPoints !== (policy?.defaultGstBasisPoints ?? 1_800) || agreedAdvancePaise !== (policy?.referenceAdvancePaise ?? 1_100_000);
    if ((proposalClassification !== "STANDARD_PAID" || hasTermDeviation) && proposalReason.trim().length < 10) {
      setMessage("Add a private Founder reason for a discounted or complimentary proposal."); return;
    }
    if (proposalClassification === "STANDARD_PAID" && agreedAdvancePaise < (policy?.referenceAdvancePaise ?? 1_100_000)) {
      setMessage("A below-reference advance is a Founder exception; choose PAID (Founder exception) and record the reason."); return;
    }
    setProposalBusy(true); setErrorKind("none");
    try {
      const latestBootstrap = await fetchJson<Bootstrap>("/api/bootstrap");
      const latestProject = latestBootstrap.prospectiveProjects?.find((item) => item.id === proposalProject.id);
      if (!latestProject) throw new Error("The prospective project is no longer available. Refresh and try again.");
      const response = await fetch("/api/actions", { method: "POST", headers: buildActionHeaders(activeUser.role), body: JSON.stringify({
        action: "founder-proposal-draft-create", clientId: selectedClient.id, prospectiveProjectId: latestProject.id,
        classification: proposalClassification, professionalFeePaise, appliedGstBasisPoints, agreedAdvancePaise,
        classificationReason: proposalClassification === "STANDARD_PAID" ? undefined : proposalReason.trim(),
        feeDeviationReason: hasTermDeviation ? proposalReason.trim() : undefined,
        gstDeviationReason: hasTermDeviation ? proposalReason.trim() : undefined,
        advanceExceptionReason: hasTermDeviation ? proposalReason.trim() : undefined,
        idempotencyKey: `founder:proposal:${latestProject.id}:${crypto.randomUUID()}`,
        expectedProjectVersion: latestProject.recordVersion ?? 0, expectedRecordVersion: latestProject.recordVersion ?? 0,
        expectedRevision: latestBootstrap.persistenceRevision ?? state.persistenceRevision ?? null,
      }) });
      const result = await response.json();
      if (!response.ok || result.ok === false) throw new Error(result.error?.message ?? result.error ?? "The proposal could not be created.");
      const proposalId = result.proposal?.id;
      if (!proposalId) throw new Error("The server did not return the new proposal version. Reload and retry.");
      window.location.assign(`/commercial-proposals/${encodeURIComponent(proposalId)}/1`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "The proposal could not be created."); }
    finally { setProposalBusy(false); }
  }

  async function classifyExistingSpace(project: NonNullable<Bootstrap["prospectiveProjects"]>[number]) {
    if (!selectedClient || !selected || !state || project.serviceType) return;
    setClassificationBusy(project.id); setErrorKind("none");
    try {
      const latestBootstrap = await fetchJson<Bootstrap>("/api/bootstrap");
      const latestProject = latestBootstrap.prospectiveProjects?.find((candidate) => candidate.id === project.id);
      if (!latestProject) throw new Error("The prospective project is no longer available. Reload and try again.");
      const response = await fetch("/api/actions", { method: "POST", headers: buildActionHeaders(activeUser.role), body: JSON.stringify({
        action: "founder-prospective-project-service-classify", prospectiveProjectId: latestProject.id, serviceType: "EXISTING_SPACE",
        clientId: latestProject.clientId, leadId: latestProject.leadId, responseVersionId: latestProject.responseVersionId,
        idempotencyKey: `founder:prospective-service:${latestProject.id}:existing-space`, expectedRecordVersion: latestProject.recordVersion,
        expectedRevision: latestBootstrap.persistenceRevision ?? state.persistenceRevision ?? null,
      }) });
      const result = await response.json();
      if (!response.ok || result.ok === false) throw new Error(result.error?.message ?? result.error ?? "The service classification could not be saved.");
      setMessage("Existing Space classification saved on the existing prospective project.");
      await refresh(selected.id);
    } catch (error) { setMessage(error instanceof Error ? error.message : "The service classification could not be saved."); }
    finally { setClassificationBusy(undefined); }
  }

  async function latestRevision() { return (await fetchJson<Bootstrap>("/api/bootstrap")).persistenceRevision ?? null; }
  async function prepareCommunicationContext(idempotencyKey: string, qualificationKind?: "RESIDENTIAL" | "COMMERCIAL" | "HYBRID") {
    if (!selected?.leadId) throw new Error("This row has no linked inbound lead. Open the original lead record before preparing communication.");
    const expectedRevision = await latestRevision();
    const response = await fetch("/api/actions", { method: "POST", headers: buildActionHeaders(activeUser.role), body: JSON.stringify({
      action: "founder-communication-context", leadId: selected.leadId, clientId: selected.clientId, templateKey: communication?.key,
      serviceType: communication?.serviceType, qualificationKind, prospectiveProjectId: communication?.prospectiveProjectId, idempotencyKey, expectedRecordVersion: selected.leadRecordVersion ?? selected.recordVersion, expectedRevision,
    }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "The approved communication context could not be prepared.");
    return result.result as CommunicationContext;
  }
  async function prepareCommunication(channel: "WHATSAPP" | "EMAIL", values: Record<string, string>, idempotencyKey: string, context?: CommunicationContext) {
    if (!selected) throw new Error("Select a lead first.");
    const expectedRevision = await latestRevision();
    const response = await fetch("/api/actions", { method: "POST", headers: buildActionHeaders(activeUser.role), body: JSON.stringify({
      action: "founder-communication-prepare", leadId: selected.leadId ?? selected.id, clientId: selected.clientId,
      templateKey: communication?.key, values,
      channel, recipient: channel === "WHATSAPP" ? selected.phone : selected.email,
      assetVersionIds: context?.assetVersionIds, formDefinitionId: context?.formDefinitionId, grantIds: context?.grantIds,
      idempotencyKey, expectedRecordVersion: selected.leadRecordVersion ?? selected.recordVersion, expectedRevision,
    }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Communication could not be prepared.");
    return { id: result.result.record.id as string, recordVersion: result.result.record.recordVersion as number };
  }
  async function markOpened(record: { id: string; recordVersion: number }) {
    const response = await fetch("/api/actions", { method: "POST", headers: buildActionHeaders(activeUser.role), body: JSON.stringify({ action: "founder-communication-opened", preparationId: record.id, idempotencyKey: crypto.randomUUID(), expectedRecordVersion: record.recordVersion, expectedRevision: await latestRevision() }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "OPENED state could not be recorded.");
  }

  const primaryLabel = selectedClient ? "Save & continue" : "Open client readiness";
  const selectedGroup = selected ? groupForStage(selected.stage) : undefined;
  const activeCommercialPolicy = state?.founderCommercialPolicies?.find((item) => item.status === "ACTIVE");
  const proposalNeedsReason = proposalClassification !== "STANDARD_PAID"
    || proposalFee !== String(Math.round((activeCommercialPolicy?.referenceFeePaise ?? 5_100_000) / 100))
    || proposalGst !== String((activeCommercialPolicy?.defaultGstBasisPoints ?? 1_800) / 100)
    || proposalAdvance !== String(Math.round((activeCommercialPolicy?.referenceAdvancePaise ?? 1_100_000) / 100));
  const resetFilters = () => { setQuery(""); setSourceFilter("ALL"); setStageFilter("ALL"); setDateFrom(""); setDateTo(""); setShowArchived(false); };

  return <><section className={`lead-workspace ${isPipelinePage ? "lead-workspace-pipeline" : "lead-workspace-table"}`} aria-labelledby="unified-leads-title">
    <header className="lead-workspace-header"><div><h2 id="unified-leads-title">{isPipelinePage ? "Lead Pipeline" : "Leads / Opt-ins"}</h2><p>{isPipelinePage ? "Acquisition and qualification only. Every move is confirmed by the Uchit server." : `${activeCount} active leads · canonical Uchit records`}</p></div>{!isPipelinePage ? <div className="lead-header-actions"><label className="archive-toggle"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /> Show archived</label><LeadImportSheet onImported={() => refresh(selected?.id)} /></div> : <span className="status-pill status-neutral">Lovable sync dormant</span>}</header>

    <div className="lead-filterbar" aria-label="Lead filters">
      <label><span>Search</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Client ID, name, contact or city" /></label>
      <label><span>Stage</span><select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}><option value="ALL">All stages</option>{leadPipelineStages.map((stage) => <option key={stage} value={stage}>{stageLabel(stage)}</option>)}</select></label>
      <label><span>Source</span><select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}><option value="ALL">All sources</option>{sources.map((source) => <option key={source} value={source}>{source}</option>)}</select></label>
      {!isPipelinePage ? <><label><span>Received from</span><input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label><label><span>Received to</span><input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label></> : null}
    </div>

    {busy && !state ? <div className="lead-loading" role="status"><span className="loading-line" /><span className="loading-line" /><span className="loading-line" />Loading leads…</div> : errorKind === "load" || errorKind === "offline" ? <div className="workspace-state" role="alert"><h3>{errorKind === "offline" ? "You appear to be offline" : "Leads could not be loaded"}</h3><p>{message} Your filters and draft are still here.</p><button type="button" className="button" onClick={() => void refresh(selected?.id)}>Try again</button></div> : !rows.length ? <div className="workspace-state" role="status"><h3>No leads yet</h3><p>Native opt-ins will appear here. Lovable records remain unavailable until activation is separately approved.</p></div> : !visibleRows.length ? <div className="workspace-state" role="status"><h3>No matching leads</h3><p>Adjust the filters to return to the canonical lead list.</p><button type="button" className="button-secondary" onClick={resetFilters}>Clear filters</button></div> : isPipelinePage ?
      <div className="lead-kanban" aria-label="Lead pipeline board">{pipelineGroups.map((group) => {
        const groupRows = visibleRows.filter((row) => groupContainsStage(group, row.stage));
        return <section className="lead-kanban-column" key={group.id} data-group={group.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const row = rows.find((item) => item.id === event.dataTransfer.getData("text/lead-id")); if (row) proposeMove(row, group.id); }}>
          <header><h3>{group.label}</h3><span>{groupRows.length}</span></header>
          <div className="lead-kanban-cards">{groupRows.length ? groupRows.map((row) => <article className="lead-kanban-card" key={row.id} draggable={Boolean(row.clientId)} onDragStart={(event) => event.dataTransfer.setData("text/lead-id", row.id)}>
            <button type="button" className="lead-kanban-card-open" onClick={() => openLead(row)}><strong>{row.name}</strong><span>{row.clientId ?? "Client ID pending"}</span><span className={`status-pill status-${toneFor(row.stage)}`}>{stageLabel(row.stage)}</span><span>{row.nextAction?.summary ?? "Next action not set"}</span><small>{row.sourceSystem} · {readableDate(row.nextAction?.dueAt)}</small></button>
            {row.stage === "WON" && row.clientId ? <button type="button" className="table-row-action" onClick={(event) => { event.stopPropagation(); openConvertedProposal(row); }}>Create proposal</button> : null}
            <details className="lead-card-move"><summary>Next actions</summary><div>{operationalGroupTargets[group.id].map((targetGroup) => { const candidate = pipelineGroups.find((item) => item.id === targetGroup)!; return <button type="button" key={candidate.id} onClick={() => proposeMove(row, candidate.id)}>Move to {candidate.label}</button>; })}{canRecordCorrection ? <details><summary>Administrative correction</summary><div>{pipelineGroups.filter((candidate) => candidate.id !== group.id && !operationalGroupTargets[group.id].includes(candidate.id)).map((candidate) => <button type="button" key={candidate.id} onClick={() => proposeMove(row, candidate.id)}>Correct to {candidate.label}</button>)}</div></details> : null}</div></details>
          </article>) : <p>No leads</p>}</div>
        </section>;
      })}</div> :
      <div className="lead-table-wrap"><table className="lead-table"><thead><tr><th>Client ID</th><th>Name</th><th>Email</th><th>Phone</th><th>City</th><th>Service interest</th><th>Stage</th><th>Source</th><th>Received</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{visibleRows.map((row) => <tr key={row.id} tabIndex={0} onClick={() => openLead(row)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") openLead(row); }}><td>{row.clientId ?? "Pending"}</td><td><strong>{row.name}</strong>{row.submissions && row.submissions > 1 ? <small>Repeat ×{row.submissions}</small> : null}</td><td>{maskEmail(row.email)}</td><td>{maskPhone(row.phone)}</td><td>{row.city || "—"}</td><td>{row.serviceInterest ? stageLabel(row.serviceInterest) : "—"}</td><td><span className={`status-pill status-${toneFor(row.stage)}`}>{stageLabel(row.stage)}</span></td><td>{row.sourceSystem}</td><td>{readableDate(row.receivedAt)}</td><td><button type="button" className="table-row-action" onClick={(event) => { event.stopPropagation(); openLead(row); }} aria-label={`Open ${row.name}`}>Open</button></td></tr>)}</tbody></table></div>}

    {drawerOpen && selected ? <div className="lead-drawer-layer"><button className="lead-drawer-backdrop" type="button" onClick={() => setDrawerOpen(false)} aria-label="Close lead profile" /><aside className="lead-profile-drawer" role="dialog" aria-modal="true" aria-labelledby="lead-drawer-title">
      <header className="lead-drawer-header"><div><span className="eyebrow">Lead profile</span><h2 id="lead-drawer-title">{selected.name}</h2><p>{selected.clientId ?? "Permanent Client ID pending"}</p><button type="button" className="profile-edit-trigger" onClick={() => setEditing(true)} aria-label="Edit profile"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 20h4l11-11-4-4L4 16v4Zm13-17 4 4" /></svg>Edit profile</button></div><button type="button" className="drawer-close" onClick={() => setDrawerOpen(false)} aria-label="Close profile">×</button><div className="lead-drawer-status"><span className={`status-pill status-${toneFor(selected.stage)}`}>{stageLabel(selected.stage)}</span><span>{selected.sourceSystem}</span></div></header>
      <div className="lead-drawer-body">
        {selectedClient ? <div className="lead-drawer-section"><button type="button" className="button" onClick={() => setOpenCase(true)}>Open new case</button><p className="meta">Create an independent prospective project. A Case ID follows only canonical commercial clearance.</p></div> : null}
        <details className="lead-drawer-section" open><summary>Profile</summary>{editing ? <div className="lead-profile-edit-form"><label>Full name<input value={profileDraft.fullName} onChange={(event) => setProfileDraft({ ...profileDraft, fullName: event.target.value })} /></label><label>Email<input type="email" value={profileDraft.email} onChange={(event) => setProfileDraft({ ...profileDraft, email: event.target.value })} /></label><label>Phone / WhatsApp<input value={profileDraft.phone} onChange={(event) => setProfileDraft({ ...profileDraft, phone: event.target.value })} /></label><label>City<input value={profileDraft.city} onChange={(event) => setProfileDraft({ ...profileDraft, city: event.target.value })} /></label><label>Country<input value={profileDraft.country} onChange={(event) => setProfileDraft({ ...profileDraft, country: event.target.value })} /></label><label>IANA time zone<input value={profileDraft.timeZone} onChange={(event) => setProfileDraft({ ...profileDraft, timeZone: event.target.value })} placeholder="Asia/Kolkata" /></label><label>Primary service interest<select value={profileDraft.serviceInterest} onChange={(event) => setProfileDraft({ ...profileDraft, serviceInterest: event.target.value })}><option value="">Choose service</option><option value="EXISTING_SPACE">Existing Space</option><option value="NEW_CONSTRUCTION">New Construction</option></select></label><label>Private change reason<textarea value={editReason} onChange={(event) => setEditReason(event.target.value)} required /></label><div><button className="button" type="button" disabled={busy || !editReason.trim()} onClick={() => void saveProfile()}>{busy ? "Saving…" : "Save changes"}</button><button className="button-secondary" type="button" onClick={() => setEditing(false)}>Cancel</button></div></div> : <dl><div><dt>Contact</dt><dd>{maskEmail(selected.email)} · {maskPhone(selected.phone)}</dd></div><div><dt>City</dt><dd>{selected.city || "Not recorded"}</dd></div><div><dt>Country / time zone</dt><dd>{[selected.country, selected.timeZone].filter(Boolean).join(" · ") || "Not recorded"}</dd></div><div><dt>Service</dt><dd>{selected.serviceInterest ? stageLabel(selected.serviceInterest) : "Not recorded"}</dd></div></dl>}</details>
        <details className="lead-drawer-section"><summary>Requirement / Intake</summary><p>{selected.serviceInterest ? `${stageLabel(selected.serviceInterest)} interest recorded.` : "Complete the Founder intake to capture property and service requirements."}</p><a href="/founder/03" className="text-link">Open intake step</a></details>
        <details className="lead-drawer-section"><summary>Cases &amp; projects</summary>{clientCases.length || clientProjects.length ? <ul className="lead-timeline">{clientCases.map((item) => <li key={item.id}><strong>{item.caseNumber}</strong><span>{item.serviceType} · {item.status} · <a href={`/founder/continue?caseId=${item.id}`}>Continue</a></span></li>)}{clientProjects.map((item) => <li key={item.id}><strong>{item.variation ?? item.displayName ?? "Prospective project"}</strong><span>{item.propertyLocation ?? "Location pending"} · {item.serviceType ? `service: ${item.serviceType}` : "service not classified"} · commercial clearance pending</span>{!item.serviceType ? <button type="button" className="button-secondary" disabled={Boolean(classificationBusy)} onClick={() => void classifyExistingSpace(item)}>{classificationBusy === item.id ? "Saving service…" : "Confirm Existing Space"}</button> : null}{item.serviceType ? <button type="button" className="button-secondary" onClick={() => setCommunication({ key: "QUALIFICATION", prospectiveProjectId: item.id })}>Send qualification for this project</button> : null}{selected.stage === "WON" && item.serviceType ? <button type="button" className="button" onClick={() => openProposalDraft(item)}>Create proposal</button> : null}<button type="button" className="button-secondary" onClick={() => { setComplimentaryProject(item); setComplimentaryReason(""); }}>Create INTERNAL_COMPLIMENTARY proposal</button></li>)}</ul> : <p>{selected.stage === "WON" ? "Converted lead: create the prospective project from the existing qualification before drafting the proposal." : "No cases or projects yet."}</p>}{selectedClient ? <button type="button" className="button-secondary" onClick={() => setOpenCase(true)}>Open another case</button> : null}</details>
        <details className="lead-drawer-section" open><summary>Guided next action</summary><div className="lead-guided-actions"><button type="button" onClick={() => setCommunication({ key: "VSL" })}>Send VSL</button><div role="group" aria-label="Send deliverable brochure"><span>Send deliverable brochure</span><button type="button" onClick={() => setCommunication({ key: "BROCHURE", serviceType: "EXISTING_SPACE" })}>Existing Space</button><button type="button" onClick={() => setCommunication({ key: "BROCHURE", serviceType: "NEW_CONSTRUCTION" })}>New Construction</button></div><button type="button" onClick={() => setCommunication({ key: "QUALIFICATION" })}>Send qualification form</button></div><p className="meta">For an existing project, launch qualification from that project so its exact identity is preserved. Pipeline transitions remain on Lead Pipeline.</p></details>
        <details className="lead-drawer-section"><summary>Timeline</summary>{events.length ? <ol className="lead-timeline">{events.map((event) => <li key={event.id}><strong>{event.headline}</strong><span>{readableDate(event.happenedAt)} · {event.actorName ?? "Uchit"}</span></li>)}</ol> : <p>No Uchit activity yet.</p>}<p className="meta">Source history is labelled separately and never becomes authoritative audit.</p></details>
        <details className="lead-drawer-section"><summary>Follow-ups</summary><p>{selected.nextAction?.summary ?? "No follow-up scheduled."}</p><p className="meta">{readableDate(selected.nextAction?.dueAt)}</p></details>
        <details className="lead-drawer-section"><summary>Commercial</summary><p>Scope, proposal, advance and case creation remain Uchit-owned and server-gated.</p><a href="/founder/01" className="text-link">Open commercial readiness</a></details>
        {activeUser.role === "SUPER_ADMIN" && selected.privateSourceDetails ? <details className="lead-drawer-section"><summary>Private source details</summary><dl><div><dt>Date of birth</dt><dd>{selected.privateSourceDetails.dob || "Not supplied"}</dd></div><div><dt>Source assignment</dt><dd>{selected.privateSourceDetails.sourceAssignedTo || "Not supplied"}</dd></div><div><dt>Property stage</dt><dd>{selected.privateSourceDetails.propertyStage || "Not supplied"}</dd></div><div><dt>Source record</dt><dd>{selected.privateSourceDetails.sourceRecordId || "Not supplied"}</dd></div><div><dt>External client reference</dt><dd>{selected.privateSourceDetails.externalClientCode || "Not supplied"}</dd></div><div><dt>Source tombstone</dt><dd>{selected.privateSourceDetails.sourceDeletedAt ? "Recorded in source history" : "None"}</dd></div></dl><p className="meta">Restricted source metadata only. It does not change ownership, client identity, qualification, reports or evaluation.</p></details> : null}
        <details className="lead-drawer-section"><summary>Technical details</summary><p className="meta">Sync status: {selected.syncStatus ?? "native"}. Source payloads, private IDs and audit internals are intentionally excluded.</p></details>
      </div>
      <footer className="lead-drawer-footer"><div className="lead-contact-actions"><a className={!selected.phone ? "is-disabled" : ""} href={selected.phone ? `tel:${selected.phone}` : undefined} aria-disabled={!selected.phone}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 3h4l2 5-3 2a14 14 0 0 0 5 5l2-3 5 2v4c0 2-2 3-4 3C9 20 4 15 3 7c0-2 1-4 3-4Z" /></svg>Call</a><button type="button" disabled={!selected.phone} title={!selected.phone ? "Add a phone number first" : undefined} onClick={() => setCommunication({ key: "VSL" })}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 20l1-4a8 8 0 1 1 3 3l-4 1Z" /></svg>WhatsApp</button><button type="button" disabled={!selected.email} title={!selected.email ? "Add an email address first" : undefined} onClick={() => setCommunication({ key: "VSL" })}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 5h18v14H3V5Zm0 1 9 7 9-7" /></svg>Email</button></div><span className="meta">Manual compose only</span></footer>
    </aside></div> : null}

    {complimentaryProject ? <div className="lead-drawer-layer"><button className="lead-drawer-backdrop" type="button" onClick={() => setComplimentaryProject(undefined)} aria-label="Close complimentary proposal" /><section className="lead-move-sheet" role="dialog" aria-modal="true" aria-labelledby="complimentary-proposal-title"><span className="eyebrow">Founder-authorised exception</span><h2 id="complimentary-proposal-title">Create INTERNAL_COMPLIMENTARY proposal</h2><p>This uses the existing protected commercial workflow. It records zero fee, zero GST, zero advance and zero payable; it does not create payment or invoice records.</p><dl className="focused-summary"><div><dt>Project</dt><dd>{complimentaryProject.displayName}</dd></div><div><dt>Professional fee</dt><dd>₹0</dd></div><div><dt>GST</dt><dd>₹0</dd></div><div><dt>Total payable</dt><dd>₹0</dd></div><div><dt>Advance</dt><dd>₹0</dd></div></dl><label>Private Founder reason<textarea value={complimentaryReason} onChange={(event) => setComplimentaryReason(event.target.value)} required maxLength={1200} /></label><div className="lead-move-actions"><button type="button" className="button" disabled={complimentaryBusy || !complimentaryReason.trim()} onClick={() => void createComplimentaryProposal()}>{complimentaryBusy ? "Creating proposal…" : "Create complimentary proposal"}</button><button type="button" className="button-secondary" disabled={complimentaryBusy} onClick={() => setComplimentaryProject(undefined)}>Cancel</button></div></section></div> : null}

    {proposalProject ? <div className="lead-drawer-layer"><button className="lead-drawer-backdrop" type="button" onClick={() => setProposalProject(undefined)} aria-label="Close proposal draft" /><section className="lead-move-sheet" role="dialog" aria-modal="true" aria-labelledby="proposal-draft-title"><span className="eyebrow">Converted lead · Founder commercial</span><h2 id="proposal-draft-title">Create editable proposal</h2><p>Set the commercial terms now. The proposal remains a draft until the existing Founder review, approval, artifact and client-acceptance gates complete.</p><label>Commercial type<select value={proposalClassification} onChange={(event) => { const value = event.target.value as typeof proposalClassification; setProposalClassification(value); if (value === "INTERNAL_COMPLIMENTARY") { setProposalFee("0"); setProposalGst("0"); setProposalAdvance("0"); } }}><option value="STANDARD_PAID">PAID</option><option value="SPECIAL_DISCOUNTED">PAID (Founder exception)</option><option value="INTERNAL_COMPLIMENTARY">INTERNAL_COMPLIMENTARY</option></select></label><label>Professional fee (₹)<input inputMode="decimal" value={proposalFee} onChange={(event) => setProposalFee(event.target.value)} /></label><label>GST (%)<input inputMode="decimal" value={proposalGst} onChange={(event) => setProposalGst(event.target.value)} /></label><label>Advance required (₹)<input inputMode="decimal" value={proposalAdvance} onChange={(event) => setProposalAdvance(event.target.value)} /></label>{proposalNeedsReason ? <label>Private Founder reason<textarea value={proposalReason} onChange={(event) => setProposalReason(event.target.value)} required maxLength={1200} /></label> : null}<div className="lead-move-actions"><button type="button" className="button" disabled={proposalBusy} onClick={() => void createEditableProposal()}>{proposalBusy ? "Creating proposal…" : "Create editable proposal"}</button><button type="button" className="button-secondary" disabled={proposalBusy} onClick={() => setProposalProject(undefined)}>Cancel</button></div></section></div> : null}

    {moveOpen && selected ? <div className="lead-move-layer"><button className="lead-drawer-backdrop" type="button" onClick={() => setMoveOpen(false)} aria-label="Cancel move" /><section className="lead-move-sheet" role="dialog" aria-modal="true" aria-labelledby="move-sheet-title"><span className="eyebrow">Confirm canonical transition</span><h2 id="move-sheet-title">Move {selected.name}</h2><p>The card will not move until the server accepts this exact next stage.</p><label>Allowed next stage<select value={target} onChange={(event) => setTarget(event.target.value as CanonicalPipelineStage)}>{proposedTargets.map((stage) => <option key={stage} value={stage}>{stageLabel(stage)}</option>)}</select></label>{!allowedTargets.includes(target) ? <><p className="blocked-note">This grouped move skips canonical stages and will be recorded as an audited administrative correction.</p><label>Correction reason (20–500 characters)<textarea value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} maxLength={500} /></label></> : null}{!terminalStages.has(target) ? <><label>Next action<input value={nextAction} onChange={(event) => setNextAction(event.target.value)} maxLength={500} /></label><label>Future due date<input type="datetime-local" value={dueAt} onInput={(event) => setDueAt(event.currentTarget.value)} onChange={(event) => setDueAt(event.currentTarget.value)} /></label></> : <p className="blocked-note">This terminal transition clears the prior next action.</p>}<div className="lead-move-actions"><button type="button" className="button" disabled={busy || !proposedTargets.length} onClick={() => void saveTransition()}>{busy ? "Saving…" : "Confirm move"}</button><button type="button" className="button-secondary" onClick={() => setMoveOpen(false)} disabled={busy}>Cancel</button></div></section></div> : null}

    <div className="lead-workspace-footer" role={errorKind === "conflict" ? "alert" : "status"} aria-live="polite"><span>{message}{errorKind === "conflict" ? " Your draft remains here; reload before retrying." : ""}</span><button type="button" className="button-secondary" disabled={busy} onClick={() => void refresh(selected?.id)}>{busy ? "Refreshing…" : "Reload"}</button></div>
  </section>{projectScopeOpen && selectedClient && selected?.leadId && state ? <FounderProjectScopeSheet client={selectedClient} leadId={selected.leadId} user={activeUser} revision={state.persistenceRevision} onClose={() => setProjectScopeOpen(false)} onSaved={() => void transitionAfterScope()} /> : null}{openCase && selectedClient && state ? <FounderOpenCaseSheet client={selectedClient} user={activeUser} revision={state.persistenceRevision} onClose={() => setOpenCase(false)} onCreated={() => { setOpenCase(false); void refresh(selected?.id); }} /> : null}{communication && selected ? <LeadCommunicationSheet leadName={selected.name} email={selected.email} phone={selected.phone} templateKey={communication.key} serviceType={communication.serviceType} onClose={() => setCommunication(undefined)} onPrepareContext={prepareCommunicationContext} onPrepare={prepareCommunication} onOpened={markOpened} /> : null}</>;
}
