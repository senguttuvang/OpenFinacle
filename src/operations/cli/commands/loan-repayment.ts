import { Command, Options } from "@effect/cli";
import { FetchHttpClient } from "@effect/platform";
import { Console, Effect } from "effect";
import { loanAdminClient } from "../loan-admin-client";
import {
  buildRepaymentPilotCommand,
  repaymentPilotActions,
  repaymentPilotReport,
  verifyRepaymentPilotResponse,
} from "../loan-repayment-report";

export const loanRepayment = Command.make(
  "loan-repayment",
  {
    url: Options.text("url").pipe(
      Options.withDefault("https://openfinacle.plts.in"),
    ),
    secrets: Options.text("secrets-file").pipe(
      Options.withDefault(".dev.vars"),
    ),
    action: Options.choice("action", repaymentPilotActions).pipe(
      Options.withDefault("status"),
    ),
    role: Options.choice("role", ["customer", "officer", "approver"]).pipe(
      Options.withDefault("customer"),
    ),
    loanId: Options.text("loan-id").pipe(Options.withDefault("")),
    id: Options.text("request-id").pipe(Options.withDefault("")),
    offerId: Options.text("offer-id").pipe(Options.withDefault("")),
    key: Options.text("key").pipe(Options.withDefault("")),
    version: Options.integer("request-version").pipe(Options.withDefault(-1)),
    amountMinor: Options.integer("amount-minor").pipe(Options.withDefault(-1)),
    note: Options.text("note").pipe(Options.withDefault("")),
    accept: Options.boolean("accept-offer"),
  },
  (options) =>
    Effect.gen(function* () {
      const command = yield* buildRepaymentPilotCommand(options);
      const client = yield* loanAdminClient(options.url, options.secrets);
      yield* Console.log(
        `Verified source ${client.revision}; operator demonstration with simulated ${command.role} role.`,
      );
      const value = yield* client
        .call("repayments", command)
        .pipe(
          Effect.flatMap((input) =>
            verifyRepaymentPilotResponse(command, input),
          ),
        );
      yield* Console.log(JSON.stringify(repaymentPilotReport(value)));
      if (
        (command.kind === "inspect" ||
          (command.kind === "action" && command.command.action === "pay")) &&
        "repayment" in value &&
        value.recorded_operation?.status !== "confirmed"
      )
        return yield* Effect.fail(
          new Error(
            "The original repayment is not confirmed. Inspect the saved reference; no Core write was retried.",
          ),
        );
    }).pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.RequestInit, { redirect: "error" }),
    ),
);
