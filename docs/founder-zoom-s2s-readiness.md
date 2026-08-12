# Founder Zoom Server-to-Server OAuth readiness

Status: dormant local contract. The internal Zoom app exists, but no credential is assumed configured and no Zoom meeting has been created by this implementation.

## Fixed Founder policy

- Approved Review Call host: `iyogesh2020@gmail.com` only.
- OAuth mode: Zoom Server-to-Server OAuth.
- Required least-privilege scopes: `meeting:write:admin`, `meeting:read:admin`, `user:read:admin`.
- Review Call duration: 30 minutes. Scheduling conflict occupancy also includes the existing hidden 15-minute buffer.
- One unique meeting is created only after client confirmation. Idempotent replay returns the same binding. A reschedule retires the prior meeting before one replacement is created.
- Provider IDs and join/start/password metadata stay private. Client communication remains manual `PREPARED`/`OPENED`; meeting creation never proves a message was sent or delivered.

## Private staging configuration

Configure these only as private server runtime entries in the isolated private staging project. Do not paste values into chat, source, logs, screenshots or client-side settings.

| Name | Purpose | Safe readiness check |
|---|---|---|
| `ZOOM_ACCOUNT_ID` | Server-to-Server OAuth account binding | present and at least 8 characters |
| `ZOOM_CLIENT_ID` | Server-to-Server OAuth client identity | present and at least 8 characters |
| `ZOOM_CLIENT_SECRET` | Server-to-Server OAuth client secret | present and at least 16 characters |
| `ZOOM_HOST_EMAIL` | Exact approved host binding | equals `iyogesh2020@gmail.com` |
| `ZOOM_INTEGRATION_ACTIVATION` | Bounded smoke gate only | exact value `BOUNDED_SYNTHETIC_SMOKE_APPROVED` after explicit approval |

The authenticated System Check returns only readiness booleans and the approved scope names. Zoom remains a deferred integration and does not change the main Founder staging GO/NO-GO result. `liveActivationEnabled` is always false in this slice.

## Bounded synthetic smoke

Run only in the explicitly approved isolated private staging environment after diagnostics reports `READY_FOR_BOUNDED_SYNTHETIC_SMOKE`:

`pnpm smoke:founder-zoom -- --acknowledge-bounded-private-staging-smoke`

The harness acquires a token, validates the exact host, creates one synthetic 30-minute meeting, verifies protected join metadata, replays the same idempotency key without another meeting, retires the original, creates exactly one replacement, and retires the replacement. Its output contains booleans only—no credential, access token, provider meeting ID or join link.

Stop if any cleanup call fails. Record only the boolean report and provider-side operator confirmation; never copy a meeting link into a ticket or log. Production activation, real Review Calls and client communications require separate approval.

## Remaining activation blockers

- The three private credentials and exact host binding must be configured and verified in the isolated target.
- The provider account must return all three approved scopes and the host user must be active.
- A production-grade private metadata encryption/key-rotation implementation must be selected for real booking persistence; the smoke harness deliberately hashes transient metadata and stores nothing.
- Durable cross-worker meeting-creation reservation/concurrency must be rehearsed against the isolated D1 before real booking activation.
- No deployment, live meeting, client message or production activation is authorised by this runbook.
