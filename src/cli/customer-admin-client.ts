import { HttpClient, HttpClientRequest } from "@effect/platform";
import { Effect, Schema } from "effect";
import {
  loanAdminOrigin,
  loanAdminRevision,
  loanAdminToken,
} from "./loan-admin";

export const customerAdminClient = (url: string, secrets: string) =>
  Effect.gen(function* () {
    const origin = yield* loanAdminOrigin(url);
    const revision = yield* loanAdminRevision();
    const read = (response: {
      status: number;
      json: Effect.Effect<unknown, unknown>;
    }) =>
      Effect.gen(function* () {
        const value = yield* response.json.pipe(
          Effect.mapError(
            () =>
              new Error(
                "Customer administration returned unreadable data; inspect the original stage without resending it.",
              ),
          ),
        );
        if (response.status !== 200)
          return yield* Effect.fail(
            new Error(
              `Customer administration failed (${response.status}); inspect status before continuing. No request was retried.`,
            ),
          );
        return value;
      });
    yield* HttpClient.get(`${origin}/api/health`).pipe(
      Effect.flatMap(read),
      Effect.flatMap(
        Schema.decodeUnknown(
          Schema.Struct({ revision: Schema.Literal(revision) }),
        ),
      ),
      Effect.mapError(
        () =>
          new Error(
            "Customer administration requires the deployed revision to equal this clean reviewed checkout.",
          ),
      ),
      Effect.timeoutFail({
        duration: "10 seconds",
        onTimeout: () =>
          new Error(
            "Source verification timed out before reading credentials; no customer command was sent.",
          ),
      }),
    );
    const token = yield* loanAdminToken(secrets);
    return {
      revision,
      call: (body: unknown) =>
        Effect.gen(function* () {
          const request = yield* HttpClientRequest.post(
            `${origin}/api/admin/demo/customers`,
          ).pipe(
            HttpClientRequest.setHeader("Authorization", `Bearer ${token}`),
            HttpClientRequest.bodyJson(body),
            Effect.mapError(
              () =>
                new Error(
                  "Could not encode the original customer administration request.",
                ),
            ),
          );
          return yield* HttpClient.execute(request).pipe(
            Effect.mapError(
              () =>
                new Error(
                  "Customer administration connection failed. Inspect original status; credentials and connection diagnostics are suppressed.",
                ),
            ),
            Effect.flatMap(read),
            Effect.timeoutFail({
              duration: "120 seconds",
              onTimeout: () =>
                new Error(
                  "The original customer administration request timed out. Inspect its saved stage before resuming; no request was retried.",
                ),
            }),
          );
        }),
    };
  });
