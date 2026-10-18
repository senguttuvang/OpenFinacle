# Saved payee implementation and verification

The registry remains the account ownership source. Saved payees are a separate
metadata relation owned by its sender. Application services depend on Store;
setup/add/remove do not acquire Core. Transfer services reuse their existing
Core port and original command/claim/proof boundaries. Migration triggers make
identity, archival version, safety ceiling and claim authorization atomic.

The native CLI routes a closed literal payee endpoint through the existing
source/credential client. Coordinator executes `bun run cli payees --action
prepare --branch-id <original-branch> --url <reviewed-origin>`, then bounded
`--action resume --start <ordinal> --limit <1-10>`, and `--action status`.
Use a clean reviewed checkout matching the deployed revision. Never execute
these native commands from a worker's unmerged or dirty checkout. Keep provider
credentials in the protected secrets file. Read status after a lost response;
metadata insertion is idempotent and original tombstones remain authoritative.

Shared leases cover only payee HTTP routes, CLI wiring, migration restore
guard, optional dashboard/view summary, and a closed endpoint client parameter.
Finacle6 owns FormSelect. Finacle8 owns navigation; the coordinator serializes
the page lease for the registered-customer count, metadata refresh callback, and
legacy new-payment visibility integration. Preserve their reviewed source and
merge the latest integrated main before final exact-branch verification.

Run `bun run check`.
Run isolated fixture browser project against port 3100 with
`BASE_URL=http://127.0.0.1:3100 bunx playwright test --project=workspace`.
Directly inspect the final diff, scan with redacted output, verify private repo
and live governance, then commit/push a private PR with source/tree evidence.
Retain the original worker worktree and preview. No remote migration, release,
native setup, canonical edit, merge or production browser action by Finacle7.
