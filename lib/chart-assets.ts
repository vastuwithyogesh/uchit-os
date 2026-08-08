import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { join, extname } from "node:path";
import { getRuntimeEnv } from "@/lib/runtime-env";

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

const manifestPath = join(process.cwd(), "data", "chart-assets.json");
const uploadDir = join(process.cwd(), "public", "chart-assets");

async function ensureManifestExists() {
  try {
    await access(manifestPath, fsConstants.F_OK);
  } catch {
    await mkdir(join(process.cwd(), "data"), { recursive: true });
    await writeFile(manifestPath, JSON.stringify([], null, 2), "utf8");
  }
}

export async function readChartAssetManifest(): Promise<ChartAssetRecord[]> {
  await ensureManifestExists();
  const raw = await readFile(manifestPath, "utf8");
  return JSON.parse(raw) as ChartAssetRecord[];
}

export async function writeChartAssetManifest(records: ChartAssetRecord[]) {
  await ensureManifestExists();
  await writeFile(manifestPath, JSON.stringify(records, null, 2), "utf8");
  return records;
}

export async function ensureChartUploadDir() {
  await mkdir(uploadDir, { recursive: true });
  return uploadDir;
}

async function saveChartAssetToR2(fileName: string, bytes: Uint8Array) {
  const env = getRuntimeEnv();
  if (!env.R2) {
    return null;
  }

  await env.R2.put(`chart-assets/${fileName}`, bytes);
  return `/chart-assets/${fileName}`;
}

export function findChartDefinition(key: string) {
  return chartAssetDefinitions.find((item) => item.key === key);
}

export function makeChartAssetUrl(fileName: string) {
  return `/chart-assets/${fileName}`;
}

export function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function buildChartFileName(key: ChartAssetKey, originalName: string) {
  const ext = extname(originalName) || ".png";
  return `${key}-${Date.now()}${ext}`;
}

export async function saveChartAssetUpload(fileName: string, bytes: Uint8Array) {
  const r2Url = await saveChartAssetToR2(fileName, bytes);
  if (r2Url) {
    return { fileName, url: r2Url };
  }

  const dir = await ensureChartUploadDir();
  const filePath = join(dir, fileName);
  await writeFile(filePath, bytes);
  return { fileName, url: makeChartAssetUrl(fileName) };
}
