# Implementation plan

## Decisions

- Next.js static application with distinct customer/staff workspaces; Cloudflare serves its assets.
- Effect-TS application API on Workers. NestJS is unnecessary for this runtime; typed services and ports keep the design portable.
- Apache Fineract 1.15.0 (d5636847ac556c30b437254c353f05526d172b97) runs unchanged in a Java container. Its API and financial domain are in one server; Mifos UI and self-service plugin are separate repositories, per upstream SECURITY.md.
- Cloudflare Containers supports Java. PostgreSQL needs durable server storage and a PostgreSQL wire endpoint; D1 is SQLite and cannot host Fineract databases. Use Railway PostgreSQL for this concrete persistence requirement. Keep customer channels on Cloudflare.
- Application workflow/session metadata lives in D1; synthetic document objects in R2. Financial balances remain in Fineract. An integration adapter maps the two identities.
- One authoritative command record controls approval, execution and reconciliation. No distributed transaction is claimed across D1/Fineract. Unknown outcomes stay uncertain until reconciled.

## Delivery sequence

1. Bootstrap source, specification and isolated development worktree.
2. Deploy and verify PostgreSQL and Fineract; configure accounting and savings products.
3. Implement Effect domain/ports, authenticated demo-workspace sessions and banking API.
4. Implement customer and staff experiences; test actual workflows and failure paths.
5. Self-review, run full local CI, merge private PR, publish exact merged revision and verify custom domain.

## Tests and architecture

Domain code does not import Cloudflare or frontend. Adapters implement core/storage interfaces. Server decides ownership and role permissions. A posted command references its core transaction ID. Error responses expose safe actionable messages. CI executes strict TypeScript checks, lint, dependency analysis, tests and production UI/worker builds.

## Research limits

CodeCompass indexing was attempted with the full Java/documentation corpus. Quality must be established with path-grounded searches; unsupported extensions or incomplete indexing are reported. User explicitly authorized rg/grep when CodeCompass cannot provide useful retrieval. No claim that menu lists specify proprietary Finacle rules.
