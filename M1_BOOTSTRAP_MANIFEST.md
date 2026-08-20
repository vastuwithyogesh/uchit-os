# M-1 / M0 Bootstrap Manifest

## Purpose
Prepare repository governance and automation scaffolding without modifying Uchit OS product behavior.

## Safe to install only after
1. Exact canonical GitHub repository is identified.
2. Dirty local work is reconciled against current production truth.
3. A known-good baseline SHA is frozen.
4. Existing test/build commands are mapped to logical suite IDs.
5. Protected path patterns are replaced with exact repository-aware paths.

## Installation order
1. Governance markdown files
2. `.uchit` configuration
3. GitHub issue template
4. Policy-gate workflow (non-mutating)
5. Validate baseline tests
6. Only then implement Codex dispatch/reviewer/repair controller

## Explicitly dormant
Autonomous task dispatch must remain disabled until M-1 is complete and a known-good baseline is certified.
