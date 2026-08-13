import test from "node:test";
import assert from "node:assert/strict";
import { functionBody, source } from "./helpers/source-contracts.mjs";

const auth = source("lib/auth.ts");
const sessionRoute = source("app/api/session/route.ts");
const sessionProvider = source("components/session-provider.tsx");
const siteHeader = source("components/site-header.tsx");

test("client requires session contract version 1", () => {
  assert.match(sessionProvider, /version: 1;/);
  assert.match(functionBody(sessionProvider, "fetchSession"), /payload\.version !== 1/);
  assert.match(sessionRoute, /version: SESSION_API_VERSION/);
});

test("missing role input has no privileged fallback", () => {
  assert.match(functionBody(auth, "resolveActor"), /return getUserByRole\("CLIENT"\)/);
  assert.doesNotMatch(functionBody(auth, "resolveActor"), /return getUserByRole\("SUPER_ADMIN"\)/);
  assert.match(auth, /if \(!validId \|\| !validEmail\) \{\s*throw new AuthenticationError/);
});

test("demo elevation requires development, explicit opt-in, and loopback", () => {
  const body = functionBody(auth, "isExplicitLocalDemo");
  assert.match(body, /process\.env\.NODE_ENV !== "production"/);
  assert.match(body, /process\.env\.UCHIT_VASTU_DEMO_MODE === "true"/);
  assert.match(body, /isLocalRequest\(headers\)/);
  assert.match(functionBody(auth, "isLocalRequest"), /localhost\|127/);
});

test("session success and auth failures cannot be cached", () => {
  assert.match(sessionRoute, /"Cache-Control": "no-store, private"/);
  assert.match(functionBody(auth, "authErrorResponse"), /"Cache-Control": "no-store"/);
  assert.match(functionBody(sessionProvider, "fetchSession"), /cache: "no-store"/);
});

test("session verification cannot leave the workspace on an infinite loading state", () => {
  const body = functionBody(sessionProvider, "fetchSession");
  assert.match(sessionProvider, /SESSION_REQUEST_TIMEOUT_MS = 12_000/);
  assert.match(body, /new AbortController\(\)/);
  assert.match(body, /signal: controller\.signal/);
  assert.match(body, /controller\.abort\(\)/);
  assert.match(body, /Session verification timed out\. Check your connection and try again\./);
  assert.match(body, /window\.clearTimeout\(timeoutId\)/);
  assert.match(sessionProvider, /Try again/);
});

test("authenticated display names are decoded only with the declared encoding", () => {
  const body = functionBody(auth, "resolveAuthenticatedDisplayName");
  assert.match(body, /oai-authenticated-user-full-name-encoding/);
  assert.match(body, /encoding !== "percent-encoded-utf-8"/);
});

test("client maps structured auth failures to safe fixed messages", () => {
  const body = functionBody(sessionProvider, "fetchSession");
  assert.match(body, /responseCode === "UNAUTHENTICATED"/);
  assert.match(body, /responseCode === "UNAUTHORIZED"/);
  assert.doesNotMatch(body, /failure\.error\?\.message/);
});

test("public visitors get the platform sign-in path and can switch accounts safely", () => {
  assert.match(sessionProvider, /sessionErrorCode === "UNAUTHENTICATED"/);
  assert.match(sessionProvider, /href="\/signin-with-chatgpt\?return_to=\/"/);
  assert.match(sessionProvider, /Sign in with ChatGPT/);
  assert.match(siteHeader, /href="\/signout-with-chatgpt\?return_to=\/"/);
  assert.match(siteHeader, /!isLocalDemo/);
});
