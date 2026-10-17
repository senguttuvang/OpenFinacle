import { Command, Options } from "@effect/cli";
import { FetchHttpClient } from "@effect/platform";
import { Console, Effect, Schema } from "effect";
import { LoanPilotResponse } from "../../domain/loan-pilot";
import { loanAdminClient } from "../loan-admin-client";
import {
  buildLoanPilotCommand,
  loanPilotActions,
  loanPilotReport,
} from "../loan-pilot-report";

export const loanPilot = Command.make(
  "loan-pilot",
  {
    url: Options.text("url").pipe(
      Options.withDefault("https://openfinacle.plts.in"),
    ),
    secrets: Options.text("secrets-file").pipe(
      Options.withDefault(".dev.vars"),
    ),
    action: Options.choice("action", loanPilotActions).pipe(
      Options.withDefault("status"),
    ),
    role: Options.choice("role", ["customer", "officer", "approver"]).pipe(
      Options.withDefault("customer"),
    ),
    id: Options.text("loan-id").pipe(Options.withDefault("")),
    quoteId: Options.text("quote-id").pipe(Options.withDefault("")),
    key: Options.text("key").pipe(Options.withDefault("")),
    version: Options.integer("loan-version").pipe(Options.withDefault(-1)),
    note: Options.text("note").pipe(
      Options.withDefault(
        "Independently invented administrative demonstration instruction.",
      ),
    ),
    accept: Options.boolean("accept-quote"),
  },
  (options) =>
    Effect.gen(function* () {
      const command = yield* buildLoanPilotCommand(options);
      const client = yield* loanAdminClient(options.url, options.secrets);
      yield* Console.log(
        `Verified source ${client.revision}; operator demonstration with simulated ${command.role} role.`,
      );
      const result = yield* client
        .call("pilot", command)
        .pipe(
          Effect.flatMap((input) =>
            Schema.decodeUnknown(LoanPilotResponse)(input).pipe(
              Effect.mapError(
                () =>
                  new Error(
                    "Pilot response could not be verified. Inspect the original --key or --loan-id; no request was retried.",
                  ),
              ),
            ),
          ),
        );
      yield* Console.log(JSON.stringify(loanPilotReport(result)));
      if (
        (command.kind === "action" || command.kind === "inspect") &&
        "loan" in result &&
        result.recorded_operation &&
        (result.recorded_operation.status === "executing" ||
          result.recorded_operation.status === "uncertain" ||
          result.recorded_operation.status === "failed")
      )
        return yield* Effect.fail(
          new Error(
            "The original Core instruction is not confirmed. Use saved status and explicit approver inspection; no Core write was retried.",
          ),
        );
    }).pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.RequestInit, { redirect: "error" }),
    ),
);
