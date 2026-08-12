# Founder synthetic visual-QA review package — 2026-08-13

## Scope

This package is source-driven and synthetic-only. It covers all 17 Founder steps and the 12 review routes at 1440×900 and 390×844. No files are selected, no mutation controls are clicked, and no communication/provider/payment/invoice action is executed.

The generated manifest is `output/visual-qa/founder-synthetic-visual-qa.manifest.json`.

## Review matrix

| Surface | Expected primary task | Responsive/accessibility checks |
| --- | --- | --- |
| Overview | Current context + Continue | keyboard focus, disabled/busy, recovery, no overflow |
| Leads | Table/drawer + one primary action | same |
| Lead Pipeline | Canonical move proposal | same |
| Clients & Cases | One case card + Continue case | same |
| Evaluation | One Utility/Shakti action; Details for context | same |
| Site Analysis | One site task + exact recovery | same |
| Post-Site Findings | One findings task + review states | same |
| Balance | Proof and confirmation; payment Details | same |
| Founder Approval | One approval action + conflict recovery | same |
| Protected PDF | One artifact action; release Details | same |
| Reports | Gated release path; progressive history | same |
| Diagnostics | Read-only technical recovery | same |

## Source findings

- Evaluation readiness recovery now routes to `/clients-cases`; the primary journey no longer requires `/ops`.
- Evaluation, manual evidence, balance, Founder approval and protected-PDF surfaces keep secondary context behind Details disclosures.
- Stage B remains `BLOCKED_METHOD_INPUT`; client delivery remains deferred; provider integrations remain dormant.
- Protected report export/print remains gated by the exact artifact release state.
- Existing CAS, idempotency, payment, report hash, approval and permission contracts are unchanged.

## Hosted inspection

Read-only authenticated staging DOM inspection reached the expected no-case/blocked report state, with mutation controls disabled. The available staging data is not a clean synthetic dataset and was not reproduced in this package.

Browser screenshot calls timed out in the available runtime. Therefore no screenshot artifact is claimed. Publication remains **NO-GO** until Yogesh reviews desktop/mobile screenshots from a clean synthetic authenticated environment.

## Owner review checklist

1. Open the generated manifest and confirm all 17 steps and 12 routes are present.
2. Capture each required surface at 1440×900 and 390×844 using clean synthetic data only.
3. Verify keyboard focus, disabled/busy states, conflict/retry recovery and zero horizontal overflow.
4. Confirm no mutation, message, upload, payment, invoice, provider or delivery action is exercised during review.
5. Approve or reject publication as a separate decision; this package does not authorize deployment.
