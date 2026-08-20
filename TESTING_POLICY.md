# Uchit OS Testing Policy

Autonomy is proportional to verification.

## Layers
- Static/type checks
- Unit/domain tests
- Contract tests
- Integration tests
- Security/authorization tests
- Regression tests
- Golden flows
- End-to-end staging tests
- Post-deploy smoke checks

## Test integrity
- Never delete/skip/weaken a failing test merely to obtain green CI.
- Changes to protected tests automatically raise risk.
- Every behavioral change must have an appropriate verification path.
- A task is not DONE until acceptance is verified after merge/deploy when applicable.
