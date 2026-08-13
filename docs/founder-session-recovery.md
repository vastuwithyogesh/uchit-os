# Founder session recovery

The workspace verifies the authenticated owner session before rendering client or operational data. The browser gives `/api/session` a bounded 12-second window; a stalled request is aborted and becomes a safe `SESSION_UNAVAILABLE` state rather than leaving the screen on an indefinite loading message.

Owner recovery:

1. Confirm the main staging URL is open in the authenticated in-app browser as `iyogesh2020@gmail.com`.
2. Wait for the bounded verification window. If it expires, choose **Try again** once.
3. If the message says sign-in could not be verified, choose **Sign in with ChatGPT** and return to the staging URL.
4. If the message says the account has no access, stop and verify the Sites owner allowlist; do not change application roles or bypass authentication.
5. If repeated retries remain unavailable, inspect `/diagnostics` after the session succeeds. Never read or copy secret values and never use a bypass identity for business QA.

The retry path is read-only. It does not write business data, migrate D1, activate integrations or send communications.
