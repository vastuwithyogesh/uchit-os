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
  /** Server-only owner secret used to encrypt immutable final PDFs. */
  PDF_OWNER_SECRET?: string;
};

export function getRuntimeEnv() {
  return (globalThis as typeof globalThis & { __uchitEnv?: RuntimeEnv }).__uchitEnv ?? ({} as RuntimeEnv);
}
