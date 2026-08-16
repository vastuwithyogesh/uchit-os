"use client";

import { useEffect, useMemo, useState } from "react";
import { chartAssetDefinitions, type ChartAssetRecord } from "@/lib/chart-asset-definitions";

type ChartAssetPayload = {
  assets: ChartAssetRecord[];
  definitions: typeof chartAssetDefinitions;
  summary: {
    required: number;
    uploaded: number;
    pending: number;
    complete: boolean;
    missingKeys: string[];
  };
};

async function fetchAssets() {
  const response = await fetch("/api/chart-assets", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load chart assets");
  }
  return response.json() as Promise<ChartAssetPayload>;
}

export function ChartUploadBoard() {
  const [payload, setPayload] = useState<ChartAssetPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Upload the team’s chart images here.");
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File | null>>({});

  const assetsByKey = useMemo(
    () => Object.fromEntries((payload?.assets ?? []).map((asset) => [asset.key, asset])) as Record<string, ChartAssetRecord | undefined>,
    [payload]
  );

  const missingLabels = useMemo(
    () =>
      (payload?.summary.missingKeys ?? chartAssetDefinitions.map((definition) => definition.key)).map(
        (key) => chartAssetDefinitions.find((definition) => definition.key === key)?.label ?? key
      ),
    [payload]
  );

  async function refresh() {
    setBusy(true);
    try {
      setPayload(await fetchAssets());
      setMessage("Chart assets refreshed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Refresh failed");
    } finally {
      setBusy(false);
    }
  }

  async function uploadAsset(key: string, file: File | null) {
    if (!file) {
      setMessage("Choose an image file first.");
      return;
    }

    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("key", key);
      formData.append("file", file);

      const response = await fetch("/api/chart-assets", {
        method: "POST",
        body: formData
      });

      const result = await response.json();
      if (!response.ok || result.ok === false) {
        throw new Error(result.error ?? "Upload failed");
      }

      setSelectedFiles((current) => ({ ...current, [key]: null }));
      setMessage(`Uploaded ${result.asset.label}.`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refresh().catch(() => undefined);
  }, []);

  return (
    <section className="section-grid">
      <div className="card span-12">
        <div className="eyebrow">Chart uploads</div>
        <h2>Complete the visual chart library for v1 delivery</h2>
        <p className="subtle">
          These uploads feed the report visuals in v1. The summary below keeps the chart set honest and makes it obvious which images still need to be supplied.
        </p>

        <div className="stat-grid" style={{ marginTop: 18 }}>
          <div className="stat-card">
            <span className="stat-value">{payload?.summary.required ?? chartAssetDefinitions.length}</span>
            <span className="stat-label">required chart slots</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{payload?.summary.uploaded ?? 0}</span>
            <span className="stat-label">uploaded visuals</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{payload?.summary.pending ?? chartAssetDefinitions.length}</span>
            <span className="stat-label">still pending</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{payload?.summary.complete ? "Yes" : "No"}</span>
            <span className="stat-label">asset set complete</span>
          </div>
        </div>

        <div className="pill-row" style={{ marginTop: 14 }}>
          <span className={`tag ${payload?.summary.complete ? "good" : "warn"}`}>{payload?.summary.complete ? "Launch-ready visual set" : "Visual set still incomplete"}</span>
          <button className="button-secondary" type="button" onClick={refresh} disabled={busy}>
            Refresh uploads
          </button>
        </div>

        <div className="two-col" style={{ marginTop: 16 }}>
          <div className="panel">
            <div className="panel-head">
              <div>
                <strong>Upload checklist</strong>
                <div className="meta">One image per slot. Replace any chart at any time and the readiness count updates immediately.</div>
              </div>
            </div>
            <div className="list" style={{ marginTop: 14 }}>
              {chartAssetDefinitions.map((definition) => {
                const asset = assetsByKey[definition.key];
                const file = selectedFiles[definition.key];
                return (
                  <div key={definition.key} className="list-item">
                    <strong>{definition.label}</strong>
                    <span className={`tag ${asset ? "good" : "warn"}`}>{asset ? "Uploaded" : "Waiting"}</span>
                    <span className="meta">{asset ? new Date(asset.uploadedAt).toLocaleString() : "No image on file yet"}</span>
                    <div className="workflow" style={{ marginTop: 8 }}>
                      <input
                        type="file"
                        accept="image/*"
                        disabled={busy}
                        onChange={(event) => setSelectedFiles((current) => ({ ...current, [definition.key]: event.target.files?.[0] ?? null }))}
                      />
                      <button
                        type="button"
                        className="button-secondary"
                        disabled={busy || !file}
                        onClick={() => uploadAsset(definition.key, file ?? null)}
                      >
                        {asset ? "Replace image" : "Upload image"}
                      </button>
                    </div>
                    {file ? <span className="pill">Selected: {file.name}</span> : null}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <strong>Asset gallery</strong>
                <div className="meta">Current uploads are shown here so the team can spot gaps quickly.</div>
              </div>
            </div>
            <div className="list" style={{ marginTop: 14 }}>
              {chartAssetDefinitions.map((asset) => {
                const current = assetsByKey[asset.key];
                return (
                  <div key={asset.key} className="list-item">
                    <strong>{asset.label}</strong>
                    <span className={`tag ${current ? "good" : "warn"}`}>{current ? "Ready" : "Pending"}</span>
                    <span className="meta">{current ? current.fileName : "No image uploaded yet"}</span>
                    {current?.url ? (
                      <a href={current.url} className="pill" target="_blank" rel="noreferrer">
                        Open image
                      </a>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div className="panel" style={{ marginTop: 14 }}>
              <strong>Still missing</strong>
              <div className="pill-row" style={{ marginTop: 10 }}>
                {missingLabels.length ? missingLabels.map((label) => <span key={label} className="pill">{label}</span>) : <span className="pill">Nothing missing</span>}
              </div>
            </div>
          </div>
        </div>

        <div className="footer-note">{message}</div>
      </div>
    </section>
  );
}
