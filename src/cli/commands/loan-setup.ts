import { Command, Options } from "@effect/cli";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
} from "@effect/platform";
import { Console, Effect, Schema } from "effect";
import {
  LoanSetupState,
  loanSetupNext,
  loanSetupPending,
} from "../../domain/loan-setup";
import { LoanSchedule } from "../../domain/loans";
import {
  loanAdminOrigin,
  loanAdminRevision,
  loanAdminToken,
} from "../loan-admin";
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
      const origin = yield* loanAdminOrigin(url);
      const revision = yield* loanAdminRevision();
      const readJson = (response: {
        status: number;
        json: Effect.Effect<unknown, unknown>;
      }) =>
        Effect.gen(function* () {
          if (response.status !== 200)
            return yield* Effect.fail(
              new Error(
                `Loan administration HTTP ${response.status}. Read the saved checkpoint and inspect the original result before any create; response details are suppressed.`,
              ),
            );
          return yield* response.json.pipe(
            Effect.mapError(
              () =>
                new Error(
                  "The loan administration response is unreadable. Inspect the saved checkpoint; no request was retried.",
                ),
            ),
          );
        });
      const health = yield* HttpClient.get(`${origin}/api/health`).pipe(
        Effect.mapError(
          () =>
            new Error(
              "Could not verify the deployed source; no administrative request was sent.",
            ),
        ),
        Effect.flatMap(readJson),
        Effect.flatMap(
          Schema.decodeUnknown(
            Schema.Struct({ revision: Schema.Literal(revision) }),
          ),
        ),
        Effect.mapError(
          () =>
            new Error(
              "The deployed revision must equal this clean checkout before loan administration.",
            ),
        ),
      );
      yield* Console.log(`Verified source ${health.revision}.`);
      const token = yield* loanAdminToken(secrets);
      const call = (path: string, body?: unknown) =>
        Effect.gen(function* () {
          let request = HttpClientRequest.make(
            body === undefined ? "GET" : "POST",
          )(`${origin}/api/admin/demo/loans/${path}`).pipe(
            HttpClientRequest.setHeader("Authorization", `Bearer ${token}`),
          );
          if (body !== undefined)
            request = yield* HttpClientRequest.bodyJson(request, body).pipe(
              Effect.mapError(
                () =>
                  new Error(
                    "Could not encode the loan administration request.",
                  ),
              ),
            );
          const response = yield* HttpClient.execute(request).pipe(
            Effect.mapError(
              () =>
                new Error(
                  "Loan administration connection failed. Credential-bearing diagnostics are suppressed. Read and inspect the checkpoint before continuing; no request was retried.",
                ),
            ),
          );
          return yield* readJson(response);
        });
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
          Effect.flatMap(
            Schema.decodeUnknown(
              Schema.Struct({
                expected_disbursement_date: Schema.String,
                schedule: LoanSchedule,
                application_created: Schema.Literal(false),
                financial_posted: Schema.Literal(false),
              }),
            ),
          ),
          Effect.mapError(
            () =>
              new Error(
                "Core quote verification failed; no loan application or financial posting was requested.",
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
