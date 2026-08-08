import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { join, extname } from "node:path";
import { chartAssetDefinitions, type ChartAssetKey, type ChartAssetRecord } from "@/lib/chart-asset-definitions";

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
