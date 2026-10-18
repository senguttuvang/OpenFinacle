# Development and Operations

This guide preserves the Core architecture, upstream build notes and operator bootstrap/recovery procedures behind OpenFinacle. Start with the [product README](../README.md) for current demo journeys; these commands require the appropriate environment and operator authority.

## Architecture and Ownership


The project owner confirmed Fineract as the core on 2026-10-16. The [accepted decision](../specs/decisions/001-banking-core.md) records custom TypeScript, TigerBeetle and ERP/accounting alternatives, tradeoffs and production-effort assumptions. The [customer experience specification](../specs/002-customer-experience/spec.md) covers both new applicants and existing customers. Public references replaced the unavailable authenticated review at the owner's request.

- **Next.js / React:** customer and staff experiences, built to static assets.
- **Effect-TS on Cloudflare Workers:** session/ownership checks, application workflows, approval rules and integration adapters. No Java rewrite and no CMS dependency.
- **Apache Fineract 1.15.0 on Cloudflare Containers:** customer accounts, savings products, internal transfers, cash transactions and configured cash accounting.
- **Railway PostgreSQL:** Fineract tenant registry and banking database. Cloudflare D1 speaks SQLite rather than PostgreSQL, and container disks are ephemeral; this is the persistence reason for the Railway component.
- **D1:** demo sessions, onboarding, beneficiaries, workflow command records, requests and application audit.
- **Persistent scenarios and customer registry:** the original shared new/existing demonstrations are retained alongside registered customer scopes and independently opened applicants. Saved Fineract observations support enquiry; ending a browser session does not reset accounts or balances.
- **R2:** private synthetic document objects. Downloads require the same demo session.

Financial balances and transactions have one owner: Fineract. Local workflow state refers to core IDs. Approval claims use conditional SQL updates; duplicate command keys are unique per workspace. Ambiguous core responses remain `uncertain`, and executing/uncertain commands are never automatically replayed. These exceptions require inspection and reconciliation; they do not claim an atomic transaction across D1 and Fineract.

The core uses one private technical principal. Application audit records the originating demo role. Maker/checker separation for these composed workflows is enforced in OpenFinacle; it is not represented as separate Fineract principals.

## Upstream and Source Analysis


Source: https://github.com/apache/fineract, release `1.15.0`, commit `d5636847ac556c30b437254c353f05526d172b97`. OpenFinacle is a separate application repository.

Fineract is a Java/Spring server with JAX-RS APIs, command handlers, application services, financial domain models, persistence, scheduled work and accounting. Read APIs use read services; state-changing APIs enter command processing. Its API and banking logic ship together, while the Mifos web application and customer self-service plugin are separate repositories. See upstream `SECURITY.md`, `SavingsAccountsApiResource.java`, `SavingsAccountTransactionsApiResource.java`, `ClientsApiResource.java` and `AccountTransfersApiResource.java`.

Application features are written in TypeScript over the API. Java customization is needed only when changing behavior that must occur within the core's own transaction, such as accounting or calculation rules. Plugin extension points are version-dependent; we do not assume arbitrary core services can be replaced.

The release has no matching `apache/fineract:1.15.0` Docker Hub image tag. The repository builds a Java 21 image from the official binary distribution and verifies its published SHA-512 checksum. Apache license/notice obligations remain applicable. See [the container Dockerfile](../infrastructure/fineract/Dockerfile).

## Deployment and Bootstrap


The repository owns deployment through its Effect CLI. The following are operator bootstrap commands for an intentionally prepared environment, not a quick start against an existing live installation. For an existing workflow database, use the protected backup and migration procedure linked below before deploying schema-dependent code:

```sh
bun run cli provision --database-file /protected/railway-export.json --database-host <verified-proxy-host> --database-port <verified-proxy-port>
bun run deploy
bun run cli initialize --url https://openfinacle.plts.in
bun run cli demo --backfill
```

Provisioning creates the two Fineract databases and stores Cloudflare secrets through stdin. It refuses to replace an existing local secrets file. Initialization checks core health, rotates the original bootstrap credential, configures INR, creates accounting mappings and establishes the savings product. Credentials never belong in Git or command arguments.

The legacy shared-scenario `demo` command prepares missing scenarios once and refreshes their saved views; repeating it never refunds/recreates existing accounts. `demo --journey new --restart` explicitly prepares a replacement onboarding scenario and retains the former financial records. `--backfill` also saves views for legacy ready workspaces. `DEMO_MODE=true` permits these shared scenarios and demo role switching. Outside demo mode the channel fails closed until production identities are integrated. The read model is derived from Fineract, never an alternative ledger. Balances show their last sync instant; financial mutations and the Refresh control synchronize them with the core.

The first Fineract schema initialization can take considerably longer than a normal cold start because it runs thousands of migrations against the persistent database. Do not interrupt it. `bun run cli database-status` writes a protected report with migration counts and connection metadata. The guarded `release-abandoned-migration` command refuses to run while the core has database connections; its `--empty-baseline` recovery preserves empty migration metadata and refuses databases containing application tables or applied changes. It is for an interrupted, empty first initialization, not a financial-data reset.

For a slow initial schema build, `prepare-migration-runner` configures a private Railway initializer beside PostgreSQL. It uses a separate initialization tenant registry with private database addressing and the same `fineract_default` banking database. The channel engine's registry is unchanged. Stop other core instances before `start-migration-runner`; that command verifies no banking-core database connections remain and uploads only the committed Fineract Dockerfile. Scheduled jobs are disabled, and no public domain is created. Fineract requires internal write mode for migrations. After verified migration completion, `stop-migration-runner` removes its deployment while preserving PostgreSQL. Then initialize the Cloudflare engine normally. A confirmed stopped owner's stale lock can be released with `release-abandoned-migration --confirmed-stopped`; this still refuses active core connections.

Switch an existing initialization run only after the initial-switch schema and seed changesets have completed. Applied later migration history is preserved when the remaining work moves to the private runner.

For local UI development: `bun run dev` (port 3048). Financial integration is verified on the deployed sandbox; the local Next.js development server alone does not provide the banking API.

Rollback: use Cloudflare's previous Worker deployment/version. Container changes need the corresponding previous image digest; database and workflow migrations must remain backward-compatible. Do not delete or reset financial state as an application rollback.

For releases against the existing workflow database, use the [protected backup and migration commands](workflow-release.md) before deploying schema-dependent code. These verify the existing account/resource, a recent exact-revision backup, restore integrity and private artifact permissions.

