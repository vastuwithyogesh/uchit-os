import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  buildDisposablePrivateObjectKey,
  DisposablePrivateObjectStore,
  PrivateStorageIntegrityError,
  PrivateStorageScopeError
} from "../lib/founder-private-storage-rehearsal.ts";

const bytes = (value: string) => new TextEncoder().encode(value);
const sha = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");

test("synthetic private objects preserve scoped keys, bytes and checksums", () => {
  const store = new DisposablePrivateObjectStore();
  const payload = bytes("SYNTHETIC SAFE FULL-COLOUR EVIDENCE v1\nRGB: 176,141,87");
  const record = store.putImmutable({ organisationId: "org-synthetic", clientId: "client-synthetic", category: "manual-sheet", versionId: "v1", bytes: payload, expectedSha256: sha(payload), now: new Date("2026-08-12T00:00:00Z") });
  assert.equal(record.key, buildDisposablePrivateObjectKey({ organisationId: "org-synthetic", clientId: "client-synthetic", category: "manual-sheet", versionId: "v1", sha256: sha(payload) }));
  assert.deepEqual(store.read(record.key, "org-synthetic", "client-synthetic"), payload);
  assert.throws(() => store.read(record.key, "org-foreign", "client-synthetic"), PrivateStorageScopeError);
  assert.throws(() => store.read(record.key, "org-synthetic", "client-foreign"), PrivateStorageScopeError);
  assert.throws(() => store.putImmutable({ organisationId: "org-synthetic", clientId: "client-synthetic", category: "manual-sheet", versionId: "bad", bytes: payload, expectedSha256: "0".repeat(64) }), PrivateStorageIntegrityError);
});

test("supersession, revocation, orphan inventory and recovery never rewrite bytes", () => {
  const store = new DisposablePrivateObjectStore();
  const firstBytes = bytes("SYNTHETIC PLAN v1");
  const first = store.putImmutable({ organisationId: "org-synthetic", clientId: "client-synthetic", category: "plan", versionId: "v1", bytes: firstBytes });
  const secondBytes = bytes("SYNTHETIC PLAN v2 — independent bytes");
  const second = store.putImmutable({ organisationId: "org-synthetic", clientId: "client-synthetic", category: "plan", versionId: "v2", bytes: secondBytes, supersedesKey: first.key });
  assert.equal(first.status, "SUPERSEDED");
  assert.deepEqual(store.read(first.key, "org-synthetic", "client-synthetic"), firstBytes);
  assert.deepEqual(store.read(second.key, "org-synthetic", "client-synthetic"), secondBytes);
  store.revoke(first.key, "org-synthetic", "client-synthetic");
  assert.throws(() => store.read(first.key, "org-synthetic", "client-synthetic"), PrivateStorageScopeError);
  assert.deepEqual(store.inventoryOrphans(new Set([first.key])).map((item) => item.key), [second.key]);
  assert.throws(() => store.read(second.key, "org-synthetic", "client-synthetic"), PrivateStorageScopeError);
  store.recoverOrphan(second.key, "org-synthetic", "client-synthetic");
  assert.deepEqual(store.read(second.key, "org-synthetic", "client-synthetic"), secondBytes);
});

test("path attacks fail and disposal proves the rehearsal is ephemeral", () => {
  const store = new DisposablePrivateObjectStore();
  assert.throws(() => store.putImmutable({ organisationId: "../production", clientId: "client", category: "plan", versionId: "v1", bytes: bytes("safe") }), PrivateStorageScopeError);
  assert.throws(() => store.putImmutable({ organisationId: "org", clientId: "client", category: "https://object.example", versionId: "v1", bytes: bytes("safe") }), PrivateStorageScopeError);
  const record = store.putImmutable({ organisationId: "org-safe", clientId: "client-safe", category: "evidence", versionId: "v1", bytes: bytes("synthetic") });
  const result = store.dispose();
  assert.deepEqual(result, { disposed: true, removedObjects: 1 });
  assert.throws(() => store.read(record.key, "org-safe", "client-safe"), PrivateStorageScopeError);
  assert.equal(store.objects.size, 0);
});
