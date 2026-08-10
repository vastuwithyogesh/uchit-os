import test from "node:test";
import assert from "node:assert/strict";
import { source, functionBody } from "./helpers/source-contracts.mjs";

const store = source("lib/payment-proof-assets.server.ts");
const collectionRoute = source("app/api/payment-proofs/route.ts");
const fileRoute = source("app/api/payment-proofs/files/[fileName]/route.ts");

test("payment proof routes require authenticated staff access", () => {
  assert.match(functionBody(collectionRoute, "GET"), /requireRouteActor\(request, "SETTER"\)/);
  assert.match(functionBody(collectionRoute, "POST"), /requireRouteActor\(request, "SETTER"\)/);
  assert.match(functionBody(fileRoute, "GET"), /requireRouteActor\(request, "SETTER"\)/);
});

test("new payment proof bytes use private opaque R2 keys and structured metadata", () => {
  const save = functionBody(store, "savePaymentProofUpload");
  assert.match(save, /crypto\.randomUUID\(\)/);
  assert.match(save, /R2\.put\(objectKey, bytes/);
  assert.match(save, /checksum_sha256/);
  assert.match(save, /uploaded_by_id/);
  assert.match(save, /client_id/);
  assert.doesNotMatch(save, /base64|toString\(["']base64["']\)/);
});

test("uploads have MIME, size, and file-signature validation", () => {
  assert.match(store, /MAX_PROOF_BYTES = 10 \* 1024 \* 1024/);
  for (const mime of ["image/png", "image/jpeg", "image/webp", "application/pdf"]) assert.match(store, new RegExp(mime.replace("/", "\\/")));
  assert.match(functionBody(store, "savePaymentProofUpload"), /hasExpectedSignature\(bytes, file\.type\)/);
});

test("legacy embedded proof bytes are never returned to clients", () => {
  assert.match(functionBody(store, "readPaymentProofManifest"), /startsWith\("data:"\) \? ""/);
  assert.doesNotMatch(fileRoute, /readFile|data\/payment-proofs/);
  assert.match(fileRoute, /Cache-Control": "private, no-store"/);
  assert.match(fileRoute, /X-Content-Type-Options": "nosniff"/);
});
