"use client";

import { useEffect, useState } from "react";

type ManifestAsset = { key: string; filename: string; title: string; category: string; pageCount: number; sizeBytes: number; checksumSha256: string; mimeType: string; widthPixels?: number; heightPixels?: number; hasAlphaChannel?: boolean; brandRole?: string };
type AssetState = { key: string; status: string; version?: number; checksumSha256?: string; brandRole?: string };

export function MediaLibraryConsole({ assets }: { assets: ManifestAsset[] }) {
  const [busyKey, setBusyKey] = useState(""); const [results, setResults] = useState<Record<string,string>>({}); const [states,setStates]=useState<Record<string,AssetState>>({});
  async function refresh() { const response=await fetch("/api/media-library",{cache:"no-store"}); const body=await response.json(); if(response.ok)setStates(Object.fromEntries(body.assets.map((item:AssetState)=>[item.key,item]))); }
  useEffect(()=>{void refresh();},[]);
  async function ingest(asset: ManifestAsset, file?: File) {
    if(!file)return; setBusyKey(asset.key); setResults((current)=>({...current,[asset.key]:"Verifying exact bytes…"}));
    try { const form=new FormData();form.set("assetKey",asset.key);form.set("file",file,file.name);const response=await fetch("/api/media-library",{method:"POST",body:form});const body=await response.json();if(!response.ok)throw new Error(body.error??"Ingestion failed.");setResults((current)=>({...current,[asset.key]:body.replayed?"Exact active version already exists; no duplicate was created.":"Exact bytes stored privately, Founder-approved and activated."}));await refresh(); }
    catch(error){setResults((current)=>({...current,[asset.key]:error instanceof Error?error.message:"Ingestion failed without saving changes."}));}finally{setBusyKey("");}
  }
  return <section className="founder-step-surface" aria-labelledby="media-library-title"><header><span className="eyebrow">Founder-only · protected assets</span><h1 id="media-library-title">Media Library</h1><p>Store exact approved brand, brochure and qualification assets privately. Nothing here creates a public object URL or sends content to a client.</p></header>
    <div className="workspace-state"><strong>Private immutable ingestion</strong><p>Yogesh selects the exact source file. The server verifies filename, MIME signature, byte size and SHA-256 before private R2 storage and activation.</p></div>
    <div className="media-library-list">{assets.map((asset)=>{const state=states[asset.key];const dimensions=asset.widthPixels&&asset.heightPixels?`${asset.widthPixels} × ${asset.heightPixels}px`:"image";return <article key={asset.key}><div><span className={`status-pill ${state?.status==="ACTIVE"?"status-ready":"status-attention"}`}>{state?.status??"NOT INGESTED"}</span><h2>{asset.title}</h2><p>{asset.category} · {asset.mimeType==="application/pdf"?`${asset.pageCount} pages`:dimensions} · {(asset.sizeBytes/1024).toFixed(0)} KB</p>{asset.brandRole?<p className="meta">Approved role: {asset.brandRole.replaceAll("_"," ").toLowerCase()}</p>:null}</div><details><summary>Technical details</summary><p>Filename: {asset.filename}</p><p>Approved SHA-256: {asset.checksumSha256}</p>{asset.mimeType.startsWith("image/")?<p>Original image bytes are retained exactly; derivatives remain separate.</p>:null}{state?.version?<p>Active immutable version: {state.version}</p>:null}</details><label className="button-secondary media-upload-label">{busyKey===asset.key?"Uploading and verifying…":state?.status==="ACTIVE"?"Verify or replay exact file":"Select exact file and activate"}<input type="file" accept={asset.mimeType} disabled={Boolean(busyKey)} onChange={(event)=>{const file=event.currentTarget.files?.[0];void ingest(asset,file);event.currentTarget.value="";}} /></label>{results[asset.key]?<p role="status">{results[asset.key]}</p>:null}</article>})}</div>
  </section>;
}
