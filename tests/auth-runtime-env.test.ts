import test from "node:test";
import assert from "node:assert/strict";
import { isExplicitLocalDemo, resolveRequestActor } from "../lib/auth.ts";

const runtime = globalThis as typeof globalThis & { __uchitEnv?: Record<string, unknown> };
const envKeys = ["NODE_ENV", "UCHIT_VASTU_DEMO_MODE", "UCHIT_VASTU_LOCAL_FOUNDER_OWNER_FIXTURE"] as const;

function clearProcessFlags() {
  for (const key of envKeys) Reflect.deleteProperty(process.env, key);
}

function setProcessFlag(key: typeof envKeys[number], value: string) {
  Reflect.set(process.env, key, value);
}

test("Node/Vite local Founder fixture remains available through process.env", async () => {
  const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const previousRuntime = runtime.__uchitEnv;
  try {
    runtime.__uchitEnv = undefined;
    setProcessFlag("NODE_ENV", "development");
    setProcessFlag("UCHIT_VASTU_DEMO_MODE", "true");
    setProcessFlag("UCHIT_VASTU_LOCAL_FOUNDER_OWNER_FIXTURE", "true");
    const actor = await resolveRequestActor(new Headers({ host: "localhost:3000" }));
    assert.equal(actor.id, "local-founder-owner");
    assert.equal(actor.role, "SUPER_ADMIN");
    assert.equal(isExplicitLocalDemo(new Headers({ host: "localhost:3000" })), true);
  } finally {
    runtime.__uchitEnv = previousRuntime;
    clearProcessFlags();
    for (const key of envKeys) if (previous[key] !== undefined) setProcessFlag(key, previous[key]!);
  }
});

test("Cloudflare runtime env enables the same local Founder fixture without process.env", async () => {
  const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const previousRuntime = runtime.__uchitEnv;
  try {
    clearProcessFlags();
    runtime.__uchitEnv = {
      NODE_ENV: "development",
      UCHIT_VASTU_DEMO_MODE: "true",
      UCHIT_VASTU_LOCAL_FOUNDER_OWNER_FIXTURE: "true"
    };
    const actor = await resolveRequestActor(new Headers({ host: "127.0.0.1:3011" }));
    assert.equal(actor.id, "local-founder-owner");
    assert.equal(actor.role, "SUPER_ADMIN");
  } finally {
    runtime.__uchitEnv = previousRuntime;
    clearProcessFlags();
    for (const key of envKeys) if (previous[key] !== undefined) setProcessFlag(key, previous[key]!);
  }
});

test("local Founder fixture rejects non-local origins even when runtime flags are enabled", () => {
  const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const previousRuntime = runtime.__uchitEnv;
  try {
    clearProcessFlags();
    runtime.__uchitEnv = { NODE_ENV: "development", UCHIT_VASTU_DEMO_MODE: "true", UCHIT_VASTU_LOCAL_FOUNDER_OWNER_FIXTURE: "true" };
    assert.equal(isExplicitLocalDemo(new Headers({ host: "production.example.com" })), false);
  } finally {
    runtime.__uchitEnv = previousRuntime;
    clearProcessFlags();
    for (const key of envKeys) if (previous[key] !== undefined) setProcessFlag(key, previous[key]!);
  }
});

test("local Founder fixture rejects local origins when explicit flags are absent", () => {
  const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const previousRuntime = runtime.__uchitEnv;
  try {
    clearProcessFlags();
    runtime.__uchitEnv = { NODE_ENV: "development" };
    assert.equal(isExplicitLocalDemo(new Headers({ host: "localhost:3011" })), false);
  } finally {
    runtime.__uchitEnv = previousRuntime;
    clearProcessFlags();
    for (const key of envKeys) if (previous[key] !== undefined) setProcessFlag(key, previous[key]!);
  }
});
