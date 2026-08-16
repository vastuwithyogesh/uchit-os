export function buildActionHeaders(role?: string, options?: { multipart?: boolean }) {
  const headers: Record<string, string> = options?.multipart ? {} : {
    "Content-Type": "application/json"
  };

  if (typeof window !== "undefined" && role && window.location.hostname === "localhost") {
    headers["x-uchit-demo-role"] = role;
  }

  return headers;
}
