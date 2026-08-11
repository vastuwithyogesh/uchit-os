# Utility and Shakti activation handoff — Founder Edition

Status: **Blocked — Methodology Input Required**

This is an interface contract for the next planning slice. It does not activate either engine and contains no utility rules, Shakti mappings, thresholds, priorities, or remedies.

## Binding contract

An approved organisation methodology binding must provide, for each module:

- module: `UTILITY` or `SHAKTI_ELEMENT`
- methodology version, content hash, rule IDs and source references
- approved input schema and validation rules
- deterministic adapter version and output schema
- golden fixtures with expected outputs
- handling for unknown, contradictory and missing inputs (`REVIEW_REQUIRED` or `BLOCKED_METHOD_INPUT`)

The adapter receives only the exact active case, floor, current plan, locked orientation, approved manual 32D/16D evidence references, and the approved methodology version. It must return a versioned, deterministic snapshot with input hash, output hash, selected rule IDs, methodology content hash, and an explainable decision status. It must never infer geometry, direction boundaries, space labels, utility outcomes, or remedies.

## Activation gates

Activation remains blocked until the Methodology Owner approves both bindings and fixtures. Once approved, the server must require:

1. exact organisation/case/floor/revision scope;
2. current plan and locked orientation;
3. Founder-confirmed manual 32D and 16D evidence;
4. no open regeneration blockers;
5. valid approved methodology binding and fixture coverage;
6. dual record/global concurrency and idempotency;
7. immutable evaluation provenance and audit event.

No client delivery, report release, or Stage B remedial selection may use an unapproved adapter output.

## Required negative tests before activation

- missing or contradictory methodology → explicit blocked/review status;
- unknown utility or unsupported Shakti input → no guessed result;
- wrong floor, plan, case revision or organisation → fail closed;
- stale versions → 409; missing versions → 428;
- changed methodology → new evaluation version, never an in-place rewrite;
- identical retry → original snapshot and no duplicate audit;
- upstream evidence/orientation change → Needs Regeneration;
- no remedy output or remedy mapping from either adapter.
