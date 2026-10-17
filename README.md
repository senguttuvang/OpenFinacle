# OpenFinacle

A working everyday banking demonstration, with an original customer portal and a staff workspace over Apache Fineract. Private source; synthetic customers and demonstration money.

## Run and check

The full check and protected workflow-release commands require `sqlite3` 3.38+ with safe mode and JSON support. CI installs it explicitly. SQL restore verification runs only in a disposable in-memory database and rejects every failed statement.

```sh
bun install --frozen-lockfile
bun run check
bun run test:e2e
```

The browser journey defaults to https://openfinacle.plts.in. Set `BASE_URL` to verify another deployed environment. It creates an isolated demo workspace and verifies account opening, independent approval, deposit, beneficiary confirmation, both legs of a transfer, salary debit/credit, statement export, insufficient funds and mobile layout.

## What to try

1. Choose **Start your banking story** for a new applicant, or **Explore existing customer** for an active account with sample activity. Each browser session has its own customer, beneficiary and funded employer. Reloading resumes the workspace; **Choose another journey** ends that demo session and returns to the chooser.
2. Open **Account opening**, attach the provided synthetic documents and submit.
3. Switch to **Bank officer** and recommend opening. Switch to **Approver** and approve.
4. As the officer, prepare an initial deposit. The separate approver authorises it.
5. As the customer, add Arjun as a beneficiary, confirm the displayed demo code, and transfer funds.
6. As the officer, prepare salary from Northstar Studio. Approve it separately and inspect the customer, beneficiary and employer balances.
7. Explore statement export, cash reversal, debit restrictions, service requests and audit.

Persona switching is explicitly a demonstration control, not production identity management. No real documents, SMS, cards, cheque dispatch or external bank transfers are involved. Every supported financial effect executes in Fineract; there is no mock-balance fallback.

The existing-customer journey begins at ₹1,21,300: ₹40,000 opening funds + ₹85,000 employer-funded salary − ₹2,500 internal payment − ₹1,200 cash withdrawal. All four sample transactions post on today's business date. Its account-led interface uses public historical ICICI layout references: horizontal navigation, service shortcuts, savings portfolio, orange action strip and recent transactions. It retains OpenFinacle identity and does not claim parity with the unavailable current authenticated portal. See the [reference evidence and implementation plan](specs/002-customer-experience/plan.md).

## Architecture and ownership

The project owner confirmed Fineract as the core on 2026-10-16. The [accepted decision](specs/decisions/001-banking-core.md) records custom TypeScript, TigerBeetle and ERP/accounting alternatives, tradeoffs and production-effort assumptions. The [customer experience specification](specs/002-customer-experience/spec.md) covers both new applicants and existing customers. Public references replaced the unavailable authenticated review at the owner's request.

- **Next.js / React:** customer and staff experiences, built to static assets.
- **Effect-TS on Cloudflare Workers:** session/ownership checks, application workflows, approval rules and integration adapters. No Java rewrite and no CMS dependency.
- **Apache Fineract 1.15.0 on Cloudflare Containers:** customer accounts, savings products, internal transfers, cash transactions and configured cash accounting.
- **Railway PostgreSQL:** Fineract tenant registry and banking database. Cloudflare D1 speaks SQLite rather than PostgreSQL, and container disks are ephemeral; this is the persistence reason for the Railway component.
- **D1:** demo sessions, onboarding, beneficiaries, workflow command records, requests and application audit.
- **Permanent demo scenarios:** operator-seeded new/existing journeys and saved Fineract account views for fast entry. No per-visit financial provisioning, workspace pool or Cron. The two scenarios are shared synthetic data; ending a session does not reset them.
- **R2:** private synthetic document objects. Downloads require the same demo session.

Financial balances and transactions have one owner: Fineract. Local workflow state refers to core IDs. Approval claims use conditional SQL updates; duplicate command keys are unique per workspace. Ambiguous core responses remain `uncertain`, and executing/uncertain commands are never automatically replayed. These exceptions require inspection and reconciliation; they do not claim an atomic transaction across D1 and Fineract.

The core uses one private technical principal. Application audit records the originating demo role. Maker/checker separation for these composed workflows is enforced in OpenFinacle; it is not represented as separate Fineract principals.

## Upstream and source analysis

Source: https://github.com/apache/fineract, release `1.15.0`, commit `d5636847ac556c30b437254c353f05526d172b97`. The unchanged reference clone is at `~/Projects/Finacle`; OpenFinacle source is a separate repository.

Fineract is a Java/Spring server with JAX-RS APIs, command handlers, application services, financial domain models, persistence, scheduled work and accounting. Read APIs use read services; state-changing APIs enter command processing. Its API and banking logic ship together, while the Mifos web application and customer self-service plugin are separate repositories. See upstream `SECURITY.md`, `SavingsAccountsApiResource.java`, `SavingsAccountTransactionsApiResource.java`, `ClientsApiResource.java` and `AccountTransfersApiResource.java`.

Application features are written in TypeScript over the API. Java customization is needed only when changing behavior that must occur within the core's own transaction, such as accounting or calculation rules. Plugin extension points are version-dependent; we do not assume arbitrary core services can be replaced.

The release has no matching `apache/fineract:1.15.0` Docker Hub image tag. The repository builds a Java 21 image from the official binary distribution and verifies its published SHA-512 checksum. Apache license/notice obligations remain applicable. See `infrastructure/fineract/Dockerfile`.

CodeCompass discovered 6,825 candidate files and 80,408 symbols but had only embedded about 1,050 symbols after four minutes, without usable search results. The partial job was cancelled. Source inspection proceeded through rg/direct reads with explicit user authorization. This is not a completed semantic index.

## Deployment

The repository owns deployment through its Effect CLI:

```sh
bun run cli provision --database-file /protected/railway-export.json --database-host <verified-proxy-host> --database-port <verified-proxy-port>
bun run deploy
bun run cli initialize --url https://openfinacle.plts.in
bunx wrangler d1 migrations apply openfinacle-workflows --remote
bun run cli demo --backfill
```

Provisioning creates the two Fineract databases and stores Cloudflare secrets through stdin. It refuses to replace an existing local secrets file. Initialization checks core health, rotates the original bootstrap credential, configures INR, creates accounting mappings and establishes the savings product. Credentials never belong in Git or command arguments.

`demo` prepares missing scenarios once and refreshes their saved views; repeating it never refunds/recreates existing accounts. `demo --journey new --restart` explicitly prepares a replacement onboarding scenario and retains the former financial records. `--backfill` also saves views for legacy ready workspaces. `DEMO_MODE=true` permits these shared scenarios and demo role switching. Outside demo mode the channel fails closed until production identities are integrated. The read model is derived from Fineract, never an alternative ledger. Balances show their last sync instant; financial mutations and the Refresh control synchronize them with the core.

The first Fineract schema initialization can take considerably longer than a normal cold start because it runs thousands of migrations against the persistent database. Do not interrupt it. `bun run cli database-status` writes a protected report with migration counts and connection metadata. The guarded `release-abandoned-migration` command refuses to run while the core has database connections; its `--empty-baseline` recovery preserves empty migration metadata and refuses databases containing application tables or applied changes. It is for an interrupted, empty first initialization, not a financial-data reset.

For a slow initial schema build, `prepare-migration-runner` configures a private Railway initializer beside PostgreSQL. It uses a separate initialization tenant registry with private database addressing and the same `fineract_default` banking database. The channel engine's registry is unchanged. Stop other core instances before `start-migration-runner`; that command verifies no banking-core database connections remain and uploads only the committed Fineract Dockerfile. Scheduled jobs are disabled, and no public domain is created. Fineract requires internal write mode for migrations. After verified migration completion, `stop-migration-runner` removes its deployment while preserving PostgreSQL. Then initialize the Cloudflare engine normally. A confirmed stopped owner's stale lock can be released with `release-abandoned-migration --confirmed-stopped`; this still refuses active core connections.

Switch an existing initialization run only after the initial-switch schema and seed changesets have completed. Applied later migration history is preserved when the remaining work moves to the private runner.

For local UI development: `bun run dev` (port 3048). Financial integration is verified on the deployed sandbox; the local Next.js development server alone does not provide the banking API.

Rollback: use Cloudflare's previous Worker deployment/version. Container changes need the corresponding previous image digest; database and workflow migrations must remain backward-compatible. Do not delete or reset financial state as an application rollback.

For releases against the existing workflow database, use the [protected backup and migration commands](docs/workflow-release.md) before deploying schema-dependent code. These verify the existing account/resource, a recent exact-revision backup, restore integrity and private artifact permissions.

Specifications: [everyday banking](specs/001-everyday-banking/spec.md). Execution: Beads issue `of-mtw` (local coordination). Quality gates: strict TypeScript, Biome, Oxlint, Knip, dependency-cruiser, type-coverage, Bun behavioral tests, production build, Wrangler dry-run and live Playwright verification.

Capability interpretation and extension boundaries: [Finacle capability map](docs/capabilities.md).

Verified workflows, runtime evidence and screenshots: [live verification](docs/verification.md).
