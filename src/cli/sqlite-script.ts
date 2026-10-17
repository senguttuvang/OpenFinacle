import { Effect, Schema } from "effect";

const failure = () =>
  new Error(
    "SQL script verification failed. Require sqlite3 3.38+ with safe mode and JSON support, then inspect the protected script for statement, schema or integrity errors. SQL and process output are suppressed.",
  );

// This boundary can only open a disposable in-memory database, never project storage.
export const verifySqliteScript = (
  sql: string,
  requiredTables: readonly string[] = [],
) =>
  Effect.gen(function* () {
    if (
      new Set(requiredTables).size !== requiredTables.length ||
      requiredTables.some((name) => !/^[a-z][a-z0-9_]*$/.test(name))
    )
      return yield* Effect.fail(failure());
    const nonce = crypto.randomUUID();
    const tableFilter = requiredTables.length
      ? `name IN (${requiredTables.map((name) => `'${name}'`).join(",")})`
      : "0";
    const proof = `PRAGMA ignore_check_constraints=OFF;
SELECT json_object('nonce','${nonce}','integrity',(SELECT group_concat(integrity_check,char(10)) FROM pragma_integrity_check),'foreign_keys',(SELECT count(*) FROM pragma_foreign_key_check),'tables',(SELECT count(*) FROM sqlite_schema WHERE type='table' AND ${tableFilter}));`;
    const output = yield* Effect.tryPromise({
      try: async (signal) => {
        const child = Bun.spawn(
          [
            "sqlite3",
            "-batch",
            "-bail",
            "-safe",
            "-init",
            "/dev/null",
            "-noheader",
            "-list",
            ":memory:",
          ],
          {
            stdin: new Blob([sql, "\n;\n", proof]),
            stdout: "pipe",
            stderr: "ignore",
          },
        );
        const stop = () => {
          if (child.exitCode === null) child.kill();
        };
        signal.addEventListener("abort", stop, { once: true });
        try {
          const [code, stdout] = await Promise.all([
            child.exited,
            new Response(child.stdout).text(),
          ]);
          if (code !== 0) throw failure();
          return stdout.trim().split("\n").at(-1) ?? "";
        } finally {
          signal.removeEventListener("abort", stop);
          stop();
        }
      },
      catch: failure,
    }).pipe(
      Effect.timeoutFail({
        duration: "60 seconds",
        onTimeout: () =>
          new Error(
            "SQL script verification timed out. No migration is authorized; SQL details are suppressed.",
          ),
      }),
    );
    yield* Schema.decodeUnknown(
      Schema.parseJson(
        Schema.Struct({
          nonce: Schema.Literal(nonce),
          integrity: Schema.Literal("ok"),
          foreign_keys: Schema.Literal(0),
          tables: Schema.Literal(requiredTables.length),
        }),
      ),
    )(output).pipe(Effect.mapError(failure));
  });
