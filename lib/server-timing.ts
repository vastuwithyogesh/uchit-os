export type TimingSink = (name: string, durationMs: number) => void;

function timestamp() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function createServerTiming() {
  const durations = new Map<string, number>();
  const totalStartedAt = timestamp();

  return {
    start: timestamp,
    end(name: string, startedAt: number) {
      durations.set(name, Math.max(0, timestamp() - startedAt));
    },
    record(name: string, durationMs: number) {
      durations.set(name, Math.max(0, durationMs));
    },
    finish() {
      durations.set("total", Math.max(0, timestamp() - totalStartedAt));
    },
    header() {
      return [...durations.entries()]
        .map(([name, durationMs]) => `${name};dur=${durationMs.toFixed(1)}`)
        .join(", ");
    }
  };
}

export function withServerTiming<T extends Response>(response: T, timing: ReturnType<typeof createServerTiming>) {
  timing.finish();
  response.headers.set("Server-Timing", timing.header());
  return response;
}
