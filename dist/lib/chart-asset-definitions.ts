export const chartAssetDefinitions = [
  { key: "location", label: "Location chart" },
  { key: "angular", label: "Angular chart" },
  { key: "brahmsthan", label: "Brahmsthan chart" },
  { key: "marma", label: "Marma chart" },
  { key: "16d", label: "16D chart" },
  { key: "32d", label: "32D chart" },
  { key: "hand-grid", label: "Hand gridded chart" }
] as const;

export type ChartAssetKey = (typeof chartAssetDefinitions)[number]["key"];

export type ChartAssetRecord = {
  key: ChartAssetKey;
  label: string;
  fileName: string;
  url: string;
  uploadedAt: string;
};
