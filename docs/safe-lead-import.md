# Safe lead upload

Founder Edition exposes one compact **Upload leads** action in the Leads header. It reuses the canonical opt-in/client import authority; it does not write directly to Lovable or create a parallel client store.

## Accepted file

- CSV only. XLSX is deferred.
- Maximum 2 MB and 1,000 data rows.
- UTF-8 encoding.
- Template columns: `full_name,email,phone,city,service_interest,source,received_at,message,utm_source,utm_medium,utm_campaign,utm_term,utm_content,status`.
- `full_name` and at least one email or phone column are required.
- Imported canonical stage defaults to `NEW`. Any non-NEW source stage is Review Required rather than applied.
- `service_interest`, when supplied, must be exactly `EXISTING_SPACE` or `NEW_CONSTRUCTION`; otherwise it is Review Required.

Unknown columns fail the batch. DOB/numerology, owner/assignment, raw payload, payment, proposal, case, evaluation and report fields are never accepted. Formula-like cells, markup/control characters, invalid contacts and invalid encoding fail validation.

## Server workflow

1. `POST /api/optin-leads` with `mode=preview` and the file validates the entire batch without mutation.
2. The response returns the file hash plus current global and organisation revision tokens.
3. `mode=confirm` resubmits the same file, hash, tokens and idempotency key.
4. The server revalidates, resolves the organisation from the authenticated Founder, checks exact/review/ambiguous identity outcomes, applies accepted rows, persists through the canonical state store and appends one immutable audit event.

Exact email/phone matches link to the permanent client. Multiple identity matches are Review Required and never auto-merge. Any invalid row disables the whole import. Identical retries return without duplicate clients, leads, timeline events or audit entries.

This slice does not activate Lovable, execute a backfill, run D1 v9 integration behavior, enable client delivery or change payment/evaluation/report gates.
