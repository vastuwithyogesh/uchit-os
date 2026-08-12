import { getRuntimeEnv } from "./runtime-env.ts";
import type { CommercialArtifactStore } from "./founder-commercial.ts";

export function founderCommercialArtifactStore(): CommercialArtifactStore {
  return {
    async putImmutable(key, bytes, contentType, metadata) {
      const r2 = getRuntimeEnv().R2;
      if (!r2) throw Object.assign(new Error("Private R2 storage is unavailable. Commercial artifact generation remains fail-closed."), { statusCode: 503 });
      if (await r2.get(key)) throw Object.assign(new Error("The immutable commercial artifact already exists."), { statusCode: 409 });
      await r2.put(key, bytes, { httpMetadata: { contentType }, customMetadata: metadata });
    }
  };
}
