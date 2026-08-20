const STAGING_HOST_MARKERS = ["staging", "localhost", "127.0.0.1", "::1"];

export function isFounderFastFlowHost(host: string | null | undefined) {
  const normalized = String(host ?? "").split(":")[0].trim().toLowerCase();
  return Boolean(normalized) && STAGING_HOST_MARKERS.some((marker) => normalized === marker || normalized.includes(marker));
}

export function isFounderFastFlowRequest(host: string | null | undefined, isFounderOwner: boolean) {
  return isFounderOwner && isFounderFastFlowHost(host);
}
