# Wealth and Planning verification

This is an independently invented synthetic household demonstration. Fineract remains the bank authority. No planning command posts to the core, imports personal finances, sends a notification, or executes an investment.

## Implemented boundary

Four deterministic Indian household samples have reconciled signed postings, ownership and source inventory. The planning route connects wealth history, filtered cash flow, category budgets, transaction drilldowns, commitments, a 90-day forecast, annual retirement calculations, editable/versioned alternatives and acknowledged insights. Gross assets and card/loan liabilities are explicit; locked holdings and homes are excluded from available retirement capital.

Device preview and shared relationship records are deliberately separate. Shared edits require a verified relationship and customer owner. Officers can read only after household consent; approvers have no planning access. Defaults initialize through explicit setup, once. Version checks reject stale saves. Original inputs and keys survive lost responses; inspection precedes an explicit same-key retry. Unverified responses never clear the original reference. Immutable audit records apply saved snapshots atomically.

## Local runtime

The planning-only Worker uses `planning-preview.jsonc`, a non-existent remote database identifier, `remote: false`, a distinct session cookie and loopback checks. Its dedicated persistent directory is `~/.cache/openfinacle-finacle5-planning-server`. It has no banking core or R2 binding. `/api/planning-preview/session` is a synthetic role/relationship test driver in this local harness only.

Build before starting; stop only the owned preview before rebuilding its exported assets:

```sh
bun run build
bun src/cli/planning-preview.ts start
```

Open `http://127.0.0.1:8795/planning`. Device preview works immediately. For real local D1 persistence, expand “Local planning-only demonstration session”, select an invented relationship/customer, then explicitly set up the selected household. “Shared relationship” never falls back to device records when verification fails.

The `prepare` CLI was run once against this dedicated local database. It executes only the preview tenancy/session schema and the planning SQL contract with explicit `--local --persist-to`; repeat preparation is not a reset or migration strategy. `status` reads the count of saved planning households. This follows the [Cloudflare local D1 persistence mechanism](https://developers.cloudflare.com/d1/best-practices/local-development/).

## Executed evidence

On 17 October 2026, the complete current-source gate passed:

```sh
DOCKER_HOST=unix:///Users/SenG/.colima/upwork-v2/docker.sock bun run check
```

It ran TypeScript, Biome, Oxlint, Knip, dependency boundaries, type coverage, 122 Bun tests / 1,201 assertions, static production export and the Worker/container deployment dry run. Existing repository lint warnings are retained. Focused planning tests passed 18 tests / 627 assertions.

The normal local Worker passed all 24 workspace browser tests, including the existing banking journeys and three planning journeys. The added regression drills July20–August5 into only the selected July portion, reconciles source totals, and restores dates, filters and originating keyboard focus on Back. The existing persona helper was preserved.

The isolated planning Worker passed eight actual D1 browser journeys:

- Budgets and longer-horizon scenario saves survive reload; consented officer review is read-only, revocation removes access, and approver access is denied.
- A lost committed response retains original inputs across reload; inspection confirms the same record without another POST. An officer without consent cannot inspect the owner's retained snapshot.
- A definitively absent command permits one explicit retry of the original key and inputs.
- Another relationship cannot read the saved household or submit an old relationship context.
- Unavailable device storage blocks the POST before an unrecoverable command can be sent.
- A concurrent stale save cannot overwrite newer budgets; an inspected absent command can be discarded and the current state reloaded.
- A malformed successful response retains its original reference until the actual committed command is inspected.
- Budget copy and deletion persist without reseeding defaults.

Run phase one explicitly:

```sh
bunx playwright test e2e/planning-persistence.preview.spec.ts --config planning-preview.playwright.config.ts
```

Then stop and restart only the local planning Worker, keeping its database directory. Phase two requires the invented relationship and exact version printed by phase one:

```sh
PLANNING_RESTART_RELATIONSHIP=<phase-one-relationship> PLANNING_RESTART_VERSION=<phase-one-version> bunx playwright test e2e/planning-restart.preview.spec.ts --config planning-preview.playwright.config.ts
```

The actual shutdown/restart verification passed against `synthetic-preview-5b69e8f7-fae8-4122-bc3d-78809d1233ea`, version5: the budget remained ₹123, the saved education alternative and revoked consent remained intact, six audit entries remained, and no setup/reseed occurred. These identifiers contain no real financial data. Browser traces are disabled to avoid retaining session cookies. Desktop1440px and mobile390px/extra-large text screenshots were captured; chart label bounds and page overflow were checked.

## Calculation limits

All amounts accumulate in integer paise, with explicit rounding. Annual periods end17October, starting2027; displayed age is at period start. The model exposes its assumptions and funding gaps rather than a probability of success. Annual stress returns are a defined deterministic scenario. Historical valuation paths are explicitly synthetic reconstructions; XIRR is unavailable without eligible dated valuation/flow evidence.

The 90-day forecast uses the saved baseline income/pension, living/dependent costs, SIP and fixed EMI. It treats cash after card liabilities as available, including reserve accounts. Annual career breaks, prepayment, shocks and irregular invoice timing are excluded and disclosed. The professional tax reserve is an illustrative15% estimate, not an Indian tax calculation. No market prices, financial recommendations or stochastic confidence claims are produced.

## Shared integration and release checkpoint

Finacle4 retains the shared router, customer navigation, migration numbering and canonical release. No such shared file was edited. `planning-schema.sql` remains an inactive schema contract outside the numbered migration registry; only the isolated local preview database received it.

Integration needs an acknowledged owner/lease for the `planningRequest` hook after session verification in `src/http.ts`, the customer planning navigation entry, a reserved D1 migration identity and protected exact-source backup/restore proof. Finacle4 must serialize canonical synchronization, migration, deployment and exact live revision verification. Queued coordination messages do not grant that lease. Local verification and private PRs are not a deployed release; epic `of-i38` remains open until that checkpoint is fulfilled. Finacle6 activation remains blocked by that completion boundary.
