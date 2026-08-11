import { InboundEventError } from "./inbound-optin-events.server.ts";
import { getLovableIntegrationConfig, isLovableWrapperReady, type LovableIntegrationEvent, type LovableWrapperConfig, type LovableSourceEnvironment } from "./lovable-integration-contract.ts";
import { getRuntimeEnv } from "./runtime-env.ts";

export class LovableIntegrationDisabledError extends Error {
  readonly status = 503;
  constructor() { super("Lovable integration is not activated."); }
}

export function readLovableWrapperConfig() {
  return getLovableIntegrationConfig(getRuntimeEnv());
}

export function assertLovableWrapperReady(config = readLovableWrapperConfig()) {
  if (!isLovableWrapperReady(config)) throw new LovableIntegrationDisabledError();
  return config;
}

export function assertLovableEnvironmentBinding(event: Pick<LovableIntegrationEvent, "sourceEnvironment">, config: LovableWrapperConfig, sourceKey?: string) {
  if (!config.environment || event.sourceEnvironment !== config.environment) throw new InboundEventError(409, "Integration environment binding mismatch.");
  if (config.sourceKey && sourceKey !== config.sourceKey) throw new InboundEventError(409, "Integration source binding mismatch.");
  return true;
}

export function integrationEnvironmentReadiness(config = readLovableWrapperConfig()) {
  return {
    enabled: config.enabled,
    activated: config.activated,
    ready: isLovableWrapperReady(config),
    environment: config.environment ?? null,
    sourceBound: Boolean(config.sourceKey),
    outboundBound: Boolean(config.outboundUrl),
    storageBound: Boolean(config.db)
  } as const;
}

const encoder = new TextEncoder();

async function hmacHex(secret: string, body: Uint8Array) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, body.slice().buffer);
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Builds the signed canonical projection envelope without persisting or sending it. */
export async function buildSignedCanonicalProjection(body: unknown, now = Date.now(), config = readLovableWrapperConfig()) {
  const ready = assertLovableWrapperReady(config);
  const raw = encoder.encode(JSON.stringify(body));
  const timestamp = Math.floor(now / 1000).toString();
  const signed = encoder.encode(`${timestamp}.`);
  const combined = new Uint8Array(signed.byteLength + raw.byteLength);
  combined.set(signed); combined.set(raw, signed.byteLength);
  const signature = await hmacHex(ready.secret!, combined);
  return { timestamp, signature: `sha256=${signature}`, body: raw } as const;
}

export function assertSupportedEnvironment(environment: string): asserts environment is LovableSourceEnvironment {
  if (!["PREVIEW", "STAGING", "PUBLISHED", "PRODUCTION"].includes(environment)) throw new InboundEventError(400, "Integration environment is invalid.");
}

/** Dormant by design: no D1 mutation is reachable from this adapter. */
export function assertNoLiveActivation(config = readLovableWrapperConfig()) {
  if (!isLovableWrapperReady(config)) throw new LovableIntegrationDisabledError();
  throw new LovableIntegrationDisabledError();
}
