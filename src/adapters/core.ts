import { getContainer } from "@cloudflare/containers";
import { Effect, Layer } from "effect";
import { BankingError } from "../domain/banking";
import { Core } from "../domain/ports";
import { safeCoreRoute } from "../domain/telemetry";
import { coreCommandKey } from "./core-command-key";
import { coreHttpFailure } from "./core-failure";
import type { Environment } from "./environment";

interface CoreFailure {
  error?: string;
  defaultUserMessage?: string;
  errors?: { defaultUserMessage?: string }[];
}
export const coreLayer = (env: Environment, requestId = "internal") =>
  Layer.succeed(Core, {
    request: <T>(method: string, path: string, body?: unknown, key?: string) =>
      Effect.suspend(() => {
        const started = Date.now();
        let status = 503;
        console.log(
          JSON.stringify({
            event: "core_request_started",
            requestId,
            route: safeCoreRoute(path),
            method,
          }),
        );
        return Effect.gen(function* () {
          const headers = new Headers({
            Authorization: `Basic ${btoa(`mifos:${env.CORE_PASSWORD}`)}`,
            "Fineract-Platform-TenantId": "default",
            "Content-Type": "application/json",
            "X-Request-ID": requestId,
          });
          if (key)
            headers.set(
              "Idempotency-Key",
              yield* Effect.tryPromise({
                try: () => coreCommandKey(key),
                catch: () =>
                  new BankingError({
                    message: "Could not prepare the core command identity.",
                    status: 503,
                  }),
              }),
            );
          const response = yield* Effect.tryPromise({
            try: (signal) =>
              getContainer(env.CORE, "banking").fetch(
                new Request(`http://core/fineract-provider/api/v1/${path}`, {
                  method,
                  headers,
                  signal,
                  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
                }),
              ),
            catch: () =>
              new BankingError({
                message:
                  "The banking core did not respond. Financial outcomes must be reconciled before retrying.",
                status: 503,
                uncertain: method !== "GET",
              }),
          });
          status = response.status;
          const text = yield* Effect.tryPromise({
            try: () => response.text(),
            catch: () =>
              new BankingError({
                message: "Could not read the core response.",
                status: 502,
                uncertain: method !== "GET",
              }),
          });
          const data = yield* Effect.try({
            try: () =>
              text
                ? (JSON.parse(text) as T & CoreFailure)
                : ({} as T & CoreFailure),
            catch: () =>
              new BankingError({
                message: "The core returned an unreadable response.",
                status: 502,
                uncertain: method !== "GET",
              }),
          });
          if (!response.ok)
            return yield* Effect.fail(
              coreHttpFailure(
                method,
                response.status,
                data.errors
                  ?.map((e) => e.defaultUserMessage)
                  .filter(Boolean)
                  .join("; ") ||
                  data.defaultUserMessage ||
                  data.error ||
                  `Banking operation declined (${response.status}).`,
              ),
            );
          return data as T;
        }).pipe(
          Effect.timeoutFail({
            duration: "60 seconds",
            onTimeout: () =>
              new BankingError({
                message:
                  "The banking core timed out. Inspect instruction status before retrying.",
                status: 503,
                uncertain: method !== "GET",
              }),
          }),
          Effect.tapError((error) =>
            Effect.sync(() => {
              status = error.status;
            }),
          ),
          Effect.ensuring(
            Effect.sync(() =>
              console.log(
                JSON.stringify({
                  event: "core_request",
                  requestId,
                  revision: env.APP_REVISION,
                  route: safeCoreRoute(path),
                  method,
                  status,
                  durationMs: Date.now() - started,
                }),
              ),
            ),
          ),
        );
      }),
  });
