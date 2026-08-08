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

  const assetsByKey = useMemo(
    () =>
      Object.fromEntries((payload?.assets ?? []).map((asset) => [asset.key, asset])) as Record<string, ChartAssetRecord | undefined>,
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
          These uploads feed the report visuals in v1. The summary below helps us see instantly whether the chart set is complete enough for the team to operate without gaps.
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

        {!payload?.summary.complete ? (
          <div className="panel" style={{ marginTop: 16 }}>
            <div className="panel-head">
              <div>
                <strong>Still missing</strong>
                <div className="meta">These chart slots still need a source visual before the upload set is complete.</div>
              </div>
            </div>
            <div className="pill-row" style={{ marginTop: 12 }}>
              {(payload?.summary.missingKeys ?? chartAssetDefinitions.map((definition) => definition.key)).map((key) => (
                <span key={key} className="pill">
                  {chartAssetDefinitions.find((definition) => definition.key === key)?.label ?? key}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div className="two-col" style={{ marginTop: 16 }}>
          {chartAssetDefinitions.map((asset) => (
            <div key={asset.key} className="panel">
              <div className="panel-head">
                <div>
                  <strong>{asset.label}</strong>
                  <div className="meta">
                    {assetsByKey[asset.key]?.uploadedAt ? `Uploaded ${new Date(assetsByKey[asset.key]!.uploadedAt).toLocaleString()}` : "Waiting for first upload"}
                  </div>
                </div>
                <span className={`tag ${assetsByKey[asset.key] ? "good" : "warn"}`}>{assetsByKey[asset.key] ? "Ready" : "Pending"}</span>
              </div>

              {assetsByKey[asset.key]?.url ? (
                <img
                  src={assetsByKey[asset.key]!.url}
                  alt={asset.label}
                  style={{ width: "100%", marginTop: 12, borderRadius: 16, border: "1px solid var(--line)" }}
                />
              ) : (
                <div
                  style={{
                    marginTop: 12,
                    minHeight: 180,
                    border: "1px dashed var(--line-strong)",
                    borderRadius: 16,
                    display: "grid",
                    placeItems: "center",
                    padding: 20,
                    color: "var(--muted)",
                    background: "rgba(255,255,255,0.54)",
                    textAlign: "center"
                  }}
                >
                  No image uploaded yet
                </div>
              )}

              <div className="field" style={{ marginTop: 12 }}>
                <label>Upload image</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => uploadAsset(asset.key, event.target.files?.[0] ?? null)}
                  disabled={busy}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="footer-note">{message}</div>
      </div>
    </section>
  );
}
