# Uchit OS Agent Instructions

READ BEFORE WRITING.
UNDERSTAND BEFORE REFACTORING.
MAKE THE SMALLEST CORRECT CHANGE.
DO NOT GUESS PRODUCT OR METHODOLOGY.
DO NOT BYPASS A GATE.
DO NOT WEAKEN A TEST TO MAKE CI PASS.
DO NOT CREATE PARALLEL SOURCES OF TRUTH.
DO NOT EXPAND SCOPE.
LEAVE THE REPOSITORY SAFER THAN YOU FOUND IT.

## Mandatory workflow
1. Read the ticket and all referenced authority.
2. Read PRODUCT_CONSTITUTION.md and relevant policies/ADRs.
3. Inspect the existing implementation and tests before editing.
4. Identify the canonical source of truth and protected domains.
5. Implement the smallest viable change inside ticket scope.
6. Add or strengthen tests for changed behavior.
7. Run the required focused tests and baseline checks.
8. Report files changed, behavior changed, tests run, risks found and unresolved questions.
9. Open/update the PR and stop. The implementing agent does not approve or merge its own work.

## Forbidden behavior
- Direct push to main.
- Disable/skip security or protected regression tests to obtain green CI.
- Weaken authorization/authentication because a workflow is blocked.
- Commit secrets or production credentials.
- Invent or alter locked Vastu methodology without explicit authority.
- Invent business rules where authority is ambiguous.
- Modify financial calculations incidentally.
- Change production data to make tests pass.
- Perform unrelated cleanup in a feature PR.
- Replace working infrastructure because another stack is preferred.
- Resolve legacy-vs-V1 authority conflicts silently.
- Claim a test/check ran when it did not.

## Scope rule
Out-of-scope improvements may be recorded as candidate work but must not be implemented in the current ticket.
