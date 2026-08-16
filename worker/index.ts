import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import type { D1DatabaseBinding, R2BucketBinding } from "../lib/runtime-env";

interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

interface Env {
  DB?: D1DatabaseBinding;
  R2?: R2BucketBinding;
  /** Server-only inbound integration secret. Never serialize this binding. */
  OPTIN_WEBHOOK_SECRET?: string;
  /** Server-only owner secret used to encrypt immutable final PDFs. */
  PDF_OWNER_SECRET?: string;
  ASSETS: Fetcher;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    (globalThis as typeof globalThis & { __uchitEnv?: Env }).__uchitEnv = env;
    const url = new URL(request.url);
    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }
    if (url.pathname.startsWith("/_next/static/")) {
      const response = await env.ASSETS.fetch(request);
      const headers = new Headers(response.headers);
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }
    return handler.fetch(request, env, ctx);
  },
};

export default worker;
