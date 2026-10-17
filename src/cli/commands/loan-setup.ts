import { Command, Options } from "@effect/cli";
import { FetchHttpClient } from "@effect/platform";
import { Console, Effect, Schema } from "effect";
import {
  LoanSetupState,
  loanSetupNext,
  loanSetupPending,
} from "../../domain/loan-setup";
import { LoanSchedule } from "../../domain/loans";
import { loanAdminClient } from "../loan-admin-client";
import { loanSetupReport } from "../loan-setup-report";

export const loanSetup = Command.make(
  "loan-setup",
  {
    url: Options.text("url").pipe(
      Options.withDefault("https://openfinacle.plts.in"),
    ),
    secrets: Options.text("secrets-file").pipe(
      Options.withDefault(".dev.vars"),
    ),
    action: Options.choice("action", [
      "status",
      "inspect",
      "advance",
      "quote",
    ]).pipe(Options.withDefault("status")),
  },
  ({ url, secrets, action }) =>
    Effect.gen(function* () {
      const { revision, call } = yield* loanAdminClient(url, secrets);
      yield* Console.log(`Verified source ${revision}.`);
      const state = yield* call("setup").pipe(
        Effect.flatMap(Schema.decodeUnknown(LoanSetupState)),
        Effect.mapError(
          () =>
            new Error(
              "Could not verify saved loan setup status; no create was sent.",
            ),
        ),
      );
      const report = (current: LoanSetupState) =>
        Console.log(JSON.stringify(loanSetupReport(current)));
      if (action === "status") return yield* report(state);
      if (action === "quote") {
        const preview = yield* call("quote", {
          terms: {
            product: "core-personal",
            principal: 12000,
            months: 12,
            purpose: "education",
            monthly_income: 30000,
            monthly_commitments: 5000,
            monthly_expenses: 10000,
          },
        }).pipe(
          Effect.flatMap((input) =>
            Schema.decodeUnknown(
              Schema.Struct({
                expected_disbursement_date: Schema.String,
                schedule: LoanSchedule,
                application_created: Schema.Literal(false),
                financial_posted: Schema.Literal(false),
              }),
            )(input).pipe(
              Effect.mapError(
                () =>
                  new Error(
                    "Core quote verification failed; no loan application or financial posting was requested.",
                  ),
              ),
            ),
          ),
        );
        return yield* Console.log(
          JSON.stringify({
            date: preview.expected_disbursement_date,
            principal_minor: preview.schedule.principal_minor,
            interest_minor: preview.schedule.interest_minor,
            repayment_minor: preview.schedule.repayment_minor,
            installments: preview.schedule.installments.length,
            application_created: false,
            financial_posted: false,
          }),
        );
      }
      if (action === "advance" && loanSetupPending(state))
        return yield* Effect.fail(
          new Error(
            "Original setup remains unresolved. Use --action inspect; absence never permits repeating its create.",
          ),
        );
      const next = loanSetupNext(state);
      if (action === "advance" && next === null) return yield* report(state);
      const result = yield* call(
        action === "inspect" ? "inspect" : "advance",
        action === "inspect"
          ? {}
          : { step: next, version: state.version, key: crypto.randomUUID() },
      ).pipe(
        Effect.flatMap(Schema.decodeUnknown(LoanSetupState)),
        Effect.mapError(
          () =>
            new Error(
              "Setup response could not be verified. Read saved status and inspect before continuing; no request was retried.",
            ),
        ),
      );
      yield* report(result);
      if (loanSetupPending(result) || result.events.at(-1)?.status === "failed")
        return yield* Effect.fail(
          new Error(
            "Setup is incomplete. Inspect the saved original outcome; an uncertain result cannot be retried. A definite validation failure requires an explicitly requested fresh attempt.",
          ),
        );
    }).pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.RequestInit, { redirect: "error" }),
    ),
);
