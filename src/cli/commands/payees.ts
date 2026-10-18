import { Command, Options } from "@effect/cli";
import { FetchHttpClient } from "@effect/platform";
import { Console, Effect } from "effect";
import { customerAdminClient } from "../customer-admin-client";

export const payees = Command.make(
  "payees",
  {
    url: Options.text("url").pipe(Options.withDefault("http://localhost:8900")),
    secrets: Options.text("secrets-file").pipe(
      Options.withDefault(".dev.vars"),
    ),
    action: Options.choice("action", ["status", "prepare", "resume"]).pipe(
      Options.withDefault("status"),
    ),
    branchId: Options.text("branch-id"),
    start: Options.integer("start").pipe(Options.withDefault(1)),
    limit: Options.integer("limit").pipe(Options.withDefault(1)),
  },
  (options) =>
    Effect.gen(function* () {
      if (
        !/^[a-zA-Z0-9_-]{1,100}$/.test(options.branchId) ||
        options.start < 1 ||
        options.start > 150 ||
        options.limit < 1 ||
        options.limit > 10
      )
        return yield* Effect.fail(
          new Error(
            "Use the original branch ID and bounded --start 1-150 --limit 1-10. Payee setup changes metadata only.",
          ),
        );
      const client = yield* customerAdminClient(
        options.url,
        options.secrets,
        "/api/admin/demo/payees",
      );
      const result = yield* client.call({
        action: options.action,
        branchId: options.branchId,
        start: options.start,
        limit: options.limit,
      });
      // One bounded JSON line survives pipes; no membership dump or credential diagnostics.
      yield* Console.log(JSON.stringify({ revision: client.revision, result }));
    }).pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.RequestInit, { redirect: "error" }),
    ),
);
