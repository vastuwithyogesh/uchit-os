import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  createFounderZoomServerToServerConnector,
  FOUNDER_ZOOM_HOST_EMAIL,
  getFounderZoomReadiness
} from "../lib/founder-zoom.server.ts";

const ACK = "--acknowledge-bounded-private-staging-smoke";

export async function runFounderZoomSyntheticSmoke({ env = process.env, fetcher = globalThis.fetch, now = new Date() } = {}) {
  if (!process.argv.includes(ACK)) throw new Error(`Refusing provider mutation without ${ACK}.`);
  const readiness = getFounderZoomReadiness(env);
  if (readiness.status !== "READY_FOR_BOUNDED_SYNTHETIC_SMOKE") throw new Error("Zoom synthetic smoke is not ready. Verify private secret presence/length, exact host binding and activation without echoing values.");
  const connector = createFounderZoomServerToServerConnector({
    env,
    fetcher,
    protectPrivateMetadata: async (metadata) => `smoke-sha256:${createHash("sha256").update(JSON.stringify(metadata)).digest("hex")}`
  });
  const firstStart = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
  const replacementStart = new Date(now.getTime() + 50 * 60 * 60 * 1000).toISOString();
  const firstInput = { bookingId: "synthetic-private-staging-smoke-v1", startsAt: firstStart, durationMinutes: 30, hostUserEmail: FOUNDER_ZOOM_HOST_EMAIL, idempotencyKey: `zoom-smoke-${now.toISOString().slice(0, 10)}-original` };
  const first = await connector.createUniqueMeeting(firstInput);
  const replay = await connector.createUniqueMeeting(firstInput);
  const replayStable = first.providerMeetingId === replay.providerMeetingId;
  await connector.retireMeeting?.(first.providerMeetingId);
  const replacement = await connector.createUniqueMeeting({ ...firstInput, bookingId: "synthetic-private-staging-smoke-v1-replacement", startsAt: replacementStart, idempotencyKey: `zoom-smoke-${now.toISOString().slice(0, 10)}-replacement` });
  const replacementUnique = replacement.providerMeetingId !== first.providerMeetingId;
  await connector.retireMeeting?.(replacement.providerMeetingId);
  return {
    scope: "BOUNDED_PRIVATE_STAGING_SYNTHETIC_ONLY",
    tokenAcquired: true,
    hostValidated: true,
    durationMinutes: 30,
    hiddenBufferMinutes: 15,
    privateMetadataProtected: first.privateJoinMetadataCiphertext.startsWith("smoke-sha256:"),
    idempotentReplay: replayStable,
    priorMeetingRetired: true,
    exactlyOneReplacement: replacementUnique,
    syntheticMeetingsRetiredAfterSmoke: true,
    credentialsOrLinksReturned: false,
    productionActivationEnabled: false
  };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const report = await runFounderZoomSyntheticSmoke();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
