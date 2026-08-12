# Founder Edition sequential flow v5

The Founder home is a handoff page, not a dashboard. It shows the selected client/project/floor context, server-derived progress, the current module and one Continue action. Continue opens `/founder/01` through `/founder/12`, where each page owns one module only.

## Page contract

1. Client and commercial readiness
2. Case/project setup
3. Floor setup
4. Plans, evidence and orientation
5. Gridding, 32D/16D and manual sheet
6. Utility and Shakti evaluation
7. Site analysis and post-site findings
8. Stage A verdict and Founder review
9. Balance/payment clearance
10. Founder approval and protected report
11. Delivery history and follow-up
12. Stage B handoff (blocked until approved remedial methodology)

Each module page renders its purpose, server-derived status, required inputs, one primary action and Back. A blocked or future page points back to the exact prerequisite; it never unlocks work from the client. Completed pages offer only the server-derived next step. Previous steps are available from the compact progress disclosure.

The page layer is navigation only. Existing action routes remain responsible for authorization, payment and evidence gates, optimistic concurrency, idempotency, audit history, regeneration and immutable report lineage. Stage B and client delivery remain deferred.

## Verification

`tests/founder-flow.test.mjs` now covers the dedicated 17-step route contract, exact case/floor context, FE-SITE-01 ordering, future-step gating, previous-step access, real in-page editing surfaces, progressive Details disclosure, Stage B/client-delivery deferral and mobile/focus/reduced-motion requirements.
