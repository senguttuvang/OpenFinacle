import { homedir } from "node:os";
import { join } from "node:path";
import { Command } from "@effect/cli";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Console, Effect } from "effect";

const config = new URL(
  "../../../config/previews/planning.wrangler.jsonc",
  import.meta.url,
).pathname;
const root = new URL("../../../", import.meta.url).pathname;
const capture = (args: string[]) =>
  Effect.tryPromise({
    try: () => {
      const child = Bun.spawn(args, {
        cwd: root,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      });
      return Promise.all([child.exited, new Response(child.stdout).text()]);
    },
    catch: () => new Error("Could not identify the planning preview source."),
  }).pipe(
    Effect.flatMap(([code, output]) =>
      code === 0
        ? Effect.succeed(output.trim())
        : Effect.fail(
            new Error("Planning preview source identification failed."),
          ),
    ),
  );
const directory = join(
  homedir(),
  ".cache",
  "openfinacle-finacle5-portal-integration",
);
const execute = (args: string[]) =>
  Effect.tryPromise({
    try: () =>
      Bun.spawn(args, {
        cwd: root,
        stdin: "ignore",
        stdout: "inherit",
        stderr: "inherit",
      }).exited,
    catch: () => new Error("Could not start the local-only preview command."),
  }).pipe(
    Effect.flatMap((code) =>
      code === 0
        ? Effect.void
        : Effect.fail(
            new Error(
              `Local preview command failed (${code}). Existing records were preserved; inspect status before preparing again.`,
            ),
          ),
    ),
  );
const sql = (args: string[]) =>
  execute([
    "bunx",
    "wrangler",
    "d1",
    "execute",
    "DB",
    "--config",
    config,
    "--local",
    "--persist-to",
    directory,
    "--yes",
    ...args,
  ]);
const prepare = Command.make("prepare", {}, () =>
  Effect.gen(function* () {
    yield* execute([
      "bunx",
      "wrangler",
      "d1",
      "migrations",
      "apply",
      "DB",
      "--config",
      config,
      "--local",
      "--persist-to",
      directory,
    ]);
    yield* Console.log(
      "Local-only planning schema prepared. Setup never resets existing households. No remote database, core account or migration registry was changed.",
    );
  }),
);
const status = Command.make("status", {}, () =>
  sql([
    "--command",
    "SELECT COUNT(*) AS saved_households FROM planning_households",
  ]),
);
const start = Command.make("start", {}, () =>
  Effect.gen(function* () {
    const revision = yield* capture(["git", "rev-parse", "HEAD"]);
    if (!/^[a-f0-9]{40}$/.test(revision))
      return yield* Effect.fail(
        new Error("Planning preview source revision is invalid."),
      );
    const dirty = yield* capture(["git", "status", "--porcelain"]);
    yield* execute([
      "bunx",
      "wrangler",
      "dev",
      "--config",
      config,
      "--port",
      "8796",
      "--persist-to",
      directory,
      "--no-show-interactive-dev-session",
      "--var",
      `APP_REVISION:${revision}${dirty ? "-working-tree" : ""}`,
    ]);
  }),
);
const cli = Command.run(
  Command.make("planning-preview").pipe(
    Command.withSubcommands([prepare, status, start]),
  ),
  { name: "Local planning preview", version: "1.0.0" },
);
if (import.meta.main)
  NodeRuntime.runMain(
    cli(process.argv).pipe(Effect.provide(NodeContext.layer)),
  );
