# Uchit OS Autonomy Policy

## R0 — Routine
May build, review, test, merge and deploy automatically when all required checks pass.
Typical: docs, test additions, safe accessibility/copy/styling corrections, non-behavioural cleanup.

## R1 — Reviewed Engineering
May build automatically. Requires independent review, required CI, staging and verification. May auto-merge/deploy after all gates pass.
Typical: ordinary bug fixes, normal UX/performance work, isolated compatible API/backend/frontend changes.

## R2 — Protected
May inspect and prepare isolated implementation/test evidence. Protected transition cannot auto-merge or auto-deploy without explicit product/owner approval.
Includes auth, permissions, financial logic, commercial gates, methodology logic, destructive/complex migrations, secrets/security architecture, production data mutation, major architecture, AI autonomy escalation.

## R3 — Prohibited Autonomously
Deny autonomous execution. Examples: bypass auth, weaken permissions/security tests to pass CI, expose secrets, erase audit history, force-push protected main, silently change methodology, destructive production actions outside governed migration/recovery policy.

## Non-self-escalation rule
An AI agent may not modify autonomy/governance policy and then rely on the changed policy in the same autonomous workflow.

## Risk monotonicity
Risk may automatically escalate from discovered intent/files/blast radius. Risk never automatically downgrades during the same task.
