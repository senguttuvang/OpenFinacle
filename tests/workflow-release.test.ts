import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import {
  verifyPrivateWorkflowBackup,
  verifyWorkflowDump,
  verifyWorkflowManifest,
  verifyWorkflowTarget,
} from "../src/cli/workflow-release";

const account = "f7861b73f1ebb5f7d13f3329200fc639";
const database = "37fe4ba4-a2c3-48e3-9819-dd7620305bb4";
const revision = "1".repeat(40);
const now = Date.parse("2026-10-17T09:00:00Z");
const sql =
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
  ]
    .map((table) => `CREATE TABLE ${table}(id TEXT PRIMARY KEY);`)
    .join("\n") + "\nINSERT INTO banks VALUES('synthetic-only');";
const manifest = () => ({
  format: 1,
  account,
  database,
  revision,
  createdAt: new Date(now).toISOString(),
  bytes: new TextEncoder().encode(sql).length,
  sha256: new Bun.CryptoHasher("sha256").update(sql).digest("hex"),
  file: "workflows.sql",
  restored: true,
});
test("customer backup schema requires all six tables and every original ownership/recovery trigger", async () => {
  const paths: string[] = [];
  for await (const path of new Bun.Glob("migrations/*.sql").scan("."))
    paths.push(path);
  const complete = (
    await Promise.all(paths.sort().map((path) => Bun.file(path).text()))
  ).join("\n");
  await Effect.runPromise(verifyWorkflowDump(complete));
  for (const table of [
    "customers",
    "customer_transfer_offers",
    "customer_transfers",
    "customer_seed_manifest",
    "customer_seed_operations",
    "customer_applicant_scopes",
  ])
    expect(
      (
        await Effect.runPromise(
          verifyWorkflowDump(`${complete}\nDROP TABLE ${table};`).pipe(
            Effect.flip,
          ),
        )
      ).message,
    ).toContain("did not restore");
  const migration = await Bun.file(
    "migrations/0016_customer_common_banking.sql",
  ).text();
  const triggers = [
    ...migration.matchAll(/CREATE TRIGGER (customer_[a-z_]+)/g),
  ].map((match) => match[1]);
  expect(triggers).toHaveLength(14);
  for (const trigger of triggers)
    expect(
      (
        await Effect.runPromise(
          verifyWorkflowDump(`${complete}\nDROP TRIGGER ${trigger};`).pipe(
            Effect.flip,
          ),
        )
      ).message,
    ).toContain("did not restore");
});
const denied = <A, E>(effect: Effect.Effect<A, E>) =>
  Effect.runPromise(Effect.flip(effect));

test("backup verification permits absent planning schema or its complete pair and trigger group, rejects every partial group", async () => {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE banks(id TEXT PRIMARY KEY)");
  db.exec(await Bun.file("migrations/0015_planning.sql").text());
  const names = [
    "planning_households",
    "planning_events",
    "planning_apply",
    "planning_immutable_update",
    "planning_immutable_delete",
  ];
  const definitions = names.map(
    (name) =>
      (
        db.query("SELECT sql FROM sqlite_schema WHERE name=?").get(name) as {
          sql: string;
        }
      ).sql,
  );
  await Effect.runPromise(verifyWorkflowDump(sql));
  for (let mask = 1; mask < 32; mask++) {
    const dump =
      sql +
      "\n" +
      definitions
        .filter((_, i) => mask & (1 << i))
        .map((ddl) => `${ddl};`)
        .join("\n");
    if (mask === 31) await Effect.runPromise(verifyWorkflowDump(dump));
    else
      expect((await denied(verifyWorkflowDump(dump))).message).toContain(
        "did not restore",
      );
  }
  db.close();
});

test("backup verification permits a pre-repayment schema and a complete repayment group, but rejects partial repayment exports", async () => {
  const tables = [
    "loan_repayment_offers",
    "loan_repayment_requests",
    "loan_repayment_operations",
    "loan_repayment_events",
  ];
  await Effect.runPromise(verifyWorkflowDump(sql));
  for (let count = 1; count <= tables.length; count++) {
    const dump = `${sql}\n${tables
      .slice(0, count)
      .map((table) => `CREATE TABLE ${table}(id TEXT PRIMARY KEY);`)
      .join("\n")}`;
    if (count === tables.length)
      await Effect.runPromise(verifyWorkflowDump(dump));
    else
      expect((await denied(verifyWorkflowDump(dump))).message).toContain(
        "did not restore",
      );
  }
});

test("workflow release target requires configured binding, authenticated account and live database identity", async () => {
  const config = {
    name: "openfinacle",
    account_id: account,
    d1_databases: [
      {
        binding: "DB",
        database_name: "openfinacle-workflows",
        database_id: database,
      },
    ],
  };
  const identity = { accounts: [{ id: account }] };
  const live = { uuid: database, name: "openfinacle-workflows" };
  await Effect.runPromise(verifyWorkflowTarget(config, identity, live));
  for (const [configured, authenticated, remote] of [
    [{ ...config, account_id: "another-account" }, identity, live],
    [config, { accounts: [] }, live],
    [config, identity, { ...live, uuid: "another-database" }],
    [
      {
        ...config,
        d1_databases: [{ ...config.d1_databases[0], binding: "OTHER" }],
      },
      identity,
      live,
    ],
    [null, identity, live],
  ])
    expect(
      (await denied(verifyWorkflowTarget(configured, authenticated, remote)))
        .message,
    ).toContain("No export or migration");
});

test("backup authorization checks exact source, recent timestamp, complete bytes and checksum before restoring", async () => {
  expect(
    await Effect.runPromise(
      verifyWorkflowManifest(manifest(), sql, revision, now),
    ),
  ).toMatchObject({ revision, restored: true });
  for (const changed of [
    { ...manifest(), account: "other" },
    { ...manifest(), database: "other" },
    { ...manifest(), revision: "2".repeat(40) },
    {
      ...manifest(),
      createdAt: new Date(now - 30 * 60 * 1000 - 1).toISOString(),
    },
    { ...manifest(), createdAt: new Date(now + 6000).toISOString() },
    { ...manifest(), createdAt: "invalid" },
    { ...manifest(), bytes: manifest().bytes + 1 },
    { ...manifest(), sha256: "0".repeat(64) },
    { ...manifest(), file: "../unexpected.sql" },
    { ...manifest(), restored: false },
  ])
    expect(
      await denied(verifyWorkflowManifest(changed, sql, revision, now)),
    ).toBeInstanceOf(Error);
  expect(
    (
      await denied(
        verifyWorkflowManifest(manifest(), sql + "\n", revision, now),
      )
    ).message,
  ).toContain("checksum");
});

test("backup restore verification rejects malformed or incomplete exports without exposing their contents", async () => {
  await Effect.runPromise(verifyWorkflowDump(sql));
  for (const dump of [
    "",
    "CREATE TABLE banks(id TEXT);",
    "synthetic-private-marker invalid SQL",
    sql + "\nINSERT INTO banks VALUES('synthetic-only');",
  ]) {
    const error = await denied(verifyWorkflowDump(dump));
    expect(error.message).toContain("did not restore");
    expect(error.message).not.toContain("synthetic-private-marker");
  }
});

test("migration backup paths reject readable files, symbolic links and directories outside the private root", async () => {
  const sandbox = await realpath(
    await mkdtemp(join(tmpdir(), "openfinacle-release-test-")),
  );
  try {
    const root = join(sandbox, "backups");
    const directory = join(root, "release");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(root, 0o700);
    for (const name of ["workflows.sql", "manifest.json"]) {
      await Bun.write(join(directory, name), "synthetic");
      await chmod(join(directory, name), 0o600);
    }
    expect(
      await Effect.runPromise(verifyPrivateWorkflowBackup(directory, root)),
    ).toBe(directory);
    await chmod(join(directory, "workflows.sql"), 0o644);
    expect(
      (await denied(verifyPrivateWorkflowBackup(directory, root))).message,
    ).toContain("private regular paths");
    await chmod(join(directory, "workflows.sql"), 0o600);
    await chmod(root, 0o755);
    expect(
      (await denied(verifyPrivateWorkflowBackup(directory, root))).message,
    ).toContain("private regular paths");
    await chmod(root, 0o700);
    await symlink(directory, join(root, "alias"));
    expect(
      (await denied(verifyPrivateWorkflowBackup(join(root, "alias"), root)))
        .message,
    ).toContain("original backup directory");
    await rm(join(directory, "workflows.sql"));
    await symlink(
      join(directory, "manifest.json"),
      join(directory, "workflows.sql"),
    );
    expect(
      (await denied(verifyPrivateWorkflowBackup(directory, root))).message,
    ).toContain("private regular paths");
    expect(
      (await denied(verifyPrivateWorkflowBackup(sandbox, root))).message,
    ).toContain("original backup directory");
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("backup verification rejects an interior statement failure even when later SQL succeeds", async () => {
  const dump = `${sql}\nINSERT INTO banks VALUES('synthetic-only');\nSELECT 1;`;
  const error = await denied(verifyWorkflowDump(dump));
  expect(error.message).toContain("did not restore");
  expect(error.message).not.toContain("synthetic-only");
});
