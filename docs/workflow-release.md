# Existing workflow database releases

The repository owns production workflow backups and migrations through its Effect CLI:

```sh
bun run cli workflows backup
bun run cli workflows migrate --backup-directory /absolute/path/printed/by/backup
bun run deploy
```

Run from the clean, verified release checkout. Both commands match the configured OpenFinacle Worker and D1 binding against the authenticated PearlThoughts account and live database identity. They target only the existing workflow database; they do not provision resources, reset demo scenarios or touch Fineract/PostgreSQL.

Backup creates a new private directory under `~/Backups/OpenFinacle/`, writes the full D1 export with private permissions, restores it into a disposable in-memory SQLite database, and checks integrity, foreign keys and the existing workflow schema. The private manifest records the source revision, timestamp, byte count and SHA-256. Export contents and provider output are suppressed. A failed export or restore leaves its private directory for inspection and never authorizes a migration.

Migration requires that original directory, private regular files, an intact checksum, the exact current source revision, and an age of at most 30 minutes. It rechecks the target and backup before running the repository-pinned Wrangler migration command. An invalid, stale, changed, incomplete or copied/symlinked artifact fails closed.

This backup covers D1 workflow state only. It is not a backup of Fineract PostgreSQL or R2 documents. Cloudflare also captures migration backups and rolls back an individual failed migration; previously successful migrations remain applied. See [D1 migration commands](https://developers.cloudflare.com/d1/wrangler-commands/#d1-migrations-apply).

For service cases migration 0005, preserve the additive schema during an application rollback. Use the verified prior Worker version for application rollback; do not delete history or reset shared data. Restoring production data is a separate recovery operation and is intentionally not an automatic CLI action.

After migration and deployment, verify the deployed source revision, readiness, persistent entry and synthetic customer/staff case progression. Record the provider deployment/version and backup directory in the private execution ledger; never commit an export, session data or an operational backup manifest.
