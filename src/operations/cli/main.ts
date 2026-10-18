import { Command, Options } from "@effect/cli";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Console, Effect } from "effect";
import postgres from "postgres";
import { coreEnvironment } from "../../platform/core-banking/infrastructure/core-environment";
import { customers } from "./commands/customers";
import { demo } from "./commands/demo";
import { loanPilot } from "./commands/loan-pilot";
import { loanRepayment } from "./commands/loan-repayment";
import { loanSetup } from "./commands/loan-setup";
import { observability } from "./commands/observability";
import { payees } from "./commands/payees";
import { workflows } from "./commands/workflows";
import {
  deploy,
  diagnosticEnvironment,
  execute,
  initialize,
  provision,
} from "./runtime-setup";

const cli = Command.make("openfinacle").pipe(
  Command.withSubcommands([
    customers,
    payees,
    loanPilot,
    loanRepayment,
    loanSetup,
    workflows,
    observability,
    demo,
    provision,
    deploy,
    initialize,
    diagnosticEnvironment,
    Command.make("stop-migration-runner", {}, () =>
      execute([
        "railway",
        "down",
        "--service",
        "c613f963-b2dc-4a57-9dde-b4cb96bec023",
        "--project",
        "c959c9f7-9474-4b95-9f5f-deb2d4a325a5",
        "--environment",
        "production",
        "--yes",
      ]).pipe(
        Effect.flatMap(() =>
          Console.log(
            "Migration runner stopped; PostgreSQL and the banking databases are preserved.",
          ),
        ),
      ),
    ),
    Command.make("start-migration-runner", {}, () =>
      Effect.gen(function* () {
        const raw = yield* Effect.tryPromise(() =>
          Bun.file(".dev.vars").text(),
        );
        const line = raw
          .split("\n")
          .find((l) => l.startsWith("CORE_DATABASE="));
        if (!line)
          return yield* Effect.fail(new Error("Database not configured"));
        const sql = postgres(
          JSON.parse(line.slice("CORE_DATABASE=".length)) as string,
          { ssl: "require", max: 1 },
        );
        yield* Effect.acquireUseRelease(
          Effect.succeed(sql),
          (db) =>
            Effect.tryPromise(async () => {
              const active =
                await db`SELECT pid FROM pg_stat_activity WHERE datname IN ('fineract_default','fineract_tenants','fineract_initialization_tenants') AND pid<>pg_backend_pid()`;
              if (active.length)
                throw new Error(
                  "Stop the other core before starting the migration runner",
                );
            }),
          (db) => Effect.promise(() => db.end()),
        );
        yield* execute([
          "git",
          "diff",
          "--exit-code",
          "HEAD",
          "--",
          "infrastructure/fineract/Dockerfile",
        ]);
        const sha = (yield* execute(["git", "rev-parse", "HEAD"])).trim();
        yield* Console.log(
          yield* execute([
            "railway",
            "up",
            "infrastructure/fineract",
            "--path-as-root",
            "--service",
            "schema-initializer",
            "--project",
            "c959c9f7-9474-4b95-9f5f-deb2d4a325a5",
            "--environment",
            "production",
            "--detach",
            "--message",
            `Fineract schema initialization from ${sha}`,
          ]),
        );
      }),
    ),
    Command.make("prepare-migration-runner", {}, () =>
      Effect.gen(function* () {
        const project = "c959c9f7-9474-4b95-9f5f-deb2d4a325a5";
        const status = JSON.parse(
          yield* execute(["railway", "status", "--json"]),
        ) as {
          id: string;
          services: { edges: { node: { id: string; name: string } }[] };
        };
        if (status.id !== project)
          return yield* Effect.fail(
            new Error("Refusing to configure an unexpected Railway project"),
          );
        if (
          !status.services.edges.some(
            ({ node }) => node.name === "schema-initializer",
          )
        )
          yield* execute([
            "railway",
            "add",
            "--service",
            "schema-initializer",
            "--json",
          ]);
        const raw = yield* Effect.tryPromise(() =>
          Bun.file(".dev.vars").text(),
        );
        const line = raw
          .split("\n")
          .find((l) => l.startsWith("CORE_DATABASE="));
        if (!line)
          return yield* Effect.fail(new Error("Database not configured"));
        const database = JSON.parse(
          line.slice("CORE_DATABASE=".length),
        ) as string;
        const sql = postgres(database, { ssl: "require", max: 1 });
        yield* Effect.acquireUseRelease(
          Effect.succeed(sql),
          (db) =>
            Effect.tryPromise(async () => {
              const found =
                await db`SELECT datname FROM pg_database WHERE datname='fineract_initialization_tenants'`;
              if (!found.length)
                await db.unsafe(
                  "CREATE DATABASE fineract_initialization_tenants",
                );
            }),
          (db) => Effect.promise(() => db.end()),
        );
        const vars = {
          ...coreEnvironment(database),
          FINERACT_HIKARI_JDBC_URL:
            "jdbc:postgresql://postgres.railway.internal:5432/fineract_initialization_tenants?sslmode=require",
          FINERACT_DEFAULT_TENANTDB_HOSTNAME: "postgres.railway.internal",
          FINERACT_DEFAULT_TENANTDB_PORT: "5432",
          FINERACT_MODE_WRITE_ENABLED: "true",
          FINERACT_MODE_BATCH_WORKER_ENABLED: "false",
          FINERACT_MODE_BATCH_MANAGER_ENABLED: "false",
          FINERACT_NODE_ID: "2",
        };
        const current = JSON.parse(
          yield* execute([
            "railway",
            "variable",
            "list",
            "--service",
            "schema-initializer",
            "--json",
          ]),
        ) as Record<string, string>;
        for (const [key, value] of Object.entries(vars)) {
          if (current[key] === value) continue;
          yield* execute(
            [
              "railway",
              "variable",
              "set",
              key,
              "--stdin",
              "--skip-deploys",
              "--service",
              "schema-initializer",
              "--project",
              project,
              "--environment",
              "production",
            ],
            value,
          );
        }
        yield* execute([
          "railway",
          "service",
          "scale",
          "southeast-asia=1",
          "--service",
          "schema-initializer",
          "--json",
        ]);
        yield* Console.log(
          "Private migration runner prepared beside PostgreSQL; no deployment started or public domain created.",
        );
      }),
    ),
    Command.make("diagnostic-core", {}, () =>
      Effect.gen(function* () {
        const raw = yield* Effect.tryPromise(() =>
          Bun.file(".dev.vars").text(),
        );
        const line = raw
          .split("\n")
          .find((l) => l.startsWith("CORE_DATABASE="));
        if (!line)
          return yield* Effect.fail(new Error("Database not configured"));
        const vars = coreEnvironment(
          JSON.parse(line.slice("CORE_DATABASE=".length)) as string,
        );
        const log = "/tmp/openfinacle-native-core.log";
        yield* Effect.tryPromise(() => Bun.write(log, ""));
        yield* execute(["chmod", "600", log]);
        const child = Bun.spawn(
          ["java", "-jar", "/tmp/openfinacle-fineract.jar"],
          {
            env: {
              ...process.env,
              ...vars,
              JAVA_TOOL_OPTIONS: "-Xmx1500m",
              FINERACT_SERVER_PORT: "8087",
              SERVER_ADDRESS: "127.0.0.1",
            },
            stdout: Bun.file(log),
            stderr: Bun.file(log),
          },
        );
        yield* Console.log(
          "Native diagnostic core started; output is in the protected diagnostic log.",
        );
        const code = yield* Effect.promise(() => child.exited);
        if (code !== 0)
          return yield* Effect.fail(
            new Error(`Diagnostic core exited ${code}`),
          );
      }),
    ),
    Command.make(
      "release-abandoned-migration",
      {
        emptyBaseline: Options.boolean("empty-baseline").pipe(
          Options.withDefault(false),
        ),
        confirmedStopped: Options.boolean("confirmed-stopped").pipe(
          Options.withDefault(false),
        ),
      },
      ({ emptyBaseline, confirmedStopped }) =>
        Effect.gen(function* () {
          const raw = yield* Effect.tryPromise(() =>
            Bun.file(".dev.vars").text(),
          );
          const line = raw
            .split("\n")
            .find((l) => l.startsWith("CORE_DATABASE="));
          if (!line)
            return yield* Effect.fail(new Error("Database is not configured"));
          const url = new URL(
            JSON.parse(line.slice("CORE_DATABASE=".length)) as string,
          );
          url.pathname = "/fineract_default";
          const sql = postgres(url.toString(), { ssl: "require", max: 1 });
          yield* Effect.acquireUseRelease(
            Effect.succeed(sql),
            (db) =>
              Effect.tryPromise(() =>
                db.begin(async (tx) => {
                  const active =
                    await tx`SELECT pid FROM pg_stat_activity WHERE datname IN ('fineract_default','fineract_tenants') AND pid <> pg_backend_pid()`;
                  if (active.length)
                    throw new Error(
                      "Refusing lock recovery while core database connections exist",
                    );
                  const tables =
                    await tx`SELECT tablename FROM pg_tables WHERE schemaname='public'`;
                  const names = tables.map((row) => row.tablename as string);
                  const before = names.includes("databasechangeloglock")
                    ? await tx`SELECT * FROM databasechangeloglock`
                    : [];
                  await Bun.write(
                    "/tmp/openfinacle-migration-lock-before.json",
                    JSON.stringify(before),
                  );
                  if (emptyBaseline) {
                    const count =
                      await tx`SELECT COUNT(*)::int AS count FROM databasechangelog`;
                    if (
                      count[0]?.count !== 0 ||
                      !names.every(
                        (name) =>
                          [
                            "databasechangelog",
                            "databasechangeloglock",
                          ].includes(name) ||
                          name.startsWith("openfinacle_abandoned_"),
                      )
                    )
                      throw new Error(
                        "Refusing initial-baseline recovery: database contains application state",
                      );
                    const suffix = Date.now();
                    const constraints =
                      await tx`SELECT t.relname AS table_name,c.conname FROM pg_constraint c JOIN pg_class t ON c.conrelid=t.oid WHERE c.conname='databasechangeloglock_pkey' AND t.relname LIKE 'openfinacle_abandoned_%'`;
                    for (const row of constraints) {
                      const name = row.table_name as string;
                      if (!/^openfinacle_abandoned_[a-z0-9_]+$/.test(name))
                        throw new Error("Unexpected backup table identifier");
                      await tx.unsafe(
                        `ALTER TABLE "${name}" RENAME CONSTRAINT databasechangeloglock_pkey TO abandoned_lock_pkey_${suffix}`,
                      );
                    }
                    await tx.unsafe(
                      `ALTER TABLE databasechangelog RENAME TO openfinacle_abandoned_changelog_${suffix}`,
                    );
                    if (names.includes("databasechangeloglock"))
                      await tx.unsafe(
                        `ALTER TABLE databasechangeloglock RENAME TO openfinacle_abandoned_lock_${suffix}`,
                      );
                    return;
                  }
                  if (confirmedStopped)
                    await tx`UPDATE databasechangeloglock SET locked=false,lockgranted=NULL,lockedby=NULL WHERE locked=true`;
                  else {
                    const changed =
                      await tx`UPDATE databasechangeloglock SET locked=false,lockgranted=NULL,lockedby=NULL WHERE locked=true AND lockgranted < now() - interval '10 minutes' RETURNING id`;
                    if (
                      before.some((row) => row.locked === true) &&
                      !changed.length
                    )
                      throw new Error(
                        "Lock is too recent; verify the owner stopped before using --confirmed-stopped",
                      );
                  }
                }),
              ),
            (db) => Effect.promise(() => db.end()),
          );
          yield* execute([
            "chmod",
            "600",
            "/tmp/openfinacle-migration-lock-before.json",
          ]);
          yield* Console.log(
            "Abandoned migration lock released after verifying no core database connections.",
          );
        }),
    ),
    Command.make("database-status", {}, () =>
      Effect.gen(function* () {
        const raw = yield* Effect.tryPromise(() =>
          Bun.file(".dev.vars").text(),
        );
        const line = raw
          .split("\n")
          .find((l) => l.startsWith("CORE_DATABASE="));
        if (!line)
          return yield* Effect.fail(
            new Error("Core database secret not configured."),
          );
        const dbUrl = new URL(
          JSON.parse(line.slice("CORE_DATABASE=".length)) as string,
        );
        dbUrl.pathname = "/fineract_default";
        const sql = postgres(dbUrl.toString(), { ssl: "require", max: 1 });
        yield* Effect.acquireUseRelease(
          Effect.succeed(sql),
          (db) =>
            Effect.gen(function* () {
              const activity = yield* Effect.tryPromise(
                () =>
                  db`SELECT pid,datname,state,wait_event_type,wait_event,query_start,xact_start,split_part(query,' ',1) AS operation FROM pg_stat_activity WHERE datname IN ('fineract_default','fineract_tenants') AND pid <> pg_backend_pid()`,
              );
              const tables = yield* Effect.tryPromise(
                () =>
                  db`SELECT tablename FROM pg_tables WHERE schemaname='public'`,
              );
              const names = tables.map((row) => row.tablename as string);
              const commandLimits = yield* Effect.tryPromise(
                () =>
                  db`SELECT column_name,character_maximum_length FROM information_schema.columns WHERE table_name='m_portfolio_command_source' AND character_maximum_length IS NOT NULL`,
              );
              const lock = names.includes("databasechangeloglock")
                ? yield* Effect.tryPromise(
                    () =>
                      db`SELECT locked,lockgranted,lockedby FROM databasechangeloglock`,
                  )
                : [];
              const migrated = names.includes("databasechangelog")
                ? yield* Effect.tryPromise(
                    () => db`SELECT COUNT(*) AS changes FROM databasechangelog`,
                  )
                : [];
              const latest = names.includes("databasechangelog")
                ? yield* Effect.tryPromise(
                    () =>
                      db`SELECT id,filename FROM databasechangelog ORDER BY orderexecuted DESC LIMIT 1`,
                  )
                : [];
              yield* Effect.tryPromise(() =>
                Bun.write(
                  "/tmp/openfinacle-database-status.json",
                  JSON.stringify(
                    {
                      activity,
                      lock,
                      migrated,
                      latest,
                      commandLimits,
                      tables: names.length,
                    },
                    null,
                    2,
                  ),
                ),
              );
              yield* execute([
                "chmod",
                "600",
                "/tmp/openfinacle-database-status.json",
              ]);
              yield* Console.log(
                "Database metadata saved to protected diagnostic report.",
              );
            }),
          (db) => Effect.promise(() => db.end()),
        );
      }),
    ),
  ]),
);

Command.run(cli, { name: "OpenFinacle", version: "0.1.0" })(process.argv).pipe(
  Effect.provide(NodeContext.layer),
  NodeRuntime.runMain,
);
