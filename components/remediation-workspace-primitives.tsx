"use client";

import { useRef } from "react";
import type { PhysicalPlacementRecord, PlacementImplementationRowRecord } from "@/lib/domain";
import { collisionSafeBox, pointFromRect, type NormalizedBox, type NormalizedPoint } from "@/lib/stage-b-workspace-geometry";

export type PlacementCanvasDraft = { anchor: NormalizedPoint; callout: NormalizedBox };

export function placementCanvasDraft(placement: PhysicalPlacementRecord): PlacementCanvasDraft {
  return { anchor: { x: placement.anchorX, y: placement.anchorY }, callout: { x: placement.calloutX, y: placement.calloutY, width: placement.calloutWidth, height: placement.calloutHeight } };
}

export function PlacementLayer({ draft, name, purpose, layerKey, prior = false, interactive = false, selected = false, masterNumber, occupiedCallouts,
  onSelect, onDraftChange, onInteractionMessage }: { draft: PlacementCanvasDraft; name: string; purpose?: string; layerKey: string; prior?: boolean; interactive?: boolean;
    selected?: boolean; masterNumber?: number; occupiedCallouts: NormalizedBox[]; onSelect?: () => void; onDraftChange?: (draft: PlacementCanvasDraft) => void; onInteractionMessage?: (message: string) => void }) {
  const markerId = `remediation-arrowhead-${layerKey.replace(/[^a-z0-9_-]/gi, "-")}`;
  const dragPointer = useRef<number | null>(null);
  return <div className={`stage-b-placement-layer${prior ? " is-prior" : " is-active"}${selected ? " is-selected-placement" : ""}`} aria-hidden={prior || undefined}>
    <svg className="stage-b-arrow" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><defs><marker id={markerId} markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5 Z" /></marker></defs><line x1={draft.anchor.x * 100} y1={draft.anchor.y * 100} x2={(draft.callout.x + draft.callout.width / 2) * 100} y2={(draft.callout.y + draft.callout.height / 2) * 100} markerEnd={`url(#${markerId})`} /></svg>
    <button className="stage-b-anchor" style={{ left: `${draft.anchor.x * 100}%`, top: `${draft.anchor.y * 100}%` }} aria-label={prior ? undefined : `Locked placement point${masterNumber ? ` ${masterNumber}` : ""}`} tabIndex={prior ? -1 : 0} onClick={prior ? undefined : (event) => { event.stopPropagation(); onSelect?.(); }}><span /></button>
    <div className="stage-b-callout" style={{ left: `${draft.callout.x * 100}%`, top: `${draft.callout.y * 100}%`, width: `${draft.callout.width * 100}%`, height: `${draft.callout.height * 100}%` }}
      onClick={prior ? undefined : (event) => { event.stopPropagation(); onSelect?.(); }} onPointerDown={!interactive ? undefined : (event) => { event.stopPropagation(); dragPointer.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={!interactive ? undefined : (event) => { if (dragPointer.current !== event.pointerId) return; const sheet = event.currentTarget.parentElement?.parentElement?.getBoundingClientRect(); if (!sheet) return;
        const point = pointFromRect(event.clientX, event.clientY, sheet); onDraftChange?.({ ...draft, callout: collisionSafeBox({ ...draft.callout, x: point.x - draft.callout.width / 2, y: point.y - draft.callout.height / 2 }, occupiedCallouts) }); }}
      onPointerUp={!interactive ? undefined : (event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); dragPointer.current = null; }} onPointerCancel={!interactive ? undefined : () => { dragPointer.current = null; }} tabIndex={prior ? -1 : 0} role={prior ? undefined : "button"}
      aria-label={prior ? undefined : `${interactive ? "Movable" : "Saved"} callout${masterNumber ? ` ${masterNumber}` : ""}. ${interactive ? "Use arrow keys to reposition." : "Select for editing."}`}
      onKeyDown={prior ? undefined : (event) => { if (!interactive) { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect?.(); } return; }
        const delta = event.shiftKey ? .02 : .005; let dx = 0; let dy = 0; if (event.key === "ArrowLeft") dx = -delta; else if (event.key === "ArrowRight") dx = delta; else if (event.key === "ArrowUp") dy = -delta; else if (event.key === "ArrowDown") dy = delta; else return;
        event.preventDefault(); onDraftChange?.({ ...draft, callout: collisionSafeBox({ ...draft.callout, x: draft.callout.x + dx, y: draft.callout.y + dy }, occupiedCallouts) }); onInteractionMessage?.("Callout moved inside the printable boundary. Save to keep this position."); }}>
      <strong>{masterNumber ? <span className="stage-b-master-number">{masterNumber}</span> : null}{name}</strong><span>{purpose}</span><small>{prior ? "Completed · locked" : interactive ? "Drag callout · anchor fixed" : "Saved · select to edit"}</small>
    </div>
  </div>;
}

export function PlacementImplementationSheet({ pageLabel, pageState, rows }: { pageLabel: string; pageState: string; rows: PlacementImplementationRowRecord[] }) {
  return <section className="stage-b-implementation-sheet" aria-labelledby="remediation-implementation-title">
    <header><div><div className="eyebrow">Generated page projection</div><h3 id="remediation-implementation-title">{pageLabel} Implementation Sheet</h3></div><span className={pageState === "FINALISED" ? "status-approved" : "status-attention"}>{pageState}</span></header>
    <div className="stage-b-table-scroll"><table><thead><tr><th>Master No.</th><th>Image</th><th>Item/Remedy Name</th><th>Purpose/Attribute</th><th>Location Reference</th><th>Implemented</th><th>Date</th><th>Alternative Needed</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.masterNumber}</strong></td><td><span className="stage-b-table-thumb" aria-label="Immutable image snapshot">IMG</span></td><td>{row.itemNameSnapshot}</td><td>{row.attributePurposeSnapshot}</td><td>{row.locationReference ?? ""}</td><td aria-label="Implemented blank field">________</td><td aria-label="Date blank field">________</td><td aria-label="Alternative Needed blank field">________</td></tr>)}{!rows.length && <tr><td colSpan={8}>No physical placements are projected for this page.</td></tr>}</tbody>
    </table></div><p className="stage-b-projection-note">Implemented, Date and Alternative Needed remain blank client-facing fields. They are not consultant workflow state.</p>
  </section>;
}
