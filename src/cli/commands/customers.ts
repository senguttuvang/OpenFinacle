import { Command, Options } from "@effect/cli";
import { FetchHttpClient } from "@effect/platform";
import { Console, Effect } from "effect";
import { customerAdminClient } from "../customer-admin-client";

export const customers = Command.make(
  "customers",
  {
    url: Options.text("url").pipe(Options.withDefault("http://localhost:8897")),
    secrets: Options.text("secrets-file").pipe(
      Options.withDefault(".dev.vars"),
    ),
    action: Options.choice("action", [
      "status",
      "prepare",
      "resume",
      "inspect",
    ]).pipe(Options.withDefault("status")),
    branchId: Options.text("branch-id"),
    customerId: Options.text("customer-id").pipe(Options.withDefault("")),
    start: Options.integer("start").pipe(Options.withDefault(1)),
    limit: Options.integer("limit").pipe(Options.withDefault(1)),
    maxStages: Options.integer("max-stages").pipe(Options.withDefault(1)),
  },
  (options) =>
    Effect.gen(function* () {
      if (
        !/^[a-zA-Z0-9_-]{1,100}$/.test(options.branchId) ||
        (options.action === "inspect" &&
          !/^[a-zA-Z0-9_-]{1,100}$/.test(options.customerId)) ||
        options.start < 1 ||
        options.start > 100 ||
        options.limit < 1 ||
        options.limit > 10 ||
        options.maxStages < 1 ||
        options.maxStages > 5
      )
        return yield* Effect.fail(
          new Error(
            "Use the original branch/customer reference and a bounded range: --start 1–100 --limit 1–10.",
          ),
        );
      const client = yield* customerAdminClient(options.url, options.secrets);
      yield* Console.log(
        `Verified customer administration source ${client.revision}. Synthetic INR demonstration funds only.`,
      );
      const value = yield* client.call({
        action: options.action,
        branchId: options.branchId,
        customerId: options.customerId,
        start: options.start,
        limit: options.limit,
        maxStages: options.maxStages,
      });
      yield* Console.log(JSON.stringify(value));
    }).pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.RequestInit, { redirect: "error" }),
    ),
);
