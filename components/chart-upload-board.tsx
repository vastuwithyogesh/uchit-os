"use client";

import { useEffect, useMemo, useState } from "react";
import { chartAssetDefinitions, type ChartAssetRecord } from "@/lib/chart-asset-definitions";

type ChartAssetPayload = {
  assets: ChartAssetRecord[];
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
        <h2>Drop the team’s image files into each chart slot</h2>
        <p className="subtle">
          These uploads are stored locally and reused by the app. No chart logic is attached yet; we’re just wiring the image pipeline for v1.
        </p>
        <button className="button-secondary" type="button" onClick={refresh} disabled={busy} style={{ marginTop: 12 }}>
          Refresh uploads
        </button>
        <div className="two-col" style={{ marginTop: 16 }}>
          {chartAssetDefinitions.map((asset) => (
            <div key={asset.key} className="panel">
              <div className="panel-head">
                <div>
                  <strong>{asset.label}</strong>
                  <div className="meta">{assetsByKey[asset.key]?.uploadedAt ? `Uploaded ${new Date(assetsByKey[asset.key]!.uploadedAt).toLocaleString()}` : "Waiting for upload"}</div>
                </div>
                <span className={`tag ${assetsByKey[asset.key] ? "good" : "warn"}`}>{assetsByKey[asset.key] ? "Ready" : "Pending"}</span>
              </div>
              {assetsByKey[asset.key]?.url ? (
                <img
                  src={assetsByKey[asset.key]!.url}
                  alt={asset.label}
                  style={{ width: "100%", marginTop: 12, borderRadius: 16, border: "1px solid var(--border)" }}
                />
              ) : (
                <div
                  style={{
                    marginTop: 12,
                    minHeight: 180,
                    border: "1px dashed var(--border)",
                    borderRadius: 16,
                    display: "grid",
                    placeItems: "center",
                    color: "var(--muted)"
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
