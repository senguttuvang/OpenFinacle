# Architecture and delivery

Fineract remains the financial authority. Add an application read model storing three account responses and their sync instant in D1. Dashboard composition continues to read current workflow records and applies role filtering; initial reads use saved account data. Explicit refresh and successful bank mutations refresh account data through the core adapter. Never fall back from a failed write to simulated success.

A protected, operator-invoked seeder registers permanent new/existing scenario bank IDs in settings, guarded against concurrent seeding by a lease. Refreshing a seed is idempotent; only explicit scenario restart creates a replacement bank, preserving old records. No scheduled tasks or workspace pool. Existing sessions continue to point at their bank; operator backfill prepares their read models.

DEMO_MODE gates synthetic scenario allocation and role switching. Production identities are not yet integrated, so non-demo channel requests fail closed. Financial domain services remain framework/auth/seeding independent. Shared demo workspaces are labelled honestly. Sessions persist across releases; journey selection changes active scenario without reseeding or changing balances.

Deliver backend/read model and operator seeding first, then fast UI entry and measurable acceptance tests. Full exact-worktree checks, direct review, GitHub CI/PR merge, additive migration, explicit seed preparation, release and live browser verification gate completion. Roll back code without dropping the additive tables. No production readiness claim follows solely from using Fineract.
