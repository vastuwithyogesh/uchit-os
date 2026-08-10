import test from "node:test";
import assert from "node:assert/strict";
import { source, functionBody, switchCaseBody } from "./helpers/source-contracts.mjs";

const store = source("lib/payment-proof-assets.server.ts");
const collectionRoute = source("app/api/payment-proofs/route.ts");
const fileRoute = source("app/api/payment-proofs/files/[fileName]/route.ts");
const actionsRoute = source("app/api/actions/route.ts");
const workflow = source("lib/workflow-service.ts");
const proofConsole = source("components/payment-proof-console.tsx");
const commercialConsole = source("components/commercial-console.tsx");
const verificationStore = source("lib/advance-verifications-store.ts");
const workflows = source("lib/workflows.ts");

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

test("payment proof records are bound to an exact client and proposal or active case", () => {
  assert.match(functionBody(collectionRoute, "GET"), /assertPaymentScope\(state, context\)/);
  assert.match(functionBody(collectionRoute, "POST"), /assertPaymentScope\(state, context\)/);
  assert.match(functionBody(collectionRoute, "POST"), /Advance proof requires the selected proposal/);
  assert.match(functionBody(collectionRoute, "POST"), /Balance proof requires the active case/);
  assert.match(functionBody(store, "readPaymentProofForVerification"), /record\.clientId === clientId/);
  assert.match(functionBody(store, "readPaymentProofForVerification"), /record\.proposalId === proposalId/);
  assert.match(functionBody(store, "readPaymentProofForVerification"), /record\.caseId === caseId/);
  assert.match(functionBody(fileRoute, "GET"), /clientId: url\.searchParams\.get\("clientId"\)/);
  assert.match(functionBody(fileRoute, "GET"), /readPaymentProofFile\(opaqueId, \{[\s\S]*key,[\s\S]*clientId:[\s\S]*proposalId:[\s\S]*caseId:/);
});

test("payment proof APIs redact private verification metadata", () => {
  const redaction = functionBody(store, "toPublicPaymentProofRecord");
  assert.match(redaction, /checksumSha256/);
  assert.match(redaction, /uploadedById/);
  assert.match(functionBody(collectionRoute, "GET"), /assets\.map\(toPublicPaymentProofRecord\)/);
  assert.match(functionBody(collectionRoute, "POST"), /toPublicPaymentProofRecord\(asset\)/);
  assert.doesNotMatch(proofConsole.slice(proofConsole.indexOf("return (")), /checksumSha256|uploadedById/);
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

test("payment approval cannot bypass scoped proof or two-person verification", () => {
  assert.match(actionsRoute, /case "advance-pay":[\s\S]*independently verify scoped advance proof/);
  assert.match(actionsRoute, /case "balance-pay":[\s\S]*independently verify scoped balance proof/);
  assert.match(functionBody(workflow, "verifyAdvanceProofAndOpenCase"), /readPaymentProofForVerification\(input\.proofId/);
  assert.match(functionBody(workflow, "verifyBalanceProof"), /readPaymentProofForVerification\(input\.proofId/);
  assert.match(functionBody(workflow, "verifyAdvanceProofAndOpenCase"), /proof\.uploadedById === input\.actor\.id/);
  assert.match(functionBody(workflow, "verifyBalanceProof"), /proof\.uploadedById === input\.actor\.id/);
  assert.match(functionBody(workflow, "approveAdvancePayment"), /proposal\.minAdvanceInr/);
  assert.match(functionBody(workflow, "approveAdvancePayment"), /"Payments", reviewer\)/);
  assert.match(functionBody(workflow, "approveBalancePayment"), /"Payments", reviewer\)/);
  assert.match(commercialConsole, /proofId: proofId \|\| activeVerification\?\.proofAssetId/);
  assert.match(commercialConsole, /proofId: balanceProofId \|\| balancePayment\?\.proofAssetId/);
  assert.doesNotMatch(commercialConsole, /referenceScreenshotUrl:/);
  assert.match(functionBody(verificationStore, "hydrateVerification"), /proofAssetId/);
  assert.doesNotMatch(functionBody(workflow, "verifyAdvanceProofAndOpenCase"), /writeAdvanceVerificationRecords/);
  assert.match(functionBody(workflows, "canCreateCase"), /advance\.proofAssetId/);
  assert.match(functionBody(workflows, "approvalSummary"), /balancePayment\?\.proofAssetId/);
  assert.match(switchCaseBody(actionsRoute, "case-create"), /canVerifyPayments\(actor\)/);
});

test("verified proof is immutable and the commercial console never falls back across clients", () => {
  assert.match(functionBody(collectionRoute, "POST"), /proofIsBound/);
  assert.match(functionBody(collectionRoute, "POST"), /verified receipt is permanent and cannot be replaced/);
  assert.match(proofConsole, /Verified receipt locked/);
  assert.match(commercialConsole, /fetch\(`\/api\/payment-proofs\?\$\{query\.toString\(\)\}`/);
  assert.doesNotMatch(commercialConsole, /proposal\.clientId === activeClient\?\.id\) \?\? proposals\[0\]/);
  assert.doesNotMatch(commercialConsole, /item\.clientId === activeClient\?\.id\) \?\? advanceVerifications\[0\]/);
});
