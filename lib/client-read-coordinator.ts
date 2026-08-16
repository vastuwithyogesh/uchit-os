"use client";

type FetchImplementation = typeof fetch;
type RequestInput = Parameters<typeof fetch>[0];
type RequestOptions = Parameters<typeof fetch>[1];

type CachedResponse = {
  body: string;
  headers: Array<[string, string]>;
  status: number;
  statusText: string;
};

type CacheEntry = {
  expiresAt: number;
  value: CachedResponse;
};

const CACHE_TTLS_MS: Record<string, number> = {
  "/api/session": 1_500,
  "/api/bootstrap": 1_200,
  "/api/branding": 30_000,
  "/api/founder/cases": 1_200
};

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function requestDetails(input: RequestInput, init?: RequestOptions) {
  const request = new Request(input, init);
  const url = new URL(request.url, typeof window === "undefined" ? "http://localhost" : window.location.href);
  const headers = [...request.headers.entries()].sort(([left], [right]) => left.localeCompare(right));
  return { request, url, key: `${request.method} ${url.pathname}${url.search} ${JSON.stringify(headers)}` };
}

function makeResponse(value: CachedResponse) {
  return new Response(value.body, {
    status: value.status,
    statusText: value.statusText,
    headers: value.headers
  });
}

function abortError() {
  return new DOMException("The request was aborted.", "AbortError");
}

function withAbort<T>(promise: Promise<T>, signal?: AbortSignal | null) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}

export function createClientReadCoordinator(originalFetch: FetchImplementation, clock = now) {
  const inFlight = new Map<string, Promise<CachedResponse>>();
  const resolved = new Map<string, CacheEntry>();

  function clear() {
    resolved.clear();
  }

  function read(input: RequestInput, init?: RequestOptions): Promise<Response> {
    const { request, url, key } = requestDetails(input, init);
    const ttl = request.method === "GET" ? CACHE_TTLS_MS[url.pathname] : undefined;
    const isApiMutation = request.method !== "GET" && url.pathname.startsWith("/api/");

    if (!ttl) {
      const result = originalFetch(input, init);
      if (isApiMutation) return result.then((response) => { if (response.ok) clear(); return response; });
      return result;
    }

    const cached = resolved.get(key);
    if (cached && cached.expiresAt > clock()) return withAbort(Promise.resolve(makeResponse(cached.value)), request.signal);

    let shared = inFlight.get(key);
    if (!shared) {
      const controller = new AbortController();
      const networkRequest = new Request(input, { ...init, signal: controller.signal });
      shared = originalFetch(networkRequest).then(async (response) => {
        const value: CachedResponse = {
          body: await response.text(),
          headers: [...response.headers.entries()],
          status: response.status,
          statusText: response.statusText
        };
        if (response.ok) resolved.set(key, { value, expiresAt: clock() + ttl });
        return value;
      }).finally(() => inFlight.delete(key));
      inFlight.set(key, shared);
    }

    return withAbort(shared.then(makeResponse), request.signal);
  }

  return { fetch: read, clear };
}

let installedCoordinator: ReturnType<typeof createClientReadCoordinator> | null = null;

export function installClientReadCoordinator() {
  if (typeof window === "undefined" || installedCoordinator) return () => undefined;
  const originalFetch = window.fetch.bind(window);
  installedCoordinator = createClientReadCoordinator(originalFetch);
  const coordinator = installedCoordinator;
  window.fetch = coordinator.fetch as typeof window.fetch;
  return () => {
    if (window.fetch === coordinator.fetch) window.fetch = originalFetch;
    coordinator.clear();
    installedCoordinator = null;
  };
}

export function clearClientReadCache() {
  installedCoordinator?.clear();
}
