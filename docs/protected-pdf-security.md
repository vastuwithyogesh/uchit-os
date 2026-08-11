# Founder Edition protected PDF contract

Founder Edition v3 reports use a private, immutable PDF workflow:

`FOUNDER_APPROVED -> GENERATED -> VERIFIED -> RELEASED`

- The source is the exact one-floor v3 report snapshot hash.
- The original full-colour hand-marked scan is embedded as an encrypted PDF attachment and its SHA-256 checksum is bound in the private manifest and visible report text.
- PDF bytes are deterministic for the same approved report snapshot, evidence bytes, renderer version, page configuration, and server-side owner secret.
- The private object key is never returned to the browser. Export and print always pass through the authenticated report route.
- PDF Standard Security revision 3 permits printing and disables conforming-reader permissions for editing, copying, accessibility extraction, and page assembly/extraction.
- The independently verified PDF SHA-256 hash, renderer version, page configuration, security profile, evidence checksum, actor, and release event remain immutable.
- A later approved report change must create a new report version and a new PDF object. Existing released bytes are never overwritten.

## Honest protection boundary

PDF permission flags are honoured by conforming readers, but they are not digital-rights management. A hostile reader may ignore permission flags, and no PDF can prevent screenshots, photography, or manual re-entry. Enforceable controls in this product are authenticated access, organisation/case/floor scope, private R2 storage, server-side release gates, encryption permissions, immutable hashes, and append-only audit evidence.

## Runtime configuration

`PDF_OWNER_SECRET` is server-only and must contain at least 32 characters. It must be managed as a production secret and must never enter AppState, diagnostics, bootstrap responses, logs, client JavaScript, or backups.
