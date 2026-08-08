import { NextResponse } from "next/server";
import { requireRouteActor } from "@/lib/auth";
import { chartAssetDefinitions } from "@/lib/chart-asset-definitions";
import {
  buildChartFileName,
  findChartDefinition,
  readChartAssetManifest,
  sanitizeFileName,
  writeChartAssetManifest,
  saveChartAssetUpload,
  makeChartAssetUrl
} from "@/lib/chart-assets.server";

export async function GET(request: Request) {
  const access = await requireRouteActor(request, "CONSULTANT");
  if (!access.ok) {
    return access.response;
  }
  const assets = await readChartAssetManifest();
  const uploadedKeys = new Set(assets.map((asset) => asset.key));
  return NextResponse.json({
    assets,
    definitions: chartAssetDefinitions,
    summary: {
      required: chartAssetDefinitions.length,
      uploaded: assets.length,
      pending: chartAssetDefinitions.length - assets.length,
      complete: chartAssetDefinitions.length > 0 && assets.length === chartAssetDefinitions.length,
      missingKeys: chartAssetDefinitions.filter((definition) => !uploadedKeys.has(definition.key)).map((definition) => definition.key)
    }
  });
}

export async function POST(request: Request) {
  const access = await requireRouteActor(request, "CONSULTANT");
  if (!access.ok) {
    return access.response;
  }
  const formData = await request.formData();
  const key = String(formData.get("key") ?? "");
  const file = formData.get("file");

  if (!findChartDefinition(key)) {
    return NextResponse.json({ ok: false, error: "Unknown chart key." }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Missing chart image file." }, { status: 400 });
  }

  const safeName = sanitizeFileName(file.name || `${key}.png`);
  const fileName = buildChartFileName(key as never, safeName);
  await saveChartAssetUpload(fileName, new Uint8Array(await file.arrayBuffer()));

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
