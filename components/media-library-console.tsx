"use client";

import { useState } from "react";
import { buildActionHeaders } from "@/lib/request-helpers";
import { useSession } from "@/components/session-provider";

type ManifestAsset = { key: string; filename: string; title: string; category: string; pageCount: number; sizeBytes: number; checksumSha256: string };

export function MediaLibraryConsole({ assets }: { assets: ManifestAsset[] }) {
  const { activeUser } = useSession();
  const [busyKey, setBusyKey] = useState(""); const [results, setResults] = useState<Record<string,string>>({});
  async function validate(asset: ManifestAsset) {
    setBusyKey(asset.key);
    try {
      const response = await fetch("/api/actions", { method: "POST", headers: buildActionHeaders(activeUser.role), body: JSON.stringify({ action: "founder-media-dry-run", ...asset }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Validation failed.");
      setResults((current) => ({ ...current, [asset.key]: "Hash, size and page count match. No bytes were stored." }));
    } catch (error) { setResults((current) => ({ ...current, [asset.key]: error instanceof Error ? error.message : "Validation failed." })); }
    finally { setBusyKey(""); }
  }
  return <section className="founder-step-surface" aria-labelledby="media-library-title"><header><span className="eyebrow">Founder-only · protected assets</span><h1 id="media-library-title">Media Library</h1><p>Register immutable brochures and qualification forms separately from case evidence and report artifacts.</p></header>
    <div className="workspace-state"><strong>Local dry-run mode</strong><p>These approved metadata records can be checked now. No PDF bytes are uploaded, bundled or exposed in this build.</p></div>
    <div className="media-library-list">{assets.map((asset) => <article key={asset.key}><div><span className="status-pill status-attention">Not ingested</span><h2>{asset.title}</h2><p>{asset.category} · {asset.pageCount} pages · {(asset.sizeBytes / 1024).toFixed(0)} KB</p></div><details><summary>Technical details</summary><p>Filename: {asset.filename}</p><p>Approved SHA-256: {asset.checksumSha256}</p></details><button type="button" className="button-secondary" disabled={busyKey === asset.key} onClick={() => void validate(asset)}>{busyKey === asset.key ? "Validating…" : "Validate manifest (no upload)"}</button>{results[asset.key] ? <p role="status">{results[asset.key]}</p> : null}</article>)}</div>
  </section>;
}
