type RuntimeEnv = {
  DB?: D1Database;
  R2?: R2Bucket;
};

export function getRuntimeEnv() {
  return (globalThis as typeof globalThis & { __uchitEnv?: RuntimeEnv }).__uchitEnv ?? {};
}
