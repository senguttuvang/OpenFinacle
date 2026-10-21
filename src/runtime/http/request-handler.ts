import { Effect, Layer } from "effect";
import { requiredBank } from "../../platform/banking-workspace/application/banking";
import { financialView } from "../../platform/banking-workspace/application/financial-view";
import { coreLayer } from "../../platform/core-banking/infrastructure/core";
import { customerProvisionerLayer } from "../../platform/customers/infrastructure/customer-provisioning";
import { loanCatalogueLayer } from "../../platform/lending/infrastructure/loan-catalogue";
import { loanEngineLayer } from "../../platform/lending/infrastructure/loan-engine";
import { loanEnquiryLayer } from "../../platform/lending/infrastructure/loan-enquiry";
import { loanRepayerLayer } from "../../platform/lending/infrastructure/loan-repayments";
import { loanWriterLayer } from "../../platform/lending/infrastructure/loan-writing";
import { safeRoute } from "../../platform/observability/domain/telemetry";
import { reportFailure } from "../../platform/observability/infrastructure/telemetry";
import { customerTransferLayer } from "../../platform/payments/infrastructure/customer-transfers";
import { storeLayer } from "../storage/store";
import type { Environment } from "./environment";
import { failure, financialMutation, getSession } from "./request-context";
import { handle } from "./router";
export const handleRequest = (
  request: Request,
  env: Environment,
): Promise<Response> => {
  const started = Date.now();
  const requestId = crypto.randomUUID();
  let eventId: string | undefined;
  const route = safeRoute(new URL(request.url).pathname);
  console.log(
    JSON.stringify({
      event: "http_request_started",
      requestId,
      route,
      method: request.method,
      revision: env.APP_REVISION,
    }),
  );
  const diagnostic = (status: number) => ({
    requestId,
    route,
    method: request.method,
    status,
    durationMs: Date.now() - started,
  });
  return Effect.runPromise(
    handle(request, env).pipe(
      Effect.tap((response) =>
        financialMutation(request) && response.ok
          ? Effect.gen(function* () {
              const session = yield* getSession(request);
              const bank = yield* requiredBank(session);
              yield* financialView(bank, true).pipe(
                Effect.mapError(() =>
                  failure(
                    "The instruction status is saved, but balances could not be refreshed. Inspect its status and use Refresh balances; do not repeat the financial instruction.",
                    503,
                  ),
                ),
              );
            })
          : Effect.void,
      ),
      Effect.provide(loanWriterLayer),
      Effect.provide(customerTransferLayer),
      Effect.provide(customerProvisionerLayer),
      Effect.provide(loanRepayerLayer),
      Effect.provide(loanEnquiryLayer),
      Effect.provide(Layer.merge(loanCatalogueLayer, loanEngineLayer)),
      Effect.provide(
        Layer.merge(coreLayer(env, requestId), storeLayer(env.DB)),
      ),
      Effect.catchAll((error) =>
        Effect.sync(() => {
          if (error.status >= 500)
            eventId = reportFailure({
              ...diagnostic(error.status),
              uncertain: error.uncertain,
            });
          return Response.json(
            {
              error: error.message,
              uncertain: error.uncertain ?? false,
              requestId,
            },
            { status: error.status },
          );
        }),
      ),
      Effect.catchAllDefect((defect) =>
        Effect.sync(() => {
          eventId = reportFailure(diagnostic(500), defect);
          return Response.json(
            {
              error:
                "An unexpected error occurred. Inspect instruction status before retrying.",
              requestId,
            },
            { status: 500 },
          );
        }),
      ),
      Effect.map((response) => {
        const secured = new Response(response.body, response);
        secured.headers.set("Cache-Control", "no-store");
        secured.headers.set("X-Content-Type-Options", "nosniff");
        secured.headers.set("Referrer-Policy", "same-origin");
        secured.headers.set("X-Request-ID", requestId);
        if (eventId) secured.headers.set("X-Error-ID", eventId);
        secured.headers.set("Server-Timing", `app;dur=${Date.now() - started}`);
        console.log(
          JSON.stringify({
            event: "http_request",
            revision: env.APP_REVISION,
            ...diagnostic(response.status),
          }),
        );
        return secured;
      }),
    ),
  );
};
