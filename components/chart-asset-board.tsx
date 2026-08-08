"use client";

const chartAssets = [
  { key: "location", label: "Location chart", note: "Team-uploaded image in v1" },
  { key: "angular", label: "Angular chart", note: "Team-uploaded image in v1" },
  { key: "brahmsthan", label: "Brahmsthan chart", note: "Team-uploaded image in v1" },
  { key: "marma", label: "Marma chart", note: "Team-uploaded image in v1" },
  { key: "16d", label: "16D chart", note: "Team-uploaded image in v1" },
  { key: "32d", label: "32D chart", note: "Team-uploaded image in v1" },
  { key: "hand-grid", label: "Hand gridded chart", note: "Team-uploaded image in v1" }
] as const;

export function ChartAssetBoard() {
  return (
    <section className="section-grid">
      <div className="card span-12">
        <div className="eyebrow">Chart assets</div>
        <h2>Image placeholders for v1 uploads</h2>
        <p className="subtle">
          These charts are treated as uploaded images for now. No computed logic is attached yet; the team will drop the source visuals into the workflow during v1.
        </p>
        <div className="two-col" style={{ marginTop: 16 }}>
          {chartAssets.map((asset) => (
            <div key={asset.key} className="panel">
              <div className="panel-head">
                <div>
                  <strong>{asset.label}</strong>
                  <div className="meta">{asset.note}</div>
                </div>
                <span className="tag neutral">Pending upload</span>
              </div>
              <div
                style={{
                  marginTop: 14,
                  minHeight: 180,
                  border: "1px dashed var(--border)",
                  borderRadius: 18,
                  display: "grid",
                  placeItems: "center",
                  background: "rgba(255,255,255,0.03)",
                  color: "var(--muted)"
                }}
              >
                Chart image placeholder
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
