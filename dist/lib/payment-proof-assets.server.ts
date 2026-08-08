import { access, mkdir, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { join, extname } from "node:path";

const uploadDir = join(process.cwd(), "public", "payment-proofs");

async function ensureUploadDir() {
  try {
    await access(uploadDir, fsConstants.F_OK);
  } catch {
    await mkdir(uploadDir, { recursive: true });
  }

  return uploadDir;
}

export async function savePaymentProofUpload(file: File, key = "advance-proof") {
  const dir = await ensureUploadDir();
  const safeName = String(file.name || `${key}.png`).replace(/[^a-zA-Z0-9._-]/g, "_");
  const ext = extname(safeName) || ".png";
  const fileName = `${key}-${Date.now()}${ext}`;
  const filePath = join(dir, fileName);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  return {
    fileName,
    url: `/payment-proofs/${fileName}`
  };
}
