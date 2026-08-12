export type D1Result<T = unknown> = {
  results?: T[];
  meta: { changes?: number; [key: string]: unknown };
  success?: boolean;
};

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run<T = unknown>(): Promise<D1Result<T>>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

export interface D1DatabaseBinding {
  prepare(sql: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

export interface R2ObjectBody {
  body: ReadableStream<Uint8Array>;
}

export interface R2BucketBinding {
  put(key: string, value: unknown, options?: Record<string, unknown>): Promise<unknown>;
  get(key: string): Promise<R2ObjectBody | null>;
  delete(key: string): Promise<void>;
}

export type RuntimeEnv = {
  // Sites injects these at runtime. They remain checked before use because
  // local development can intentionally provide an empty environment.
  DB: D1DatabaseBinding;
  R2: R2BucketBinding;
  /** Server-only inbound signing key. It is never serialized into AppState or client responses. */
  OPTIN_WEBHOOK_SECRET?: string;
  /** Dormant Lovable wrapper configuration; activation requires explicit approval. */
  LOVABLE_INTEGRATION_SECRET?: string;
  LOVABLE_INTEGRATION_ENABLED?: string;
  LOVABLE_INTEGRATION_ACTIVATION?: string;
  LOVABLE_INTEGRATION_ENVIRONMENT?: string;
  LOVABLE_INTEGRATION_SOURCE_KEY?: string;
  LOVABLE_INTEGRATION_OUTBOUND_URL?: string;
  /** Dormant Zoom Server-to-Server OAuth credentials. Values are server-only and never projected. */
  ZOOM_ACCOUNT_ID?: string;
  ZOOM_CLIENT_ID?: string;
  ZOOM_CLIENT_SECRET?: string;
  /** Must exactly match the approved Founder Review Call host before a synthetic smoke can run. */
  ZOOM_HOST_EMAIL?: string;
  /** Exact value BOUNDED_SYNTHETIC_SMOKE_APPROVED enables only the owner-approved smoke harness. */
  ZOOM_INTEGRATION_ACTIVATION?: string;
  /** Server-only owner secret used to encrypt immutable final PDFs. */
  PDF_OWNER_SECRET?: string;
};

export function getRuntimeEnv() {
  return (globalThis as typeof globalThis & { __uchitEnv?: RuntimeEnv }).__uchitEnv ?? ({} as RuntimeEnv);
}
