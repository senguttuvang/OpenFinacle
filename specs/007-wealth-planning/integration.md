# Wealth and Planning portal integration

The existing portal now exposes **Wealth & Planning** alongside accounts, cards, deposits and loans. Customer and officer navigation use the same reusable planning workspace; approvers have no planning tab or API access. The portal retains its shell, persona picker, command search, reading-size control and existing banking journeys. The direct `/planning` demonstration remains available.

## Ownership and data boundary

The embedded workspace uses shared server records exclusively, even if this browser previously selected device preview. Its React instance is scoped to the portal's bank and role. The server verifies `of_session` through the existing `getSession` guard before dispatching the exact `/api/planning` namespace. Every command/read uses the authenticated `bank_id` and selected independently invented household. A client-supplied different relationship is rejected. This scope follows the current portal session contract; future customer switching must update that context and preserve the remount key.

Customers explicitly initialize a household once. Scenarios, budgets, insight acknowledgments and review consent persist in D1. Officer access requires household consent and is read-only; revocation is immediate on the next request. Banking approval confers no planning permission. Original command inputs/keys survive ambiguous responses, with inspection before an explicit retry. No planning command calls Fineract or changes banking balances, loan/deposit/card state or financial snapshots.

## Migration and release

`migrations/0015_planning.sql` is the authoritative additive schema. It adds `planning_households`, `planning_events` and the apply/immutable-update/immutable-delete triggers. Banking table definitions remain unchanged. The same atomic event insertion advances the saved snapshot; version and command uniqueness guard competing writers.

The protected workflow restore verifier accepts an export with no planning schema. When planning exists it requires both tables and all three correctly associated trigger names. Every partial combination is tested. Existing strict SQL-bail behavior and the repayment complete-group guard remain intact. A source-bound full migration-chain SQL dump/restore test verifies planning state, original command input/key, foreign keys, and immutability after restore.

Finacle4 alone performs GitHub merge, protected exact-source backup, actual target migration, canonical synchronization, deployment and live exact-revision verification. This integration worktree performs no production migration, deployment, financial instruction or main merge. Migration0016 belongs to Finacle7;0017 belongs to Finacle6. The original5e927e2 planning worktree remains preserved. The new PR supersedes the older independent planning stack as the portal integration candidate; its original commits/PRs remain evidence until the coordinator integrates it.

## Verification surfaces

Full exact-source repository gate:

```sh
bun run check
```

This includes the current banking tests, strict types/lint/static/dependency checks, production export and Worker/container dry run. The authenticated HTTP tests cover absent/expired sessions, the existing production-identity/demo guard, context mismatch, command replay/conflict, consent/revocation and approver exclusion, and assert zero Core calls or banking command/event writes.

The48-test workspace browser suite covers the preserved banking flows plus the existing three planning journeys. The local D1 suite covers eight persistence/recovery journeys and three portal journeys: navigation and save/reload, actual persona/consent boundaries, relationship isolation, one main landmark, desktop1440 and390px extra-large reflow. The persona test waits for the real role change to finish before interacting with the replacement navigation. Browser traces remain off for the local persistence suite to avoid retaining session cookies.

## Local preview

The new loopback-only preview uses a separate database under `~/.cache/openfinacle-finacle5-portal-integration` and port8796. The old8795 preview/database is untouched. Its config has a non-existent remote D1 identifier, `remote: false`, and no Core/R2 binding. `prepare` applies the real migration chain only to this dedicated local database; it does not reset records. An explicit local session creates an invented zero-balance portal-shell fixture once. It is not evidence of a core account, a core-backed financial posting, or a failed-core fallback. Other banking endpoints and refresh-to-Core are blocked in this harness.

```sh
bun run build
bun src/cli/planning-preview.ts prepare
bun src/cli/planning-preview.ts start
```

Stop only this owned server before rebuilding its exported assets. Open `http://127.0.0.1:8796/planning`, expand “Local planning-only demonstration session”, choose a synthetic customer relationship and click “Use local preview session”. Follow the OpenFinacle link to `http://127.0.0.1:8796/` and choose **Wealth & Planning**. The portal uses the real HTTP/session/planning handlers and actual local D1, with a deliberately invented shell snapshot and no Core calls. The ordinary deployed portal uses its existing bank session, without this local driver.

Browser commands after startup:

```sh
BASE_URL=http://127.0.0.1:8796 bunx playwright test --project=workspace
bunx playwright test e2e/planning-persistence.preview.spec.ts e2e/planning-portal.preview.spec.ts --config planning-preview.playwright.config.ts
```

Then actually stop/restart this owned Worker with the same persistent directory and use phase one's non-secret `FINACLE5_RESTART_PROOF` relationship/version:

```sh
PLANNING_RESTART_RELATIONSHIP=<captured-relationship> PLANNING_RESTART_VERSION=<captured-version> bunx playwright test e2e/planning-restart.preview.spec.ts --config planning-preview.playwright.config.ts --output test-results/planning-restart
```

The restart assertion checks the exact saved version, budget, education alternative, revoked consent, audit count and absence of reseeding. Local preview and a ready private PR do not close epic `of-i38`; Finacle4 records the integrated release and live proof.
