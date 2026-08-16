import type { AppUser, ImageOutputFormat, ImageProcessingTaskRecord, MediaAssetVersionRecord } from "./domain.ts";
import {
  completeImageProcessingBatch,
  failImageProcessingTask,
  IMAGE_UTILITY_OUTPUT_MAX_PIXELS,
  IMAGE_UTILITY_SOURCE_MAX_BYTES,
  ImageUtilityError,
  markImageTaskProcessing,
  normalizeImageTransformation,
  prepareImageProcessingBatch,
  prepareImageProcessingRetry,
  prepareImageProcessingTask,
  resolveImageSource,
  commitImageDerivative,
  type PrepareImageTaskInput
} from "./image-utility.ts";
import type { R2BucketBinding, RuntimeEnv } from "./runtime-env.ts";
import type { AppState } from "./store.ts";

const hex = (bytes: Uint8Array) => Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
const checksum = async (bytes: Uint8Array) => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer)));
const mimeFor = (format: ImageOutputFormat) => format === "PNG" ? "image/png" as const : format === "JPEG" ? "image/jpeg" as const : "image/webp" as const;
const extensionFor = (format: ImageOutputFormat) => format === "PNG" ? "png" : format === "JPEG" ? "jpg" : "webp";

async function bytesFromR2(bucket: R2BucketBinding, key: string) {
  const object = await bucket.get(key);
  if (!object) throw new ImageUtilityError("Source image bytes were not found in private storage.", 404);
  return new Uint8Array(await new Response(object.body).arrayBuffer());
}

function safeFilename(source: string, task: ImageProcessingTaskRecord) {
  const stem = source.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "image";
  return `${stem}-${task.transformationType.toLowerCase().replaceAll("_", "-")}-${task.id.slice(-8)}.${extensionFor(task.outputFormat)}`;
}

function imageHasAlpha(raw: Uint8Array) {
  for (let index = 3; index < raw.length; index += 4) if (raw[index] < 255) return true;
  return false;
}

function flattenAlpha(raw: Uint8Array) {
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 4) {
    const alpha = raw[index + 3] / 255;
    output[index] = Math.round(raw[index] * alpha + 255 * (1 - alpha));
    output[index + 1] = Math.round(raw[index + 1] * alpha + 255 * (1 - alpha));
    output[index + 2] = Math.round(raw[index + 2] * alpha + 255 * (1 - alpha));
    output[index + 3] = 255;
  }
  return output;
}

function trimBounds(raw: Uint8Array, width: number, height: number, tolerance: number, alphaThreshold: number) {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const index = (y * width + x) * 4;
    const content = raw[index + 3] > alphaThreshold && (raw[index] < 255 - tolerance || raw[index + 1] < 255 - tolerance || raw[index + 2] < 255 - tolerance);
    if (content) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  }
  return maxX < minX || maxY < minY ? null : { x1: minX, y1: minY, x2: maxX + 1, y2: maxY + 1 };
}

function removeUniformEdgeBackground(raw: Uint8Array, width: number, height: number, tolerance: number) {
  const pixels = width * height;
  if (pixels > 4_000_000) throw new ImageUtilityError("Deterministic edge background removal is limited to 4 megapixels for Worker memory safety.", 413);
  const output = new Uint8Array(raw);
  const visited = new Uint8Array(pixels);
  const queue = new Int32Array(pixels);
  let head = 0, tail = 0;
  const cornerOffsets = [0, (width - 1) * 4, (height - 1) * width * 4, (pixels - 1) * 4];
  const background = [0, 1, 2].map((channel) => Math.round(cornerOffsets.reduce((sum, offset) => sum + raw[offset + channel], 0) / 4));
  const similar = (pixel: number) => {
    const offset = pixel * 4;
    return raw[offset + 3] <= 8 || (Math.abs(raw[offset] - background[0]) <= tolerance
      && Math.abs(raw[offset + 1] - background[1]) <= tolerance && Math.abs(raw[offset + 2] - background[2]) <= tolerance);
  };
  const enqueue = (pixel: number) => { if (!visited[pixel] && similar(pixel)) { visited[pixel] = 1; queue[tail++] = pixel; } };
  for (let x = 0; x < width; x += 1) { enqueue(x); enqueue((height - 1) * width + x); }
  for (let y = 0; y < height; y += 1) { enqueue(y * width); enqueue(y * width + width - 1); }
  while (head < tail) {
    const pixel = queue[head++], x = pixel % width, y = Math.floor(pixel / width); output[pixel * 4 + 3] = 0;
    if (x > 0) enqueue(pixel - 1); if (x + 1 < width) enqueue(pixel + 1);
    if (y > 0) enqueue(pixel - width); if (y + 1 < height) enqueue(pixel + width);
  }
  return output;
}

type PhotonModule = typeof import("@cf-wasm/photon");

async function transformBytes(source: MediaAssetVersionRecord, bytes: Uint8Array, task: ImageProcessingTaskRecord) {
  const photon: PhotonModule = await import("@cf-wasm/photon");
  let image = photon.PhotonImage.new_from_byteslice(bytes);
  const warnings: string[] = [];
  try {
    const sourceWidth = image.get_width(), sourceHeight = image.get_height();
    if (sourceWidth !== source.widthPixels || sourceHeight !== source.heightPixels) {
      throw new ImageUtilityError("Source image dimensions do not match immutable media metadata.", 409);
    }
    const parameters = task.normalizedParameters;
    if (task.transformationType === "CROP") {
      const next = photon.crop(image, Number(parameters.x), Number(parameters.y), Number(parameters.x) + Number(parameters.width), Number(parameters.y) + Number(parameters.height)); image.free(); image = next;
    } else if (task.transformationType === "RESIZE") {
      let width = Number(parameters.width), height = Number(parameters.height);
      if (parameters.preserveAspectRatio !== false) { const scale = Math.min(width / sourceWidth, height / sourceHeight); width = Math.max(1, Math.round(sourceWidth * scale)); height = Math.max(1, Math.round(sourceHeight * scale)); }
      const next = photon.resize(image, width, height, photon.SamplingFilter.Lanczos3); image.free(); image = next;
    } else if (task.transformationType === "UPSCALE") {
      const factor = Number(parameters.factor); const next = photon.resize(image, sourceWidth * factor, sourceHeight * factor, photon.SamplingFilter.Lanczos3); image.free(); image = next;
      warnings.push("Upscale uses deterministic resampling only; it does not reconstruct AI detail.");
    } else if (task.transformationType === "ROTATE") {
      const next = photon.rotate(image, Number(parameters.degrees)); image.free(); image = next;
    } else if (task.transformationType === "BRIGHTNESS") photon.adjust_brightness(image, Number(parameters.amount));
    else if (task.transformationType === "CONTRAST") photon.adjust_contrast(image, Number(parameters.amount));
    else if (task.transformationType === "WHITESPACE_TRIM") {
      const bounds = trimBounds(image.get_raw_pixels(), sourceWidth, sourceHeight, Number(parameters.tolerance), Number(parameters.alphaThreshold));
      if (bounds && (bounds.x1 || bounds.y1 || bounds.x2 !== sourceWidth || bounds.y2 !== sourceHeight)) { const next = photon.crop(image, bounds.x1, bounds.y1, bounds.x2, bounds.y2); image.free(); image = next; }
      else warnings.push(bounds ? "No exterior whitespace was detected." : "The image is blank within the selected tolerance; source bounds were preserved.");
    } else if (task.transformationType === "BACKGROUND_REMOVE") {
      const raw = removeUniformEdgeBackground(image.get_raw_pixels(), sourceWidth, sourceHeight, Number(parameters.tolerance));
      const next = new photon.PhotonImage(raw, sourceWidth, sourceHeight); image.free(); image = next;
      warnings.push("Background removal used deterministic uniform-edge flood fill; complex subjects may require manual review.");
    }
    const width = image.get_width(), height = image.get_height();
    if (width < 1 || height < 1 || width * height > IMAGE_UTILITY_OUTPUT_MAX_PIXELS) throw new ImageUtilityError("Processed output exceeds the 16 megapixel derivative limit.", 413);
    let raw = image.get_raw_pixels(); let hasAlphaChannel = imageHasAlpha(raw);
    if (task.outputFormat === "JPEG" && hasAlphaChannel) {
      raw = flattenAlpha(raw); const next = new photon.PhotonImage(raw, width, height); image.free(); image = next; hasAlphaChannel = false;
      warnings.push("JPEG cannot retain transparency; transparent pixels were flattened onto white.");
    }
    const outputBytes = task.outputFormat === "PNG" ? image.get_bytes() : task.outputFormat === "JPEG" ? image.get_bytes_jpeg(85) : image.get_bytes_webp();
    if (!outputBytes.length) throw new ImageUtilityError("Image processor returned an empty derivative.", 503);
    if (outputBytes.length > IMAGE_UTILITY_SOURCE_MAX_BYTES) throw new ImageUtilityError("Processed derivatives are limited to 5 MB.", 413);
    return { bytes: outputBytes, width, height, hasAlphaChannel, warnings };
  } finally { image.free(); }
}

export async function validateStoredImageVersion(state: AppState, env: RuntimeEnv, actor: AppUser, sourceVersionId: unknown) {
  if (!env.R2) throw new ImageUtilityError("Private R2 storage is required for Image Utility.", 503);
  const source = resolveImageSource(state, actor, sourceVersionId); const bytes = await bytesFromR2(env.R2, source.privateObjectKey);
  if (bytes.length !== source.sizeBytes || await checksum(bytes) !== source.checksumSha256.toUpperCase()) {
    throw new ImageUtilityError("Stored image bytes do not match immutable media metadata.", 409);
  }
  const photon: PhotonModule = await import("@cf-wasm/photon"); const image = photon.PhotonImage.new_from_byteslice(bytes);
  try {
    if (image.get_width() !== source.widthPixels || image.get_height() !== source.heightPixels) throw new ImageUtilityError("Stored image dimensions do not match immutable media metadata.", 409);
  } finally { image.free(); }
  return source;
}

export async function processImageDerivative(state: AppState, env: RuntimeEnv, input: PrepareImageTaskInput) {
  if (!env.R2) throw new ImageUtilityError("Private R2 storage is required for Image Utility.", 503);
  const prepared = prepareImageProcessingTask(state, input);
  if (prepared.replayed || prepared.task.status === "SUCCEEDED") {
    if (prepared.task.status === "SUCCEEDED" && prepared.derivative) {
      const version = state.mediaAssetVersions.find((item) => item.id === prepared.derivative?.outputVersionId);
      if (!version) throw new ImageUtilityError("Completed task media version is missing.", 409);
      await validateStoredImageVersion(state, env, input.actor, version.id);
    }
    return { task: prepared.task, derivative: prepared.derivative,
    version: prepared.derivative ? state.mediaAssetVersions.find((item) => item.id === prepared.derivative?.outputVersionId) : undefined,
    replayed: prepared.replayed, warnings: [] as string[], createdObjectKey: undefined };
  }
  markImageTaskProcessing(state, prepared.task.id, input.actor);
  let objectKey: string | undefined;
  try {
    const sourceBytes = await bytesFromR2(env.R2, prepared.source.privateObjectKey);
    if (sourceBytes.length !== prepared.source.sizeBytes || await checksum(sourceBytes) !== prepared.source.checksumSha256.toUpperCase()) {
      throw new ImageUtilityError("Source image checksum or byte length does not match immutable media metadata.", 409);
    }
    const output = await transformBytes(prepared.source, sourceBytes, prepared.task);
    const outputChecksum = await checksum(output.bytes);
    objectKey = `media/${prepared.source.organisationId}/${prepared.source.assetId}/derivatives/${prepared.task.deduplicationKey.replace(/^sha256:/, "")}.${extensionFor(prepared.task.outputFormat)}`;
    await env.R2.put(objectKey, output.bytes, { httpMetadata: { contentType: mimeFor(prepared.task.outputFormat) }, customMetadata: {
      immutable: "true", checksumSha256: outputChecksum, sourceVersionId: prepared.source.id,
      rootVersionId: state.imageDerivatives.find((item) => item.outputVersionId === prepared.source.id)?.rootVersionId ?? prepared.source.id,
      taskId: prepared.task.id, implementationVersion: prepared.task.implementationVersion
    } });
    const committed = commitImageDerivative(state, { taskId: prepared.task.id, privateObjectKey: objectKey,
      checksumSha256: outputChecksum, sizeBytes: output.bytes.length, widthPixels: output.width, heightPixels: output.height,
      hasAlphaChannel: output.hasAlphaChannel, filename: safeFilename(prepared.source.filename, prepared.task),
      mimeType: mimeFor(prepared.task.outputFormat), actor: input.actor });
    return { ...committed, replayed: false as const, warnings: output.warnings, createdObjectKey: objectKey };
  } catch (error) {
    if (objectKey) await env.R2.delete(objectKey).catch(() => undefined);
    const reason = error instanceof Error ? error.message : "Server-side image processing failed.";
    const task = failImageProcessingTask(state, prepared.task.id, input.actor, reason);
    return { task, derivative: undefined, version: undefined, replayed: false as const, warnings: [] as string[], createdObjectKey: undefined };
  }
}

export async function retryImageDerivative(state: AppState, env: RuntimeEnv, input: { taskId: unknown; idempotencyKey: unknown; expectedRecordVersion: unknown; actor: AppUser }) {
  const prepared = prepareImageProcessingRetry(state, input);
  if (prepared.replayed || prepared.task.status === "SUCCEEDED") {
    if (prepared.task.status === "SUCCEEDED" && prepared.derivative) {
      const version = state.mediaAssetVersions.find((item) => item.id === prepared.derivative?.outputVersionId);
      if (!version) throw new ImageUtilityError("Completed retry media version is missing.", 409);
      await validateStoredImageVersion(state, env, input.actor, version.id);
    }
    return { task: prepared.task, derivative: prepared.derivative,
    version: prepared.derivative ? state.mediaAssetVersions.find((item) => item.id === prepared.derivative?.outputVersionId) : undefined,
    replayed: prepared.replayed, warnings: [] as string[], createdObjectKey: undefined };
  }
  return processPreparedImageTask(state, env, prepared.source, prepared.task, input.actor);
}

async function processPreparedImageTask(state: AppState, env: RuntimeEnv, source: MediaAssetVersionRecord, task: ImageProcessingTaskRecord, actor: AppUser) {
  if (!env.R2) throw new ImageUtilityError("Private R2 storage is required for Image Utility.", 503);
  markImageTaskProcessing(state, task.id, actor); let objectKey: string | undefined;
  try {
    const sourceBytes = await bytesFromR2(env.R2, source.privateObjectKey);
    if (sourceBytes.length !== source.sizeBytes || await checksum(sourceBytes) !== source.checksumSha256.toUpperCase()) throw new ImageUtilityError("Source image checksum or byte length does not match immutable media metadata.", 409);
    const output = await transformBytes(source, sourceBytes, task); const outputChecksum = await checksum(output.bytes);
    objectKey = `media/${source.organisationId}/${source.assetId}/derivatives/${task.deduplicationKey.replace(/^sha256:/, "")}.${extensionFor(task.outputFormat)}`;
    await env.R2.put(objectKey, output.bytes, { httpMetadata: { contentType: mimeFor(task.outputFormat) }, customMetadata: { immutable: "true", checksumSha256: outputChecksum, sourceVersionId: source.id, taskId: task.id, implementationVersion: task.implementationVersion } });
    const committed = commitImageDerivative(state, { taskId: task.id, privateObjectKey: objectKey, checksumSha256: outputChecksum,
      sizeBytes: output.bytes.length, widthPixels: output.width, heightPixels: output.height, hasAlphaChannel: output.hasAlphaChannel,
      filename: safeFilename(source.filename, task), mimeType: mimeFor(task.outputFormat), actor });
    return { ...committed, replayed: false as const, warnings: output.warnings, createdObjectKey: objectKey };
  } catch (error) {
    if (objectKey) await env.R2.delete(objectKey).catch(() => undefined);
    const failed = failImageProcessingTask(state, task.id, actor, error instanceof Error ? error.message : "Server-side image processing failed.");
    return { task: failed, derivative: undefined, version: undefined, replayed: false as const, warnings: [] as string[], createdObjectKey: undefined };
  }
}

export async function processImageBatch(state: AppState, env: RuntimeEnv, input: {
  sourceVersionIds: unknown; transformationType: unknown; parameters: unknown; outputFormat: unknown; purpose: unknown;
  idempotencyKey: unknown; expectedRecordVersion: unknown; actor: AppUser;
}) {
  const prepared = prepareImageProcessingBatch(state, input);
  if (prepared.replayed) {
    return { batch: prepared.batch, tasks: prepared.batch.taskIds.map((id) => state.imageProcessingTasks.find((item) => item.id === id)).filter(Boolean), replayed: true as const, createdObjectKeys: [] as string[] };
  }
  prepared.batch.status = "PROCESSING"; prepared.batch.recordVersion += 1;
  const createdObjectKeys: string[] = [];
  for (let index = 0; index < prepared.batch.sourceVersionIds.length; index += 1) {
    const source = resolveImageSource(state, input.actor, prepared.batch.sourceVersionIds[index]);
    const result = await processImageDerivative(state, env, { sourceVersionId: source.id, transformationType: prepared.batch.transformationType,
      parameters: prepared.batch.normalizedParameters, outputFormat: prepared.batch.outputFormat, purpose: prepared.batch.purpose,
      idempotencyKey: `${prepared.batch.idempotencyKey}:${index + 1}`, expectedRecordVersion: source.recordVersion ?? 0,
      actor: input.actor, batchId: prepared.batch.id });
    prepared.batch.taskIds.push(result.task.id); if (result.createdObjectKey) createdObjectKeys.push(result.createdObjectKey);
  }
  const completed = completeImageProcessingBatch(state, prepared.batch.id, input.actor);
  return { ...completed, replayed: false as const, createdObjectKeys };
}
