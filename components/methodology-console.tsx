"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { methodologyDecisionStatuses, methodologyModules, type MethodologyDecisionStatus, type MethodologyModule } from "@/lib/domain";
import type { AppState } from "@/lib/store";
import { buildActionHeaders } from "@/lib/request-helpers";
import { useSession } from "@/components/session-provider";
import { STAGE_B_AUTHORITY_HASH, STAGE_B_RESOLVER_VERSION } from "@/lib/stage-b-remediation";

type Bootstrap = AppState & { persistenceRevision?: number | null };
class ActionError extends Error { constructor(message: string, readonly status: number) { super(message); } }
const label = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/^./, (letter) => letter.toUpperCase());

export function MethodologyConsole() {
  const { activeUser } = useSession();
  const [state, setState] = useState<Bootstrap | null>(null);
  const [module, setModule] = useState<MethodologyModule>("DIRECTION_32");
  const [versionLabel, setVersionLabel] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [reason, setReason] = useState("");
  const [ruleKey, setRuleKey] = useState("");
  const [sourceReference, setSourceReference] = useState("");
  const [decisionStatus, setDecisionStatus] = useState<MethodologyDecisionStatus>("REVIEW_REQUIRED");
  const [conditionJson, setConditionJson] = useState("{}");
  const [outcomeJson, setOutcomeJson] = useState("{}");
  const [fixtureKey, setFixtureKey] = useState("");
  const [fixtureInput, setFixtureInput] = useState("{}");
  const [fixtureOutput, setFixtureOutput] = useState("{}");
  const [fixtureStatus, setFixtureStatus] = useState<"APPROVED" | "REVIEW_REQUIRED" | "BLOCKED_METHOD_INPUT">("REVIEW_REQUIRED");
  const [message, setMessage] = useState("Loading the methodology register...");
  const [busy, setBusy] = useState(true);
  const keys = useRef<Record<string, string>>({});

  const refresh = useCallback(async () => {
    setBusy(true);
    try { const response = await fetch("/api/bootstrap", { cache: "no-store" }); if (!response.ok) throw new Error("Methodology register could not be loaded."); setState(await response.json()); setMessage("Methodology register is up to date."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Methodology register could not be loaded."); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const versions = useMemo(() => (state?.methodologyVersions ?? []).filter((item) => item.module === module).sort((a, b) => b.version - a.version), [state, module]);
  const draft = versions.find((item) => item.lifecycleStatus === "DRAFT");
  const active = versions.find((item) => item.lifecycleStatus === "ACTIVE");
  const rules = (state?.methodologyRules ?? []).filter((item) => item.methodologyVersionId === draft?.id);
  const fixtures = (state?.methodologyGoldenFixtures ?? []).filter((item) => item.methodologyVersionId === draft?.id);
  const unresolvedRules = rules.filter((item) => item.decisionStatus !== "APPROVED").length;
  const unresolvedFixtures = fixtures.filter((item) => item.decisionStatus !== "APPROVED").length;
  const canPublish = Boolean(draft && rules.length > 0 && fixtures.length > 0 && unresolvedRules === 0 && unresolvedFixtures === 0);
  const stageBAuthorityBound = module !== "STAGE_B_REMEDIAL" || (draft?.sourceAssetHash === STAGE_B_AUTHORITY_HASH && draft.executionAdapterVersion === STAGE_B_RESOLVER_VERSION);

  function key(action: string) { keys.current[action] ??= crypto.randomUUID(); return keys.current[action]; }
  function parseJson(value: string, labelText: string) { try { return JSON.parse(value); } catch { throw new Error(`${labelText} must be valid JSON.`); } }
  async function run(action: string, fields: Record<string, unknown>, expectedRecordVersion: number, success: string) {
    if (!state || state.persistenceRevision === undefined || state.persistenceRevision === null) { setMessage("Reload the register before saving."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/actions", { method: "POST", headers: buildActionHeaders(activeUser.role), body: JSON.stringify({ action, ...fields,
        idempotencyKey: key(action), expectedRecordVersion, expectedRevision: state.persistenceRevision }) });
      const result = await response.json(); if (!response.ok || result.ok === false) throw new ActionError(typeof result.error === "string" ? result.error : "Methodology could not be saved.", response.status);
      delete keys.current[action]; await refresh(); setMessage(success);
    } catch (error) {
      if (error instanceof ActionError && (error.status === 409 || error.status === 428)) setMessage(`${error.message} Reload and review the latest version. Your draft was not silently retried.`);
      else setMessage(error instanceof Error ? error.message : "Methodology could not be saved.");
    } finally { setBusy(false); }
  }

  return <section className="section-grid" aria-labelledby="methodology-title">
    <div className="card span-12"><div className="eyebrow">Methodology control</div><h1 id="methodology-title">Approve rules before the engine uses them</h1><p className="subtle">Missing or uncertain values remain Review Required or Blocked — Methodology Input Required. Publishing locks the register; computation remains blocked until a reviewed deterministic adapter is explicitly bound.</p><div className="field"><label htmlFor="methodology-module">Module</label><select id="methodology-module" value={module} onChange={(event) => setModule(event.target.value as MethodologyModule)}>{methodologyModules.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></div><div className="pill-row"><span className="pill">Active: {active ? `v${active.version} · ${active.label}` : "none"}</span><span className="pill">Adapter: {active?.executionAdapterVersion ?? "not bound"}</span><span className="pill">Draft: {draft ? `v${draft.version}` : "none"}</span><span className="pill">Planetary layer: Deferred</span></div></div>

    {!draft && <div className="card span-12"><div className="eyebrow">Step 1</div><h2>Open a methodology draft</h2><div className="two-col"><div className="field"><label htmlFor="methodology-label">Version label</label><input id="methodology-label" value={versionLabel} onChange={(event) => setVersionLabel(event.target.value)} maxLength={120} /></div><div className="field"><label htmlFor="methodology-source">Source document or register</label><input id="methodology-source" value={sourceLabel} onChange={(event) => setSourceLabel(event.target.value)} maxLength={300} /></div></div><div className="field"><label htmlFor="methodology-reason">Why this version is needed</label><textarea id="methodology-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} /></div><button className="button" type="button" disabled={busy || !versionLabel.trim() || !sourceLabel.trim() || !reason.trim()} onClick={() => void run("methodology-version-create", { module, label: versionLabel, sourceLabel, reason, ...(module === "STAGE_B_REMEDIAL" ? { sourceAssetVersion: "uchit-remedy-report-engine-v5", sourceAssetHash: STAGE_B_AUTHORITY_HASH, executionAdapterVersion: STAGE_B_RESOLVER_VERSION } : {}) }, versions[0]?.recordVersion ?? 0, "Methodology draft opened.")}>Create draft version</button></div>}

    {draft && <><div className="card span-6"><div className="eyebrow">Step 2</div><h2>Add an explicit rule</h2><p className="subtle">Conditions and outcomes are stored exactly as entered. The product does not infer missing values.</p><div className="field"><label htmlFor="rule-key">Stable rule key</label><input id="rule-key" value={ruleKey} onChange={(event) => setRuleKey(event.target.value)} maxLength={120} /></div><div className="field"><label htmlFor="rule-source">Source reference</label><input id="rule-source" value={sourceReference} onChange={(event) => setSourceReference(event.target.value)} maxLength={300} /></div><div className="field"><label htmlFor="rule-status">Decision status</label><select id="rule-status" value={decisionStatus} onChange={(event) => setDecisionStatus(event.target.value as MethodologyDecisionStatus)}>{methodologyDecisionStatuses.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></div><details><summary>Structured rule data</summary><div className="field"><label htmlFor="rule-condition">Condition JSON</label><textarea id="rule-condition" value={conditionJson} onChange={(event) => setConditionJson(event.target.value)} /></div><div className="field"><label htmlFor="rule-outcome">Outcome JSON</label><textarea id="rule-outcome" value={outcomeJson} onChange={(event) => setOutcomeJson(event.target.value)} /></div></details><button className="button" type="button" disabled={busy || !ruleKey.trim() || !sourceReference.trim()} onClick={() => { try { void run("methodology-rule-upsert", { methodologyVersionId: draft.id, ruleKey, sourceReference, decisionStatus, conditionJson: parseJson(conditionJson, "Condition"), outcomeJson: parseJson(outcomeJson, "Outcome") }, draft.recordVersion ?? 0, "Rule saved in the draft."); } catch (error) { setMessage(error instanceof Error ? error.message : "Rule JSON is invalid."); } }}>Save rule</button><p className="meta">{rules.length} rule{rules.length === 1 ? "" : "s"} · {unresolvedRules} unresolved</p></div>

    <div className="card span-6"><div className="eyebrow">Step 3</div><h2>Add a golden fixture</h2><p className="subtle">A fixture proves an approved input must always create the same expected output.</p><div className="field"><label htmlFor="fixture-key">Fixture key</label><input id="fixture-key" value={fixtureKey} onChange={(event) => setFixtureKey(event.target.value)} maxLength={120} /></div><div className="field"><label htmlFor="fixture-status">Fixture status</label><select id="fixture-status" value={fixtureStatus} onChange={(event) => setFixtureStatus(event.target.value as typeof fixtureStatus)}><option value="APPROVED">Approved</option><option value="REVIEW_REQUIRED">Review required</option><option value="BLOCKED_METHOD_INPUT">Blocked — methodology input required</option></select></div><details><summary>Fixture input and expected output</summary><div className="field"><label htmlFor="fixture-input">Input JSON</label><textarea id="fixture-input" value={fixtureInput} onChange={(event) => setFixtureInput(event.target.value)} /></div><div className="field"><label htmlFor="fixture-output">Expected output JSON</label><textarea id="fixture-output" value={fixtureOutput} onChange={(event) => setFixtureOutput(event.target.value)} /></div></details><button className="button" type="button" disabled={busy || !fixtureKey.trim()} onClick={() => { try { void run("methodology-fixture-upsert", { methodologyVersionId: draft.id, fixtureKey, inputJson: parseJson(fixtureInput, "Fixture input"), expectedOutputJson: parseJson(fixtureOutput, "Expected output"), decisionStatus: fixtureStatus }, draft.recordVersion ?? 0, "Golden fixture saved in the draft."); } catch (error) { setMessage(error instanceof Error ? error.message : "Fixture JSON is invalid."); } }}>Save fixture</button><p className="meta">{fixtures.length} fixture{fixtures.length === 1 ? "" : "s"} · {unresolvedFixtures} unresolved</p></div>

    <div className="card span-12"><div className="eyebrow">Step 4</div><h2>Publish an immutable methodology version</h2><p className="subtle">Publication requires every rule and golden fixture to be Approved. The active predecessor is retired, never rewritten. Stage B additionally requires its canonical authority hash, resolver version, and minimum governed evidence.</p>{draft && module === "STAGE_B_REMEDIAL" && !stageBAuthorityBound && <button className="button-secondary" type="button" disabled={busy} onClick={() => void run("methodology-version-authority-bind", { methodologyVersionId: draft.id, sourceAssetVersion: "uchit-remedy-report-engine-v5", sourceAssetHash: STAGE_B_AUTHORITY_HASH, executionAdapterVersion: STAGE_B_RESOLVER_VERSION }, draft.recordVersion ?? 0, "Canonical Stage-B production authority bound to the draft.")}>Bind canonical Stage-B production authority</button>}<div className="field"><label htmlFor="publish-reason">Approval reason</label><textarea id="publish-reason" value={reason} onChange={(event) => setReason(event.target.value)} minLength={20} maxLength={500} /></div><button className="button" type="button" disabled={busy || !canPublish || !stageBAuthorityBound || reason.trim().length < 20} onClick={() => { if (window.confirm("Publish this immutable methodology version? Later changes require a new version.")) void run("methodology-version-publish", { methodologyVersionId: draft.id, reason }, draft.recordVersion ?? 0, "Methodology version published and locked."); }}>Publish approved version</button></div></>}

    <div className="card span-12"><h2>Version history</h2>{versions.length ? <div className="list">{versions.map((item) => <div className="list-item" key={item.id}><strong>v{item.version} · {item.label}</strong><span>{label(item.lifecycleStatus)}</span><span className="meta">Source: {item.sourceLabel} · hash {item.contentHash === "PENDING" ? "pending" : item.contentHash.slice(0, 12)}</span></div>)}</div> : <p className="subtle">No methodology version exists for this module.</p>}<div className="footer-note" role={/could not|blocked|invalid|changed|required/i.test(message) ? "alert" : "status"} aria-live="polite">{message}</div></div>
  </section>;
}
