import { HttpClient, HttpClientRequest } from "@effect/platform";
import { Effect, Schema } from "effect";
import {
  loanAdminOrigin,
  loanAdminRevision,
  loanAdminToken,
} from "./loan-admin";
import { loanAdminHttpFailure } from "./loan-setup-report";

const readJson = (response: {
  status: number;
  json: Effect.Effect<unknown, unknown>;
}) =>
  Effect.gen(function* () {
    const data = yield* response.json.pipe(
      Effect.mapError(
        () =>
          new Error(
            "The loan administration response is unreadable. Inspect the original saved reference; no request was retried.",
          ),
      ),
    );
    if (response.status !== 200)
      return yield* Effect.fail(loanAdminHttpFailure(response.status, data));
    return data;
  });
const paths = ["setup", "inspect", "advance", "quote", "pilot"] as const;
export const loanAdminClient = (url: string, secrets: string) =>
  Effect.gen(function* () {
    const origin = yield* loanAdminOrigin(url);
    const revision = yield* loanAdminRevision();
    yield* HttpClient.get(`${origin}/api/health`).pipe(
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
    // No credential file is inspected until the owning origin/revision is verified.
    const token = yield* loanAdminToken(secrets);
    const call = (path: (typeof paths)[number], body?: unknown) =>
      Effect.gen(function* () {
        if (!(paths as readonly string[]).includes(path))
          return yield* Effect.fail(
            new Error(
              "Unknown loan administration boundary; no request was sent.",
            ),
          );
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
                  "Could not encode the original loan administration request.",
                ),
            ),
          );
        const response = yield* HttpClient.execute(request).pipe(
          Effect.mapError(
            () =>
              new Error(
                "Loan administration connection failed. Credential-bearing diagnostics are suppressed. Inspect the original saved reference; no request was retried.",
              ),
          ),
        );
        return yield* readJson(response);
      });
    return { revision, call };
  });
