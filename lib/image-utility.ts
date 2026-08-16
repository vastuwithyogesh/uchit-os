import type {
  AppUser,
  ImageDerivativePurpose,
  ImageDerivativeRecord,
  ImageOutputFormat,
  ImageProcessingBatchRecord,
  ImageProcessingTaskRecord,
  ImageTransformationParameters,
  ImageTransformationType,
  ImageUtilityAuditEventRecord,
  MediaAssetVersionRecord
} from "./domain.ts";
import { imageTransformationTypes } from "./domain.ts";
import { deterministicContentHash } from "./evaluation-provenance.ts";
import type { AppState } from "./store.ts";

export const IMAGE_UTILITY_IMPLEMENTATION_VERSION = "uchit-image-photon/v1";
export const IMAGE_UTILITY_SOURCE_MAX_BYTES = 5 * 1024 * 1024;
export const IMAGE_UTILITY_SOURCE_MAX_PIXELS = 20_000_000;
export const IMAGE_UTILITY_OUTPUT_MAX_PIXELS = 16_000_000;
export const IMAGE_UTILITY_BATCH_MAX_ITEMS = 8;
export const IMAGE_UTILITY_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export class ImageUtilityError extends Error {
  readonly statusCode: 400 | 403 | 404 | 409 | 413 | 428 | 503;
  constructor(message: string, statusCode: ImageUtilityError["statusCode"] = 400) {
    super(message);
    this.name = "ImageUtilityError";
    this.statusCode = statusCode;
  }
}

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
const isAdmin = (actor: AppUser) => actor.role === "ADMIN" || actor.role === "SUPER_ADMIN";

function organisation(actor: AppUser) {
  if (!actor.organisationId) throw new ImageUtilityError("An active organisation is required.", 403);
  return actor.organisationId;
}

export function assertImageUtilityAdmin(actor: AppUser) {
  if (!isAdmin(actor)) throw new ImageUtilityError("Image Utility requires an existing Admin or Super-Admin role.", 403);
  return organisation(actor);
}

function safeText(value: unknown, label: string, max = 180) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max || /[\u0000-\u001f\u007f<>]/.test(value)) {
    throw new ImageUtilityError(`${label} is required and must be safe text up to ${max} characters.`);
  }
  return value.trim();
}

function integer(value: unknown, label: string, minimum: number, maximum: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new ImageUtilityError(`${label} must be a whole number from ${minimum} to ${maximum}.`);
  }
  return parsed;
}

function decimal(value: unknown, label: string, minimum: number, maximum: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new ImageUtilityError(`${label} must be from ${minimum} to ${maximum}.`);
  }
  return Number(parsed.toFixed(4));
}

function exactVersion(record: { recordVersion?: number }, supplied: unknown, label: string) {
  if (!Number.isInteger(supplied) || Number(supplied) < 0) throw new ImageUtilityError(`The latest ${label} version is required.`, 428);
  if ((record.recordVersion ?? 0) !== Number(supplied)) throw new ImageUtilityError(`The ${label} changed. Refresh and try again.`, 409);
}

export function resolveImageSource(state: AppState, actor: AppUser, sourceVersionId: unknown) {
  const org = assertImageUtilityAdmin(actor);
  const idValue = safeText(sourceVersionId, "Source image version ID");
  const source = state.mediaAssetVersions.find((item) => item.id === idValue && item.organisationId === org);
  if (!source || !IMAGE_UTILITY_IMAGE_MIME_TYPES.includes(source.mimeType as (typeof IMAGE_UTILITY_IMAGE_MIME_TYPES)[number])) {
    throw new ImageUtilityError("Approved source image version was not found.", 404);
  }
  if (!(["FOUNDER_APPROVED", "ACTIVE"] as const).includes(source.status as "FOUNDER_APPROVED" | "ACTIVE")) {
    throw new ImageUtilityError("Only an approved immutable image version can be processed.", 409);
  }
  if (!source.privateObjectKey || !source.checksumSha256) throw new ImageUtilityError("Source image storage provenance is incomplete.", 409);
  if (source.sizeBytes <= 0 || source.sizeBytes > IMAGE_UTILITY_SOURCE_MAX_BYTES) {
    throw new ImageUtilityError("Source images are limited to 5 MB.", 413);
  }
  if (!source.widthPixels || !source.heightPixels || source.widthPixels * source.heightPixels > IMAGE_UTILITY_SOURCE_MAX_PIXELS) {
    throw new ImageUtilityError("Source image dimensions are missing or exceed the 20 megapixel processing limit.", 413);
  }
  return source;
}

function parseTransformation(value: unknown): ImageTransformationType {
  const parsed = safeText(value, "Transformation type", 40) as ImageTransformationType;
  if (!imageTransformationTypes.includes(parsed)) throw new ImageUtilityError("Transformation type is not supported.");
  return parsed;
}

function parseFormat(value: unknown): ImageOutputFormat {
  const parsed = safeText(value, "Output format", 10).toUpperCase() as ImageOutputFormat;
  if (!( ["PNG", "JPEG", "WEBP"] as const).includes(parsed)) throw new ImageUtilityError("Output format must be PNG, JPEG or WEBP.");
  return parsed;
}

function parsePurpose(value: unknown): ImageDerivativePurpose {
  const parsed = safeText(value, "Derivative purpose", 30) as ImageDerivativePurpose;
  if (!( ["CANONICAL", "WEB_EDITOR", "PRINT_REPORT"] as const).includes(parsed)) throw new ImageUtilityError("Derivative purpose is not supported.");
  return parsed;
}

export function normalizeImageTransformation(
  source: MediaAssetVersionRecord,
  transformationTypeValue: unknown,
  rawParameters: unknown,
  outputFormatValue: unknown
) {
  const transformationType = parseTransformation(transformationTypeValue);
  const outputFormat = parseFormat(outputFormatValue);
  const input = rawParameters && typeof rawParameters === "object" && !Array.isArray(rawParameters)
    ? rawParameters as Record<string, unknown> : {};
  let parameters: ImageTransformationParameters;
  let projectedWidth = source.widthPixels!;
  let projectedHeight = source.heightPixels!;

  switch (transformationType) {
    case "CROP": {
      const x = integer(input.x, "Crop X", 0, source.widthPixels! - 1);
      const y = integer(input.y, "Crop Y", 0, source.heightPixels! - 1);
      const width = integer(input.width, "Crop width", 1, source.widthPixels! - x);
      const height = integer(input.height, "Crop height", 1, source.heightPixels! - y);
      parameters = { x, y, width, height }; projectedWidth = width; projectedHeight = height; break;
    }
    case "RESIZE": {
      const width = integer(input.width, "Resize width", 1, 8192);
      const height = integer(input.height, "Resize height", 1, 8192);
      const preserveAspectRatio = input.preserveAspectRatio !== false;
      if (preserveAspectRatio) {
        const scale = Math.min(width / source.widthPixels!, height / source.heightPixels!);
        projectedWidth = Math.max(1, Math.round(source.widthPixels! * scale));
        projectedHeight = Math.max(1, Math.round(source.heightPixels! * scale));
      } else { projectedWidth = width; projectedHeight = height; }
      parameters = { width, height, preserveAspectRatio }; break;
    }
    case "UPSCALE": {
      const factor = integer(input.factor, "Upscale factor", 2, 4);
      if (factor !== 2 && factor !== 4) throw new ImageUtilityError("Upscale factor must be 2 or 4.");
      parameters = { factor, mode: "DETERMINISTIC_RESAMPLE_NOT_AI" };
      projectedWidth *= factor; projectedHeight *= factor; break;
    }
    case "ROTATE": {
      const degrees = decimal(input.degrees, "Rotation", -180, 180);
      parameters = { degrees }; if (Math.abs(degrees) % 180 === 90) [projectedWidth, projectedHeight] = [projectedHeight, projectedWidth]; break;
    }
    case "BRIGHTNESS": parameters = { amount: integer(input.amount, "Brightness", -100, 100) }; break;
    case "CONTRAST": parameters = { amount: integer(input.amount, "Contrast", -100, 100) }; break;
    case "WHITESPACE_TRIM": parameters = { tolerance: integer(input.tolerance ?? 8, "Whitespace tolerance", 0, 32), alphaThreshold: integer(input.alphaThreshold ?? 8, "Alpha threshold", 0, 64) }; break;
    case "TYPE_CONVERT": parameters = { outputFormat }; break;
    case "BACKGROUND_REMOVE": {
      if (outputFormat === "JPEG") throw new ImageUtilityError("Background removal requires PNG or WebP so transparency can be preserved.");
      parameters = { tolerance: integer(input.tolerance ?? 24, "Background tolerance", 0, 64), mode: "UNIFORM_EDGE_FLOOD_FILL" }; break;
    }
  }
  if (projectedWidth * projectedHeight > IMAGE_UTILITY_OUTPUT_MAX_PIXELS) {
    throw new ImageUtilityError("Requested output exceeds the 16 megapixel derivative limit.", 413);
  }
  return { transformationType, outputFormat, parameters, projectedWidth, projectedHeight };
}

function requestIdentity(input: {
  source: MediaAssetVersionRecord; transformationType: ImageTransformationType; parameters: ImageTransformationParameters;
  outputFormat: ImageOutputFormat; purpose: ImageDerivativePurpose;
}) {
  const operation = { sourceVersionId: input.source.id, sourceChecksumSha256: input.source.checksumSha256,
    transformationType: input.transformationType, parameters: input.parameters, outputFormat: input.outputFormat,
    purpose: input.purpose, implementationVersion: IMAGE_UTILITY_IMPLEMENTATION_VERSION };
  return { requestHash: deterministicContentHash(operation), deduplicationKey: deterministicContentHash({ ...operation, purpose: undefined }) };
}

function audit(state: AppState, actor: AppUser, input: {
  action: string; sourceVersionId: string; derivativeId?: string; taskId?: string; batchId?: string;
  summary: string; reason: string; idempotencyKey?: string; requestHash?: string; before?: unknown; after?: unknown;
}) {
  const event: ImageUtilityAuditEventRecord = {
    id: id("image-audit"), organisationId: organisation(actor), createdByActorUserId: actor.id,
    updatedByActorUserId: actor.id, recordVersion: 1, action: input.action, sourceVersionId: input.sourceVersionId,
    ...(input.derivativeId ? { derivativeId: input.derivativeId } : {}), ...(input.taskId ? { taskId: input.taskId } : {}),
    ...(input.batchId ? { batchId: input.batchId } : {}), actorUserId: actor.id, actorRole: actor.role,
    transformationSummary: input.summary, reason: input.reason, occurredAt: now(),
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    ...(input.requestHash ? { requestHash: input.requestHash } : {}),
    ...(input.before === undefined ? {} : { beforeHash: deterministicContentHash(input.before) }),
    ...(input.after === undefined ? {} : { afterHash: deterministicContentHash(input.after) })
  };
  state.imageUtilityAuditEvents.unshift(event);
  return event;
}

export type PrepareImageTaskInput = {
  sourceVersionId: unknown; transformationType: unknown; parameters: unknown; outputFormat: unknown; purpose: unknown;
  idempotencyKey: unknown; expectedRecordVersion: unknown; actor: AppUser; batchId?: string; retryOfTaskId?: string; attempt?: number;
};

export function prepareImageProcessingTask(state: AppState, input: PrepareImageTaskInput) {
  const org = assertImageUtilityAdmin(input.actor);
  const source = resolveImageSource(state, input.actor, input.sourceVersionId);
  exactVersion(source, input.expectedRecordVersion, "source image");
  const normalized = normalizeImageTransformation(source, input.transformationType, input.parameters, input.outputFormat);
  const purpose = parsePurpose(input.purpose);
  const key = safeText(input.idempotencyKey, "Idempotency key");
  const identity = requestIdentity({ source, transformationType: normalized.transformationType, parameters: normalized.parameters,
    outputFormat: normalized.outputFormat, purpose });
  const replay = state.imageProcessingTasks.find((item) => item.organisationId === org && item.idempotencyKey === key);
  if (replay) {
    if (replay.requestHash !== identity.requestHash) throw new ImageUtilityError("This idempotency key was already used with different image-processing inputs.", 409);
    return { source, task: replay, derivative: state.imageDerivatives.find((item) => item.id === replay.derivativeId), replayed: true as const, normalized };
  }
  const available = state.imageDerivatives.find((item) => item.organisationId === org && item.deduplicationKey === identity.deduplicationKey && item.status === "AVAILABLE");
  const task: ImageProcessingTaskRecord = {
    id: id("image-task"), organisationId: org, createdByActorUserId: input.actor.id, updatedByActorUserId: input.actor.id,
    sourceVersionId: source.id, sourceAssetId: source.assetId, transformationType: normalized.transformationType,
    normalizedParameters: normalized.parameters, outputFormat: normalized.outputFormat, purpose,
    implementationVersion: IMAGE_UTILITY_IMPLEMENTATION_VERSION, status: available ? "SUCCEEDED" : "QUEUED",
    attempt: input.attempt ?? 1, ...(available ? { derivativeId: available.id, completedAt: now() } : {}),
    ...(input.batchId ? { batchId: input.batchId } : {}), ...(input.retryOfTaskId ? { retryOfTaskId: input.retryOfTaskId } : {}),
    requestedAt: now(), requestedByActorUserId: input.actor.id, idempotencyKey: key,
    requestHash: identity.requestHash, deduplicationKey: identity.deduplicationKey, recordVersion: 1
  };
  state.imageProcessingTasks.unshift(task);
  audit(state, input.actor, { action: available ? "DERIVATIVE_DEDUPLICATED" : input.retryOfTaskId ? "PROCESSING_TASK_RETRY_QUEUED" : "PROCESSING_TASK_QUEUED", sourceVersionId: source.id,
    derivativeId: available?.id, taskId: task.id, batchId: input.batchId, summary: `${task.transformationType} -> ${task.outputFormat}`,
    reason: available ? "An identical available immutable derivative was reused." : "Server-side immutable derivative processing queued.",
    idempotencyKey: task.idempotencyKey, requestHash: task.requestHash, after: task });
  return { source, task, derivative: available, replayed: false as const, normalized };
}

export function markImageTaskProcessing(state: AppState, taskId: string, actor: AppUser) {
  const task = state.imageProcessingTasks.find((item) => item.id === taskId && item.organisationId === organisation(actor));
  if (!task) throw new ImageUtilityError("Image-processing task was not found.", 404);
  if (task.status !== "QUEUED") return task;
  task.status = "PROCESSING"; task.startedAt = now(); task.updatedByActorUserId = actor.id; task.recordVersion += 1;
  return task;
}

function sourceRoot(state: AppState, sourceVersionId: string, org: string) {
  const parent = state.imageDerivatives.find((item) => item.organisationId === org && item.outputVersionId === sourceVersionId);
  return parent?.rootVersionId ?? sourceVersionId;
}

export function commitImageDerivative(state: AppState, input: {
  taskId: string; privateObjectKey: string; checksumSha256: string; sizeBytes: number; widthPixels: number;
  heightPixels: number; hasAlphaChannel: boolean; filename: string; mimeType: "image/png" | "image/jpeg" | "image/webp";
  actor: AppUser;
}) {
  const org = assertImageUtilityAdmin(input.actor);
  const task = state.imageProcessingTasks.find((item) => item.id === input.taskId && item.organisationId === org);
  if (!task) throw new ImageUtilityError("Image-processing task was not found.", 404);
  if (task.status === "SUCCEEDED" && task.derivativeId) {
    const derivative = state.imageDerivatives.find((item) => item.id === task.derivativeId);
    if (!derivative) throw new ImageUtilityError("Completed task derivative provenance is missing.", 409);
    return { task, derivative, version: state.mediaAssetVersions.find((item) => item.id === derivative.outputVersionId) };
  }
  if (task.status !== "PROCESSING") throw new ImageUtilityError("Only a processing task can commit a derivative.", 409);
  if (!/^[A-F0-9]{64}$/.test(input.checksumSha256) || input.sizeBytes <= 0 || !input.privateObjectKey) {
    throw new ImageUtilityError("Server-produced derivative metadata is invalid.", 409);
  }
  if (input.widthPixels <= 0 || input.heightPixels <= 0 || input.widthPixels * input.heightPixels > IMAGE_UTILITY_OUTPUT_MAX_PIXELS) {
    throw new ImageUtilityError("Server-produced derivative dimensions exceed the output limit.", 413);
  }
  const source = state.mediaAssetVersions.find((item) => item.id === task.sourceVersionId && item.organisationId === org);
  if (!source) throw new ImageUtilityError("Source image version was not found during commit.", 404);
  const existingVersions = state.mediaAssetVersions.filter((item) => item.assetId === source.assetId && item.organisationId === org);
  const versionNumber = Math.max(0, ...existingVersions.map((item) => item.version)) + 1;
  const outputVersionId = id("media-version");
  const uploadedAt = now();
  const version: MediaAssetVersionRecord = {
    id: outputVersionId, organisationId: org, createdByActorUserId: input.actor.id, updatedByActorUserId: input.actor.id, recordVersion: 1,
    assetId: source.assetId, version: versionNumber, filename: input.filename, privateObjectKey: input.privateObjectKey,
    mimeType: input.mimeType, sizeBytes: input.sizeBytes, checksumSha256: input.checksumSha256, pageCount: 1,
    status: "FOUNDER_APPROVED", clientSendable: source.clientSendable, widthPixels: input.widthPixels,
    heightPixels: input.heightPixels, hasAlphaChannel: input.hasAlphaChannel, uploadedByActorUserId: input.actor.id,
    uploadedAt, approvedByActorUserId: input.actor.id, approvedAt: uploadedAt, supersedesVersionId: source.id,
    reason: `immutable-image-derivative:${task.id}`, registrationHash: deterministicContentHash({ taskId: task.id, checksumSha256: input.checksumSha256, privateObjectKey: input.privateObjectKey })
  };
  const derivative: ImageDerivativeRecord = {
    id: id("image-derivative"), organisationId: org, createdByActorUserId: input.actor.id, updatedByActorUserId: input.actor.id,
    sourceVersionId: source.id, parentVersionId: source.id, rootVersionId: sourceRoot(state, source.id, org),
    outputAssetId: source.assetId, outputVersionId, taskId: task.id, transformationType: task.transformationType,
    normalizedParameters: task.normalizedParameters, implementationVersion: task.implementationVersion,
    purpose: task.purpose, outputFormat: task.outputFormat, outputMimeType: input.mimeType,
    widthPixels: input.widthPixels, heightPixels: input.heightPixels, hasAlphaChannel: input.hasAlphaChannel,
    checksumSha256: input.checksumSha256, sizeBytes: input.sizeBytes, deduplicationKey: task.deduplicationKey,
    status: "AVAILABLE", createdAt: uploadedAt, recordVersion: 1
  };
  state.mediaAssetVersions.unshift(version); state.imageDerivatives.unshift(derivative);
  task.status = "SUCCEEDED"; task.derivativeId = derivative.id; task.completedAt = uploadedAt;
  task.updatedByActorUserId = input.actor.id; task.recordVersion += 1;
  audit(state, input.actor, { action: "DERIVATIVE_COMMITTED", sourceVersionId: source.id, derivativeId: derivative.id,
    taskId: task.id, batchId: task.batchId, summary: `${task.transformationType} -> ${task.outputFormat}`,
    reason: "Immutable server-produced derivative committed with checksum and lineage.", idempotencyKey: task.idempotencyKey,
    requestHash: task.requestHash, after: derivative });
  return { task, derivative, version };
}

export function failImageProcessingTask(state: AppState, taskId: string, actor: AppUser, reason: string) {
  const task = state.imageProcessingTasks.find((item) => item.id === taskId && item.organisationId === organisation(actor));
  if (!task) throw new ImageUtilityError("Image-processing task was not found.", 404);
  if (task.status === "SUCCEEDED") return task;
  task.status = "FAILED"; task.errorReason = reason.slice(0, 500); task.completedAt = now();
  task.updatedByActorUserId = actor.id; task.recordVersion += 1;
  audit(state, actor, { action: "PROCESSING_TASK_FAILED", sourceVersionId: task.sourceVersionId, taskId: task.id,
    batchId: task.batchId, summary: `${task.transformationType} -> ${task.outputFormat}`, reason: task.errorReason, after: task });
  return task;
}

export function prepareImageProcessingRetry(state: AppState, input: { taskId: unknown; idempotencyKey: unknown; expectedRecordVersion: unknown; actor: AppUser }) {
  const org = assertImageUtilityAdmin(input.actor);
  const original = state.imageProcessingTasks.find((item) => item.id === safeText(input.taskId, "Task ID") && item.organisationId === org);
  if (!original) throw new ImageUtilityError("Image-processing task was not found.", 404);
  exactVersion(original, input.expectedRecordVersion, "image-processing task");
  if (original.status !== "FAILED") throw new ImageUtilityError("Only a failed image-processing task can be retried.", 409);
  const source = state.mediaAssetVersions.find((item) => item.id === original.sourceVersionId && item.organisationId === org);
  if (!source) throw new ImageUtilityError("Retry source image was not found.", 404);
  return prepareImageProcessingTask(state, { sourceVersionId: source.id, transformationType: original.transformationType,
    parameters: original.normalizedParameters, outputFormat: original.outputFormat, purpose: original.purpose,
    idempotencyKey: input.idempotencyKey, expectedRecordVersion: source.recordVersion ?? 0, actor: input.actor,
    retryOfTaskId: original.id, attempt: original.attempt + 1, ...(original.batchId ? { batchId: original.batchId } : {}) });
}

export function prepareImageProcessingBatch(state: AppState, input: {
  sourceVersionIds: unknown; transformationType: unknown; parameters: unknown; outputFormat: unknown; purpose: unknown;
  idempotencyKey: unknown; expectedRecordVersion: unknown; actor: AppUser;
}) {
  const org = assertImageUtilityAdmin(input.actor);
  if (!Array.isArray(input.sourceVersionIds) || input.sourceVersionIds.length < 1 || input.sourceVersionIds.length > IMAGE_UTILITY_BATCH_MAX_ITEMS
    || input.sourceVersionIds.some((item) => typeof item !== "string" || !item.trim())) {
    throw new ImageUtilityError(`Batch processing requires 1 to ${IMAGE_UTILITY_BATCH_MAX_ITEMS} source image version IDs.`);
  }
  const sourceVersionIds = [...new Set(input.sourceVersionIds.map((item) => String(item).trim()))];
  if (sourceVersionIds.length !== input.sourceVersionIds.length) throw new ImageUtilityError("Batch source image versions must be unique.");
  if (!Number.isInteger(input.expectedRecordVersion) || Number(input.expectedRecordVersion) !== 0) {
    throw new ImageUtilityError("A new image-processing batch requires expectedRecordVersion 0.", 428);
  }
  const firstSource = resolveImageSource(state, input.actor, sourceVersionIds[0]);
  const normalized = normalizeImageTransformation(firstSource, input.transformationType, input.parameters, input.outputFormat);
  const purpose = parsePurpose(input.purpose); const key = safeText(input.idempotencyKey, "Idempotency key");
  const requestHash = deterministicContentHash({ sourceVersionIds, transformationType: normalized.transformationType,
    parameters: normalized.parameters, outputFormat: normalized.outputFormat, purpose, implementationVersion: IMAGE_UTILITY_IMPLEMENTATION_VERSION });
  const replay = state.imageProcessingBatches.find((item) => item.organisationId === org && item.idempotencyKey === key);
  if (replay) {
    if (replay.requestHash !== requestHash) throw new ImageUtilityError("This idempotency key was already used with different batch inputs.", 409);
    return { batch: replay, replayed: true as const };
  }
  for (const sourceVersionId of sourceVersionIds) resolveImageSource(state, input.actor, sourceVersionId);
  const batch: ImageProcessingBatchRecord = {
    id: id("image-batch"), organisationId: org, createdByActorUserId: input.actor.id, updatedByActorUserId: input.actor.id,
    recordVersion: 1, sourceVersionIds, transformationType: normalized.transformationType,
    normalizedParameters: normalized.parameters, outputFormat: normalized.outputFormat, purpose, taskIds: [], status: "QUEUED",
    requestedAt: now(), requestedByActorUserId: input.actor.id, idempotencyKey: key, requestHash
  };
  state.imageProcessingBatches.unshift(batch);
  audit(state, input.actor, { action: "BATCH_QUEUED", sourceVersionId: sourceVersionIds[0], batchId: batch.id,
    summary: `${sourceVersionIds.length} × ${batch.transformationType}`, reason: "Bounded image-processing batch queued.", after: batch });
  return { batch, replayed: false as const };
}

export function completeImageProcessingBatch(state: AppState, batchId: string, actor: AppUser) {
  const batch = state.imageProcessingBatches.find((item) => item.id === batchId && item.organisationId === organisation(actor));
  if (!batch) throw new ImageUtilityError("Image-processing batch was not found.", 404);
  const tasks = batch.taskIds.map((taskId) => state.imageProcessingTasks.find((item) => item.id === taskId)).filter(Boolean) as ImageProcessingTaskRecord[];
  const succeeded = tasks.filter((item) => item.status === "SUCCEEDED").length;
  batch.status = succeeded === tasks.length ? "SUCCEEDED" : succeeded ? "PARTIAL" : "FAILED";
  batch.completedAt = now(); batch.updatedByActorUserId = actor.id; batch.recordVersion += 1;
  audit(state, actor, { action: "BATCH_COMPLETED", sourceVersionId: batch.sourceVersionIds[0], batchId: batch.id,
    summary: `${succeeded}/${tasks.length} succeeded`, reason: "Bounded image-processing batch completed with per-item status.", after: batch });
  return { batch, tasks };
}

function referencesForVersion(state: AppState, org: string, versionId: string) {
  const references: Array<{ kind: string; id: string }> = [];
  for (const item of state.remedyRepositoryRecords) if (item.organisationId === org && item.preferredAssetVersionId === versionId) references.push({ kind: "REMEDY_REPOSITORY", id: item.id });
  for (const item of state.contextualRepositoryRecords) if (item.organisationId === org && item.preferredAssetVersionId === versionId) references.push({ kind: "CONTEXTUAL_REPOSITORY", id: item.id });
  for (const item of state.caseUsedRemedyRecords) if (item.organisationId === org && item.preferredAssetVersionId === versionId) references.push({ kind: "CASE_USED", id: item.id });
  for (const item of state.sectionAAssets) if (item.organisationId === org && item.assetVersionId === versionId) references.push({ kind: "SECTION_A_ASSET", id: item.id });
  for (const item of state.sectionCAssets) if (item.organisationId === org && item.assetVersionId === versionId) references.push({ kind: "SECTION_C_ASSET", id: item.id });
  for (const item of state.physicalPlacements) if (item.organisationId === org && item.imageAssetVersionId === versionId) references.push({ kind: "PLACEMENT", id: item.id });
  for (const item of state.reportVersions) if (item.organisationId === org && item.artifact && JSON.stringify(item.artifact).includes(`\"${versionId}\"`)) references.push({ kind: "REPORT_ARTIFACT", id: item.id });
  return references;
}

export function imageDerivativeUsage(state: AppState, actor: AppUser, derivativeId: unknown) {
  const org = assertImageUtilityAdmin(actor);
  const derivative = state.imageDerivatives.find((item) => item.id === safeText(derivativeId, "Derivative ID") && item.organisationId === org);
  if (!derivative) throw new ImageUtilityError("Image derivative was not found.", 404);
  const references = referencesForVersion(state, org, derivative.outputVersionId);
  return { derivativeId: derivative.id, outputVersionId: derivative.outputVersionId, referenceCount: references.length, references };
}

export function retireImageDerivative(state: AppState, input: {
  derivativeId: unknown; reason: unknown; idempotencyKey: unknown; expectedRecordVersion: unknown; actor: AppUser;
}) {
  const org = assertImageUtilityAdmin(input.actor); const derivativeId = safeText(input.derivativeId, "Derivative ID");
  const derivative = state.imageDerivatives.find((item) => item.id === derivativeId && item.organisationId === org);
  if (!derivative) throw new ImageUtilityError("Only a committed derivative can be retired; originals are immutable and cannot be retired here.", 404);
  const reason = safeText(input.reason, "Retirement reason", 500); const key = safeText(input.idempotencyKey, "Idempotency key");
  const requestHash = deterministicContentHash({ derivativeId, reason });
  const replay = state.imageUtilityAuditEvents.find((item) => item.organisationId === org && item.action === "DERIVATIVE_RETIRED" && item.idempotencyKey === key);
  if (replay && replay.requestHash !== requestHash) throw new ImageUtilityError("This idempotency key was already used with different retirement inputs.", 409);
  if (replay) return { derivative, usage: imageDerivativeUsage(state, input.actor, derivative.id), replayed: true as const };
  exactVersion(derivative, input.expectedRecordVersion, "image derivative");
  if (derivative.status === "RETIRED") throw new ImageUtilityError("Image derivative is already retired.", 409);
  const usage = imageDerivativeUsage(state, input.actor, derivative.id);
  if (usage.referenceCount) throw new ImageUtilityError("Referenced image derivatives cannot be retired.", 409);
  const before = structuredClone(derivative); derivative.status = "RETIRED"; derivative.retiredAt = now();
  derivative.retiredByActorUserId = input.actor.id; derivative.retirementReason = reason;
  derivative.updatedByActorUserId = input.actor.id; derivative.recordVersion += 1;
  const version = state.mediaAssetVersions.find((item) => item.id === derivative.outputVersionId && item.organisationId === org);
  if (version && version.status !== "ARCHIVED") { version.status = "ARCHIVED"; version.updatedByActorUserId = input.actor.id; version.recordVersion = (version.recordVersion ?? 0) + 1; }
  audit(state, input.actor, { action: "DERIVATIVE_RETIRED", sourceVersionId: derivative.sourceVersionId, derivativeId: derivative.id,
    taskId: derivative.taskId, summary: `${derivative.transformationType} derivative retired`, reason,
    idempotencyKey: key, requestHash, before, after: derivative });
  return { derivative, usage, replayed: false as const };
}

export function imageUtilityStorageSummary(state: AppState, actor: AppUser) {
  const org = assertImageUtilityAdmin(actor); const derivatives = state.imageDerivatives.filter((item) => item.organisationId === org);
  const originals = state.mediaAssetVersions.filter((item) => item.organisationId === org && IMAGE_UTILITY_IMAGE_MIME_TYPES.includes(item.mimeType as never)
    && !derivatives.some((derivative) => derivative.outputVersionId === item.id));
  const available = derivatives.filter((item) => item.status === "AVAILABLE");
  const retired = derivatives.filter((item) => item.status === "RETIRED");
  const unused = available.filter((item) => referencesForVersion(state, org, item.outputVersionId).length === 0);
  return { originalCount: originals.length, originalBytes: originals.reduce((sum, item) => sum + item.sizeBytes, 0),
    derivativeCount: derivatives.length, derivativeBytes: derivatives.reduce((sum, item) => sum + item.sizeBytes, 0),
    availableCount: available.length, retiredCount: retired.length, unusedCount: unused.length,
    unusedBytes: unused.reduce((sum, item) => sum + item.sizeBytes, 0), taskCounts: Object.fromEntries(["QUEUED", "PROCESSING", "SUCCEEDED", "FAILED"].map((status) => [status, state.imageProcessingTasks.filter((item) => item.organisationId === org && item.status === status).length])) };
}

export function buildImageUtilityReadModel(state: AppState, actor: AppUser) {
  const org = assertImageUtilityAdmin(actor);
  const assets = state.mediaAssets.filter((item) => item.organisationId === org).map((asset) => ({ ...asset,
    versions: state.mediaAssetVersions.filter((version) => version.organisationId === org && version.assetId === asset.id
      && IMAGE_UTILITY_IMAGE_MIME_TYPES.includes(version.mimeType as never)).sort((left, right) => right.version - left.version)
      .map((version) => ({ ...version, privateObjectKey: undefined, derivative: state.imageDerivatives.find((item) => item.outputVersionId === version.id),
        referenceCount: referencesForVersion(state, org, version.id).length })) }));
  return { assets, tasks: state.imageProcessingTasks.filter((item) => item.organisationId === org),
    batches: state.imageProcessingBatches.filter((item) => item.organisationId === org),
    auditEvents: state.imageUtilityAuditEvents.filter((item) => item.organisationId === org), storage: imageUtilityStorageSummary(state, actor) };
}
