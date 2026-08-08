import { NextResponse } from "next/server";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildChartFileName,
  ensureChartUploadDir,
  findChartDefinition,
  makeChartAssetUrl,
  readChartAssetManifest,
  sanitizeFileName,
  writeChartAssetManifest
} from "@/lib/chart-assets.server";

export async function GET() {
  const assets = await readChartAssetManifest();
  return NextResponse.json({
    assets,
    definitions: assets.length ? undefined : undefined
  });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const key = String(formData.get("key") ?? "");
  const file = formData.get("file");

  if (!findChartDefinition(key)) {
    return NextResponse.json({ ok: false, error: "Unknown chart key." }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Missing chart image file." }, { status: 400 });
  }

  const uploadDir = await ensureChartUploadDir();
  const safeName = sanitizeFileName(file.name || `${key}.png`);
  const fileName = buildChartFileName(key as never, safeName);
  const buffer = Buffer.from(await file.arrayBuffer());
  const filePath = join(uploadDir, fileName);
  await writeFile(filePath, buffer);

  const assets = await readChartAssetManifest();
  const existing = assets.filter((asset) => asset.key !== key);
  const definition = findChartDefinition(key)!;
  const nextRecord = {
    key: definition.key,
    label: definition.label,
    fileName,
    url: makeChartAssetUrl(fileName),
    uploadedAt: new Date().toISOString()
  };

  await writeChartAssetManifest([nextRecord, ...existing]);

  return NextResponse.json({
    ok: true,
    asset: nextRecord
  });
}
