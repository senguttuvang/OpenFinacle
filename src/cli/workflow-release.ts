import { chmod, lstat, mkdir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Clock, Effect, Schema } from "effect";
import { verifySqliteScript } from "./sqlite-script";

const target = {
  account: "f7861b73f1ebb5f7d13f3329200fc639",
  database: "37fe4ba4-a2c3-48e3-9819-dd7620305bb4",
  name: "openfinacle-workflows",
} as const;
const root = join(homedir(), "Backups", "OpenFinacle");
const manifestSchema = Schema.Struct({
  format: Schema.Literal(1),
  account: Schema.Literal(target.account),
  database: Schema.Literal(target.database),
  revision: Schema.String.pipe(Schema.pattern(/^[a-f0-9]{40}$/)),
  createdAt: Schema.String,
  bytes: Schema.Number.pipe(Schema.int(), Schema.positive()),
  sha256: Schema.String.pipe(Schema.pattern(/^[a-f0-9]{64}$/)),
  file: Schema.Literal("workflows.sql"),
  restored: Schema.Literal(true),
});
type Manifest = typeof manifestSchema.Type;
const failure = (message: string) => new Error(message);
const io = <A>(run: () => Promise<A>, message: string) =>
  Effect.tryPromise({ try: run, catch: () => failure(message) });
const json = (value: string) =>
  Schema.decodeUnknown(Schema.parseJson(Schema.Unknown))(value).pipe(
    Effect.mapError(() =>
      failure(
        "Provider metadata was not valid JSON; no migration was attempted.",
      ),
    ),
  );
const processCommand = (args: string[]) =>
  Effect.tryPromise({
    try: async () => {
      const child = Bun.spawn(args, {
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          CI: "true",
          WRANGLER_SEND_METRICS: "false",
          CLOUDFLARE_ACCOUNT_ID: target.account,
        },
      });
      const [code, stdout] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      if (code !== 0) throw failure("Provider command failed");
      return stdout;
    },
    catch: () =>
      failure(
        "Release command failed. Provider output is suppressed because workflow exports can contain protected session data. No automatic retry was attempted.",
      ),
  });
const wrangler = (...args: string[]) =>
  processCommand([
    "bunx",
    "wrangler",
    ...args,
    "--config",
    resolve("wrangler.jsonc"),
  ]);

export const verifyWorkflowTarget = (
  config: unknown,
  identity: unknown,
  database: unknown,
) =>
  Effect.gen(function* () {
    const expectedConfig = Schema.Struct({
      name: Schema.Literal("openfinacle"),
      account_id: Schema.Literal(target.account),
      d1_databases: Schema.Array(
        Schema.Struct({
          binding: Schema.String,
          database_name: Schema.String,
          database_id: Schema.String,
        }),
      ),
    });
    const expectedIdentity = Schema.Struct({
      accounts: Schema.Array(Schema.Struct({ id: Schema.String })),
    });
    const expectedDatabase = Schema.Struct({
      uuid: Schema.Literal(target.database),
      name: Schema.Literal(target.name),
    });
    const configured = yield* Schema.decodeUnknown(expectedConfig)(config);
    const authenticated =
      yield* Schema.decodeUnknown(expectedIdentity)(identity);
    yield* Schema.decodeUnknown(expectedDatabase)(database);
    if (
      !authenticated.accounts.some(
        (account) => account.id === target.account,
      ) ||
      !configured.d1_databases.some(
        (db) =>
          db.binding === "DB" &&
          db.database_name === target.name &&
          db.database_id === target.database,
      )
    )
      return yield* Effect.fail(
        failure(
          "The authenticated account or workflow binding does not match the approved release target.",
        ),
      );
  }).pipe(
    Effect.mapError(() =>
      failure(
        "The configured, authenticated and live workflow target could not be matched. No export or migration was attempted.",
      ),
    ),
  );

const preflight = Effect.gen(function* () {
  // Verify strict local restore capability before any provider/export operation.
  yield* verifySqliteScript("");
  const config = yield* io(
    () => Bun.file("wrangler.jsonc").text(),
    "The release configuration could not be read.",
  ).pipe(Effect.flatMap(json));
  const identity = yield* wrangler("whoami", "--json").pipe(
    Effect.flatMap(json),
  );
  const database = yield* wrangler("d1", "info", target.name, "--json").pipe(
    Effect.flatMap(json),
  );
  yield* verifyWorkflowTarget(config, identity, database);
  const dirty = yield* processCommand(["git", "status", "--porcelain"]);
  if (dirty.trim())
    return yield* Effect.fail(
      failure(
        "Release requires a clean tracked worktree. Preserve and resolve local changes first.",
      ),
    );
  const revision = (yield* processCommand(["git", "rev-parse", "HEAD"])).trim();
  return revision;
});

// Restore only a protected export into a disposable in-memory database. This never opens project storage.
export const verifyWorkflowDump = (sql: string) =>
  verifySqliteScript(
    `${sql}\n;
PRAGMA ignore_check_constraints=OFF;
CREATE TEMP TABLE workflow_repayment_schema_guard (complete INTEGER NOT NULL CHECK(complete=1));
INSERT INTO workflow_repayment_schema_guard SELECT count(*) IN (0,4) FROM sqlite_schema
  WHERE type='table' AND name IN ('loan_repayment_offers','loan_repayment_requests','loan_repayment_operations','loan_repayment_events');
DROP TABLE workflow_repayment_schema_guard;
CREATE TEMP TABLE workflow_planning_schema_guard (complete INTEGER NOT NULL CHECK(complete=1));
INSERT INTO workflow_planning_schema_guard
SELECT (tables=0 AND triggers=0) OR (tables=2 AND triggers=3)
FROM (
  SELECT
    (SELECT count(*) FROM sqlite_schema WHERE type='table' AND name IN ('planning_households','planning_events')) AS tables,
    (SELECT count(*) FROM sqlite_schema WHERE type='trigger' AND tbl_name='planning_events' AND name IN ('planning_apply','planning_immutable_update','planning_immutable_delete')) AS triggers
);
DROP TABLE workflow_planning_schema_guard;
CREATE TEMP TABLE workflow_customer_schema_guard (complete INTEGER NOT NULL CHECK(complete=1));
INSERT INTO workflow_customer_schema_guard
SELECT (tables=0 AND triggers=0) OR (tables=6 AND triggers=14 AND EXISTS(SELECT 1 FROM sqlite_schema WHERE type='trigger' AND name='profile_for_relationship'))
FROM (
 SELECT
 (SELECT count(*) FROM sqlite_schema WHERE type='table' AND name IN ('customers','customer_transfer_offers','customer_transfers','customer_seed_manifest','customer_seed_operations','customer_applicant_scopes')) AS tables,
 (SELECT count(*) FROM sqlite_schema WHERE type='trigger' AND name IN ('customer_owned_scope_insert','customer_identity_immutable','customer_no_delete','customer_bank_ownership_guard','customer_transfer_binding','customer_transfer_immutable','customer_transfer_command_binding','customer_seed_manifest_identity','customer_seed_operation_guard','customer_seed_operation_no_delete','customer_seed_manifest_no_delete','customer_offer_no_update','customer_offer_no_delete','customer_transfer_command_execution')) AS triggers
);
DROP TABLE workflow_customer_schema_guard;
CREATE TEMP TABLE workflow_onboarding_schema_guard (complete INTEGER NOT NULL CHECK(complete=1));
INSERT INTO workflow_onboarding_schema_guard
SELECT (tables=0 AND triggers=0) OR (tables=1 AND triggers=2)
FROM (
 SELECT
 (SELECT count(*) FROM sqlite_schema WHERE type='table' AND name='onboarding_drafts') AS tables,
 (SELECT count(*) FROM sqlite_schema WHERE type='trigger' AND tbl_name='onboarding_drafts' AND name IN ('onboarding_original_identity','onboarding_no_reset')) AS triggers
);
DROP TABLE workflow_onboarding_schema_guard;
CREATE TEMP TABLE workflow_payee_schema_guard (complete INTEGER NOT NULL CHECK(complete=1));
INSERT INTO workflow_payee_schema_guard
SELECT (tables=0 AND triggers=0 AND columns=0) OR (tables=4 AND triggers=12 AND columns=2)
FROM (SELECT
 (SELECT count(*) FROM sqlite_schema WHERE type='table' AND name IN ('customer_payees','customer_payee_reviews','customer_payee_seed_rosters','customer_payee_seed_owners')) AS tables,
 (SELECT count(*) FROM sqlite_schema WHERE type='trigger' AND name IN ('customer_payee_insert','customer_payee_update','customer_payee_no_delete','customer_payee_review_update','customer_payee_review_confirm','customer_payee_review_no_delete','customer_offer_payee','customer_transfer_payee_execution','customer_payee_roster_no_update','customer_payee_roster_no_delete','customer_payee_seed_guard','customer_payee_seed_no_delete')) AS triggers,
 (SELECT count(*) FROM pragma_table_info('customer_transfer_offers') WHERE name IN ('payee_id','payee_version')) AS columns
);
DROP TABLE workflow_payee_schema_guard;`,
    [
      "settings",
      "banks",
      "sessions",
      "applications",
      "beneficiaries",
      "commands",
      "audit",
      "documents",
      "service_requests",
      "usage_limits",
      "financial_snapshots",
      "demo_seed_lease",
    ],
  ).pipe(
    Effect.mapError(() =>
      failure(
        "The workflow export did not restore with the required schema and a clean integrity check. Require sqlite3 3.38+ and inspect the protected export. It cannot authorize a migration; SQL details are suppressed.",
      ),
    ),
  );

export const verifyWorkflowManifest = (
  value: unknown,
  sql: string,
  revision: string,
  now: number,
) =>
  Effect.gen(function* () {
    const manifest = yield* Schema.decodeUnknown(manifestSchema)(value).pipe(
      Effect.mapError(() =>
        failure(
          "The backup manifest does not match the approved target or format.",
        ),
      ),
    );
    const createdAt = Date.parse(manifest.createdAt);
    if (
      !Number.isFinite(createdAt) ||
      createdAt > now + 5000 ||
      now - createdAt > 30 * 60 * 1000 ||
      manifest.revision !== revision
    )
      return yield* Effect.fail(
        failure(
          "A verified backup of this exact revision from the last 30 minutes is required.",
        ),
      );
    if (
      new TextEncoder().encode(sql).length !== manifest.bytes ||
      new Bun.CryptoHasher("sha256").update(sql).digest("hex") !==
        manifest.sha256
    )
      return yield* Effect.fail(
        failure(
          "The protected workflow export no longer matches its backup checksum.",
        ),
      );
    yield* verifyWorkflowDump(sql);
    return manifest;
  });

export const backupWorkflows = Effect.gen(function* () {
  const revision = yield* preflight;
  yield* io(
    () => mkdir(root, { recursive: true, mode: 0o700 }),
    "The central backup root could not be prepared.",
  );
  const rootInfo = yield* io(
    () => lstat(root),
    "The central backup root could not be inspected.",
  );
  if (
    !rootInfo.isDirectory() ||
    rootInfo.isSymbolicLink() ||
    (rootInfo.mode & 0o077) !== 0
  )
    return yield* Effect.fail(
      failure(
        "The central backup root must be a private directory with mode 0700.",
      ),
    );
  const instant = yield* Clock.currentTimeMillis;
  const directory = join(
    root,
    `${new Date(instant).toISOString().replaceAll(":", "-")}-workflows-${crypto.randomUUID().slice(0, 8)}`,
  );
  yield* io(
    () => mkdir(directory, { mode: 0o700 }),
    "The private backup directory could not be created.",
  );
  const file = join(directory, "workflows.sql");
  yield* io(async () => {
    await Bun.write(file, "", { createPath: false });
    await chmod(file, 0o600);
  }, "The private export file could not be prepared.");
  yield* wrangler(
    "d1",
    "export",
    target.name,
    "--remote",
    "--skip-confirmation",
    "--output",
    file,
  );
  yield* io(
    () => chmod(file, 0o600),
    "The export permissions could not be verified.",
  );
  const sql = yield* io(
    () => Bun.file(file).text(),
    "The workflow export could not be read for verification.",
  );
  yield* verifyWorkflowDump(sql);
  const manifest: Manifest = {
    format: 1,
    ...target,
    revision,
    createdAt: new Date(instant).toISOString(),
    bytes: new TextEncoder().encode(sql).length,
    sha256: new Bun.CryptoHasher("sha256").update(sql).digest("hex"),
    file: "workflows.sql",
    restored: true,
  };
  yield* io(async () => {
    const path = join(directory, "manifest.json");
    await Bun.write(path, JSON.stringify(manifest, null, 2), {
      createPath: false,
    });
    await chmod(path, 0o600);
  }, "The verified backup manifest could not be saved.");
  return directory;
});

export const verifyPrivateWorkflowBackup = (
  directory: string,
  backupRoot = root,
) =>
  Effect.gen(function* () {
    const canonical = yield* io(
      () => realpath(directory),
      "The backup directory could not be resolved.",
    );
    const canonicalRoot = yield* io(
      () => realpath(backupRoot),
      "The central backup root could not be resolved.",
    );
    if (
      dirname(canonical) !== canonicalRoot ||
      canonical !== resolve(directory)
    )
      return yield* Effect.fail(
        failure(
          "Use an original backup directory directly under the protected central backup root.",
        ),
      );
    for (const path of [
      backupRoot,
      canonical,
      join(canonical, "manifest.json"),
      join(canonical, "workflows.sql"),
    ]) {
      const metadata = yield* io(
        () => lstat(path),
        "Backup permissions could not be inspected.",
      );
      if (
        metadata.isSymbolicLink() ||
        (metadata.mode & 0o077) !== 0 ||
        (path === canonical || path === backupRoot
          ? !metadata.isDirectory()
          : !metadata.isFile())
      )
        return yield* Effect.fail(
          failure(
            "Backup files and directory must be private regular paths; no migration was attempted.",
          ),
        );
    }
    return canonical;
  });

export const migrateWorkflows = (directory: string) =>
  Effect.gen(function* () {
    const revision = yield* preflight;
    const canonical = yield* verifyPrivateWorkflowBackup(directory);
    const manifest = yield* io(
      () => Bun.file(join(canonical, "manifest.json")).text(),
      "The backup manifest could not be read.",
    ).pipe(Effect.flatMap(json));
    const sql = yield* io(
      () => Bun.file(join(canonical, "workflows.sql")).text(),
      "The protected export could not be read.",
    );
    yield* verifyWorkflowManifest(
      manifest,
      sql,
      revision,
      yield* Clock.currentTimeMillis,
    );
    yield* wrangler("d1", "migrations", "apply", target.name, "--remote");
  });
