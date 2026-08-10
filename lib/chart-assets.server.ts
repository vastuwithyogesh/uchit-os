import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { join, extname } from "node:path";
import { chartAssetDefinitions, type ChartAssetKey, type ChartAssetRecord } from "@/lib/chart-asset-definitions";
import { getRuntimeEnv } from "@/lib/runtime-env";

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

function mapChartAssetRecord(record: Record<string, unknown>): ChartAssetRecord {
  return {
    key: String(record.key ?? "") as ChartAssetKey,
    label: String(record.label ?? ""),
    fileName: String(record.fileName ?? record.file_name ?? ""),
    url: String(record.url ?? ""),
    uploadedAt: String(record.uploadedAt ?? record.uploaded_at ?? new Date().toISOString())
  };
}

export async function readChartAssetManifest(): Promise<ChartAssetRecord[]> {
  try {
    await access(manifestPath, fsConstants.F_OK);
    const raw = await readFile(manifestPath, "utf8");
    return (JSON.parse(raw) as Record<string, unknown>[]).map(mapChartAssetRecord);
  } catch {
    // Fall back to the database store if the local manifest is absent.
  }

  const env = getRuntimeEnv();
  if (env.DB) {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS chart_assets (
        key TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        file_name TEXT NOT NULL,
        url TEXT NOT NULL,
        uploaded_at TEXT NOT NULL
      )
    `).run();
    const result = await env.DB.prepare("SELECT key, label, file_name, url, uploaded_at FROM chart_assets ORDER BY uploaded_at DESC").all<Record<string, unknown>>();
    return (result.results ?? []).map(mapChartAssetRecord);
  }
  await ensureManifestExists();
  const raw = await readFile(manifestPath, "utf8");
  return (JSON.parse(raw) as Record<string, unknown>[]).map(mapChartAssetRecord);
}

export async function writeChartAssetManifest(records: ChartAssetRecord[]) {
  const env = getRuntimeEnv();
  if (env.DB) {
    const db = env.DB;
    await db.batch([
      db.prepare(`
        CREATE TABLE IF NOT EXISTS chart_assets (
          key TEXT PRIMARY KEY,
          label TEXT NOT NULL,
          file_name TEXT NOT NULL,
          url TEXT NOT NULL,
          uploaded_at TEXT NOT NULL
        )
      `),
      db.prepare("DELETE FROM chart_assets")
    ]);
    if (records.length > 0) {
      await env.DB.batch(
        records.map((record) =>
          db.prepare("INSERT INTO chart_assets (key, label, file_name, url, uploaded_at) VALUES (?, ?, ?, ?, ?)").bind(
            record.key,
            record.label,
            record.fileName,
            record.url,
            record.uploadedAt
          )
        )
      );
    }
  }
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

export async function saveChartAssetUpload(fileName: string, bytes: Uint8Array) {
  const env = getRuntimeEnv();
  if (env.R2) {
    await env.R2.put(`chart-assets/${fileName}`, bytes);
    return {
      fileName,
      url: `/chart-assets/${fileName}`
    };
  }

  await ensureChartUploadDir();
  const filePath = join(uploadDir, fileName);
  await writeFile(filePath, bytes);
  return {
    fileName,
    url: makeChartAssetUrl(fileName)
  };
}
