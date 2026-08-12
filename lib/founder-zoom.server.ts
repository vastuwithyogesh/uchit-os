import type { RuntimeEnv } from "./runtime-env.ts";
import type { ZoomConnector } from "./founder-engagement.ts";

export const FOUNDER_ZOOM_HOST_EMAIL = "iyogesh2020@gmail.com" as const;
export const FOUNDER_ZOOM_OAUTH_MODE = "SERVER_TO_SERVER_OAUTH" as const;
export const FOUNDER_ZOOM_REQUIRED_SCOPES = [
  "meeting:write:admin",
  "meeting:read:admin",
  "user:read:admin"
] as const;
export const FOUNDER_ZOOM_DURATION_MINUTES = 30 as const;
export const FOUNDER_ZOOM_BUFFER_MINUTES = 15 as const;
export const FOUNDER_ZOOM_SMOKE_ACTIVATION = "BOUNDED_SYNTHETIC_SMOKE_APPROVED" as const;

type ZoomEnvironment = Pick<RuntimeEnv,
  "ZOOM_ACCOUNT_ID" | "ZOOM_CLIENT_ID" | "ZOOM_CLIENT_SECRET" | "ZOOM_HOST_EMAIL" | "ZOOM_INTEGRATION_ACTIVATION"
>;

export type FounderZoomReadiness = {
  status: "DORMANT" | "READY_FOR_BOUNDED_SYNTHETIC_SMOKE";
  oauthMode: typeof FOUNDER_ZOOM_OAUTH_MODE;
  accountIdReady: boolean;
  clientIdReady: boolean;
  clientSecretReady: boolean;
  credentialsReady: boolean;
  hostBindingReady: boolean;
  requiredScopes: readonly string[];
  boundedSyntheticSmokeApproved: boolean;
  liveActivationEnabled: false;
};

const hasLength = (value: string | undefined, minimum: number) => typeof value === "string" && value.trim().length >= minimum;

/** Safe diagnostics projection: presence/length and exact host binding only; never returns credential values. */
export function getFounderZoomReadiness(env: ZoomEnvironment): FounderZoomReadiness {
  const accountIdReady = hasLength(env.ZOOM_ACCOUNT_ID, 8);
  const clientIdReady = hasLength(env.ZOOM_CLIENT_ID, 8);
  const clientSecretReady = hasLength(env.ZOOM_CLIENT_SECRET, 16);
  const hostBindingReady = env.ZOOM_HOST_EMAIL?.trim().toLowerCase() === FOUNDER_ZOOM_HOST_EMAIL;
  const boundedSyntheticSmokeApproved = env.ZOOM_INTEGRATION_ACTIVATION === FOUNDER_ZOOM_SMOKE_ACTIVATION;
  const ready = accountIdReady && clientIdReady && clientSecretReady && hostBindingReady && boundedSyntheticSmokeApproved;
  return {
    status: ready ? "READY_FOR_BOUNDED_SYNTHETIC_SMOKE" : "DORMANT",
    oauthMode: FOUNDER_ZOOM_OAUTH_MODE,
    accountIdReady,
    clientIdReady,
    clientSecretReady,
    credentialsReady: accountIdReady && clientIdReady && clientSecretReady,
    hostBindingReady,
    requiredScopes: [...FOUNDER_ZOOM_REQUIRED_SCOPES],
    boundedSyntheticSmokeApproved,
    liveActivationEnabled: false
  };
}

export class FounderZoomConfigurationError extends Error {
  readonly statusCode = 503;
}

type ZoomFetch = (input: string, init?: RequestInit) => Promise<Response>;
type ProtectPrivateMetadata = (metadata: { joinUrl: string; startUrl?: string; password?: string }) => Promise<string>;

type ZoomTokenResponse = { access_token?: string; scope?: string; expires_in?: number };
type ZoomUserResponse = { email?: string; status?: string };
type ZoomMeetingResponse = { id?: string | number; join_url?: string; start_url?: string; password?: string };

function requireReady(env: ZoomEnvironment) {
  const readiness = getFounderZoomReadiness(env);
  if (readiness.status !== "READY_FOR_BOUNDED_SYNTHETIC_SMOKE") {
    throw new FounderZoomConfigurationError("Zoom remains dormant. Configure the private staging credentials, exact Founder host binding and bounded synthetic smoke approval, then retry.");
  }
  return {
    accountId: env.ZOOM_ACCOUNT_ID!,
    clientId: env.ZOOM_CLIENT_ID!,
    clientSecret: env.ZOOM_CLIENT_SECRET!
  };
}

function assertRequiredScopes(scopeText: string | undefined) {
  const granted = new Set((scopeText ?? "").split(/[ ,]+/).filter(Boolean));
  if (!FOUNDER_ZOOM_REQUIRED_SCOPES.every((scope) => granted.has(scope))) {
    throw new FounderZoomConfigurationError("Zoom Server-to-Server OAuth is missing an approved least-privilege scope.");
  }
}

async function safeJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new FounderZoomConfigurationError(`Zoom provider request failed with status ${response.status}.`);
  return await response.json() as T;
}

/**
 * Creates a dormant Server-to-Server OAuth adapter. Construction performs no network call.
 * The only supported host is the configured Founder host; callers cannot override it.
 */
export function createFounderZoomServerToServerConnector(input: {
  env: ZoomEnvironment;
  fetcher: ZoomFetch;
  protectPrivateMetadata: ProtectPrivateMetadata;
}): ZoomConnector {
  const credentials = requireReady(input.env);
  let token: string | undefined;
  let hostValidated = false;
  const creations = new Map<string, Promise<{ providerMeetingId: string; privateJoinMetadataCiphertext: string }>>();

  async function accessToken() {
    if (token) return token;
    const basic = btoa(`${credentials.clientId}:${credentials.clientSecret}`);
    const response = await input.fetcher(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(credentials.accountId)}`, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" }
    });
    const body = await safeJson<ZoomTokenResponse>(response);
    if (!body.access_token) throw new FounderZoomConfigurationError("Zoom token acquisition did not return an access token.");
    assertRequiredScopes(body.scope);
    token = body.access_token;
    return token;
  }

  async function validateHost() {
    if (hostValidated) return;
    const bearer = await accessToken();
    const response = await input.fetcher(`https://api.zoom.us/v2/users/${encodeURIComponent(FOUNDER_ZOOM_HOST_EMAIL)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${bearer}` }
    });
    const body = await safeJson<ZoomUserResponse>(response);
    if (body.email?.trim().toLowerCase() !== FOUNDER_ZOOM_HOST_EMAIL || body.status !== "active") {
      throw new FounderZoomConfigurationError("The approved Founder Zoom host is unavailable or does not match the configured account.");
    }
    hostValidated = true;
  }

  return {
    async createUniqueMeeting(meeting) {
      if (meeting.hostUserEmail !== FOUNDER_ZOOM_HOST_EMAIL || meeting.durationMinutes !== FOUNDER_ZOOM_DURATION_MINUTES) {
        throw new FounderZoomConfigurationError("Founder Review Calls must use the approved host and 30-minute duration.");
      }
      const existing = creations.get(meeting.idempotencyKey);
      if (existing) return existing;
      const creation = (async () => {
        await validateHost();
        const bearer = await accessToken();
        const response = await input.fetcher(`https://api.zoom.us/v2/users/${encodeURIComponent(FOUNDER_ZOOM_HOST_EMAIL)}/meetings`, {
          method: "POST",
          headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            topic: "Uchit Vastu Private Review Call",
            type: 2,
            start_time: meeting.startsAt,
            duration: FOUNDER_ZOOM_DURATION_MINUTES,
            settings: { join_before_host: false, waiting_room: true }
          })
        });
        const body = await safeJson<ZoomMeetingResponse>(response);
        if (body.id === undefined || !body.join_url) throw new FounderZoomConfigurationError("Zoom meeting creation returned incomplete private meeting metadata.");
        return {
          providerMeetingId: String(body.id),
          privateJoinMetadataCiphertext: await input.protectPrivateMetadata({ joinUrl: body.join_url, startUrl: body.start_url, password: body.password })
        };
      })();
      creations.set(meeting.idempotencyKey, creation);
      try { return await creation; } catch (error) { creations.delete(meeting.idempotencyKey); throw error; }
    },
    async retireMeeting(providerMeetingId) {
      const bearer = await accessToken();
      const response = await input.fetcher(`https://api.zoom.us/v2/meetings/${encodeURIComponent(providerMeetingId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${bearer}` }
      });
      if (!response.ok && response.status !== 404) throw new FounderZoomConfigurationError(`Zoom meeting retirement failed with status ${response.status}.`);
    }
  };
}
