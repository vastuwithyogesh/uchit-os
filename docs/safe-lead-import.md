# Safe lead upload

Founder Edition exposes one compact **Upload leads** action in the Leads header. It reuses the canonical opt-in/client import authority; it does not write directly to Lovable or create a parallel client store.

## Accepted files

- CSV only. XLSX is deferred.
- Maximum 2 MB and 1,000 data rows, encoded as UTF-8.
- Recommended named format: **Vastu With Yogesh Apply Leads**.
- Exact columns: `id,name,email,phone,dob,city,created_at,status,notes,source,utm_source,utm_medium,utm_campaign,utm_term,utm_content,landing_page,referrer,assigned_to,deleted_at,property_stage,submission_count,last_submitted_at,client_code`.
- Exact header order is accepted directly; the same exact names may also be mapped in another order. Missing or additional names fail with a precise schema error.
- The original 14-column format remains available as **Uchit minimal template**.

Required Apply Leads values per row are `id`, `name`, at least one valid contact, `created_at`, `status`, `submission_count`, `last_submitted_at` and `client_code`. Indian ten-digit phones normalize to `+91`; an explicit international number must be valid E.164. Numeric-looking city values remain text. URLs are bounded to HTTP(S), while a landing page may also be a safe relative path.

`status=new` enters the canonical intake at `NEW`. `status=lost` without an approved reason is **Review Required**, never an automatic disqualification. Unknown statuses, non-normalizable phones, conflicting identities and conflicting immutable source IDs also require review. `assigned_to` is source metadata only and never changes Uchit ownership. `deleted_at` is a retained source tombstone only and never deletes or archives a client.

## Restricted source profile

The source record ID, external client code, DOB, source assignment, property stage, source tombstone, original phone display, submission telemetry and source URLs are stored in a versioned source-profile object inside the existing protected JSON payload. No D1 schema migration is required.

Only the Founder/SUPER_ADMIN projection may receive this profile. The lead drawer keeps selected source fields under a collapsed **Private source details** disclosure. DOB, raw URLs, source identifiers and source-only metadata do not appear in the primary table, standard intake, reports, evaluation, logs or public/client projections. DOB is not consumed by Numerology or any other methodology.

## Server workflow

1. `GET /api/optin-leads?template=1` returns the exact 23-column recommended template. `?template=minimal` returns the legacy safe template.
2. `POST /api/optin-leads` with `mode=preview` validates the entire batch without mutation.
3. Preview reports Created, exact match/link, Review Required, Invalid and source tombstone counts, plus the detected format.
4. `mode=confirm` resubmits the same file, file hash, global/organisation revisions and idempotency key.
5. The server revalidates scope and permissions, atomically persists accepted rows through the canonical state store and appends one immutable batch audit event.

Exact email/phone/source-reference matches link to the permanent Uchit Client ID. Multiple identities never auto-merge. Invalid rows disable the whole import; Review Required rows remain quarantined from canonical mutation. Identical file replays return the original outcome without duplicate clients, leads, timelines or audit events. A changed file under the same request key is a conflict.

This work does not activate Lovable, execute a backfill, run the dormant D1 v9 integration migration, enable client delivery, or change ownership, qualification, commercial, payment, case, evaluation, methodology or report state.
