export function buildActionHeaders(role?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (typeof window !== "undefined" && role && window.location.hostname === "localhost") {
    headers["x-uchit-demo-role"] = role;
  }

  return headers;
}
