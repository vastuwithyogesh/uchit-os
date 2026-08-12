import { createHash } from "node:crypto";

const SAFE_SCOPE = /^[A-Za-z0-9][A-Za-z0-9._-]{1,95}$/;

export type PrivateObjectStatus = "ACTIVE" | "SUPERSEDED" | "REVOKED" | "ORPHANED";

export interface PrivateObjectRecord {
  key: string;
  environment: "DISPOSABLE_REHEARSAL";
  organisationId: string;
  clientId: string;
  category: string;
  versionId: string;
  sha256: string;
  sizeBytes: number;
  status: PrivateObjectStatus;
  supersedesKey?: string;
  supersededByKey?: string;
  createdAt: string;
}

export class PrivateStorageScopeError extends Error {}
export class PrivateStorageIntegrityError extends Error {}

function safeSegment(label: string, value: string): string {
  if (!SAFE_SCOPE.test(value) || value.includes("..")) {
    throw new PrivateStorageScopeError(`${label} is not a safe storage scope segment.`);
  }
  return value;
}

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function buildDisposablePrivateObjectKey(input: {
  organisationId: string;
  clientId: string;
  category: string;
  versionId: string;
  sha256: string;
}): string {
  const organisationId = safeSegment("organisationId", input.organisationId);
  const clientId = safeSegment("clientId", input.clientId);
  const category = safeSegment("category", input.category);
  const versionId = safeSegment("versionId", input.versionId);
  if (!/^[a-f0-9]{64}$/.test(input.sha256)) {
    throw new PrivateStorageScopeError("sha256 must be a lowercase 64-character digest.");
  }
  return `rehearsal/disposable/${organisationId}/${clientId}/${category}/${versionId}/${input.sha256}.bin`;
}

/**
 * A memory-only R2 contract rehearsal. It intentionally has no network or
 * filesystem adapter and cannot upload production or staging objects.
 */
export class DisposablePrivateObjectStore {
  readonly records = new Map<string, PrivateObjectRecord>();
  readonly objects = new Map<string, Uint8Array>();
  private disposed = false;

  putImmutable(input: {
    organisationId: string;
    clientId: string;
    category: string;
    versionId: string;
    bytes: Uint8Array;
    expectedSha256?: string;
    supersedesKey?: string;
    now?: Date;
  }): PrivateObjectRecord {
    this.assertAvailable();
    const sha256 = digest(input.bytes);
    if (input.expectedSha256 && input.expectedSha256.toLowerCase() !== sha256) {
      throw new PrivateStorageIntegrityError("Object checksum does not match the declared checksum.");
    }
    const key = buildDisposablePrivateObjectKey({ ...input, sha256 });
    const existing = this.records.get(key);
    if (existing) {
      const stored = this.objects.get(key);
      if (!stored || digest(stored) !== sha256) throw new PrivateStorageIntegrityError("Stored immutable bytes failed verification.");
      return existing;
    }
    if (input.supersedesKey) {
      const prior = this.requireScoped(input.supersedesKey, input.organisationId, input.clientId);
      if (prior.status === "REVOKED") throw new PrivateStorageScopeError("A revoked object cannot be superseded.");
      prior.status = "SUPERSEDED";
      prior.supersededByKey = key;
    }
    const record: PrivateObjectRecord = {
      key,
      environment: "DISPOSABLE_REHEARSAL",
      organisationId: input.organisationId,
      clientId: input.clientId,
      category: input.category,
      versionId: input.versionId,
      sha256,
      sizeBytes: input.bytes.byteLength,
      status: "ACTIVE",
      supersedesKey: input.supersedesKey,
      createdAt: (input.now ?? new Date()).toISOString()
    };
    this.records.set(key, record);
    this.objects.set(key, Uint8Array.from(input.bytes));
    return record;
  }

  read(key: string, organisationId: string, clientId: string): Uint8Array {
    this.assertAvailable();
    const record = this.requireScoped(key, organisationId, clientId);
    if (record.status === "REVOKED" || record.status === "ORPHANED") {
      throw new PrivateStorageScopeError("Object is not available through an active private grant.");
    }
    const bytes = this.objects.get(key);
    if (!bytes || digest(bytes) !== record.sha256 || bytes.byteLength !== record.sizeBytes) {
      throw new PrivateStorageIntegrityError("Stored object bytes are missing or have changed.");
    }
    return Uint8Array.from(bytes);
  }

  revoke(key: string, organisationId: string, clientId: string): PrivateObjectRecord {
    const record = this.requireScoped(key, organisationId, clientId);
    record.status = "REVOKED";
    return record;
  }

  inventoryOrphans(referencedKeys: ReadonlySet<string>): PrivateObjectRecord[] {
    this.assertAvailable();
    const orphans: PrivateObjectRecord[] = [];
    for (const record of this.records.values()) {
      if (!referencedKeys.has(record.key) && record.status !== "REVOKED") {
        record.status = "ORPHANED";
        orphans.push(record);
      }
    }
    return orphans;
  }

  recoverOrphan(key: string, organisationId: string, clientId: string): PrivateObjectRecord {
    const record = this.requireScoped(key, organisationId, clientId);
    if (record.status !== "ORPHANED") throw new PrivateStorageScopeError("Only inventoried orphan objects may be recovered.");
    const bytes = this.objects.get(key);
    if (!bytes || digest(bytes) !== record.sha256) throw new PrivateStorageIntegrityError("Orphan recovery checksum verification failed.");
    record.status = record.supersededByKey ? "SUPERSEDED" : "ACTIVE";
    return record;
  }

  dispose(): { disposed: true; removedObjects: number } {
    const removedObjects = this.objects.size;
    this.objects.clear();
    this.records.clear();
    this.disposed = true;
    return { disposed: true, removedObjects };
  }

  private requireScoped(key: string, organisationId: string, clientId: string): PrivateObjectRecord {
    if (!key.startsWith("rehearsal/disposable/") || key.includes("..") || /[\\\u0000-\u001f]/.test(key)) {
      throw new PrivateStorageScopeError("Object key is outside disposable private storage scope.");
    }
    const record = this.records.get(key);
    if (!record || record.organisationId !== organisationId || record.clientId !== clientId) {
      throw new PrivateStorageScopeError("Object is not available in this organisation/client scope.");
    }
    return record;
  }

  private assertAvailable(): void {
    if (this.disposed) throw new PrivateStorageScopeError("Disposable private storage rehearsal has been destroyed.");
  }
}
