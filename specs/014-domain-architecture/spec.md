# Domain Architecture And Fitness

This refactor makes OpenFinacle's tree reflect its public product site, banking capabilities, synthetic demonstration, runtime and operations while preserving observable behavior.

## Scope

Move implementation out of Next.js route directories. Group domain, application, UI and adapter responsibilities by banking capability; separate invented datasets and demo administration. Decompose oversized code and tests by coherent responsibility. Adapt the applicable 1851 architecture, lint, dependency, complexity, duplication and LOC checks to this repository. Persist reusable conventions as shared discoverable skills.

## Acceptance

- Existing public URLs, static exports, API methods and CLI command behavior remain intact.
- Existing financial invariants, approval separation, idempotency and uncertain-outcome handling remain intact.
- Authored source, styles and tests stay at or below 700 lines, route shells at or below 120 lines, and implementation directories at or below 15 direct files.
- Unknown roots, generic naming, reversed dependencies and private cross-capability imports fail deterministic architecture checks.
- The normal CI command runs the new gates alongside existing type, behavioral, build and container checks.
- Relevant browser journeys verify the candidate after concurrent entry/profile changes are reconciled.

## Constraints And Recovery

Keep Bun, Effect, Next.js, Fineract and the existing storage/migration contracts. Do not copy 1851 tenant data or content-platform-specific rules. Preserve stylesheet order and client boundaries. Keep active work isolated; the shared release lease controls integration/deployment. A failed or unavailable full check blocks merge. The feature branch and original revision provide the review and recovery boundary; no deployed data migration is introduced.

Beads `of-hcg` owns execution and verification evidence.
