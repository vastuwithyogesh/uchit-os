import test from "node:test";
import assert from "node:assert/strict";
import { functionBody, source } from "./helpers/source-contracts.mjs";

const auth = source("lib/auth.ts");
const sessionRoute = source("app/api/session/route.ts");
const sessionProvider = source("components/session-provider.tsx");

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

test("client maps structured auth failures to safe fixed messages", () => {
  const body = functionBody(sessionProvider, "fetchSession");
  assert.match(body, /responseCode === "UNAUTHENTICATED"/);
  assert.match(body, /responseCode === "UNAUTHORIZED"/);
  assert.doesNotMatch(body, /failure\.error\?\.message/);
});
