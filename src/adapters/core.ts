import { getContainer } from "@cloudflare/containers";
import { Effect, Layer } from "effect";
import { BankingError } from "../domain/banking";
import { Core } from "../domain/ports";
import { coreCommandKey } from "./core-command-key";
import type { Environment } from "./environment";

interface CoreFailure {
  error?: string;
  defaultUserMessage?: string;
  errors?: { defaultUserMessage?: string }[];
}
export const coreLayer = (env: Environment) =>
  Layer.succeed(Core, {
    request: <T>(method: string, path: string, body?: unknown, key?: string) =>
      Effect.gen(function* () {
        const headers = new Headers({
          Authorization: `Basic ${btoa(`mifos:${env.CORE_PASSWORD}`)}`,
          "Fineract-Platform-TenantId": "default",
          "Content-Type": "application/json",
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
          try: () =>
            getContainer(env.CORE, "banking").fetch(
              new Request(`http://core/fineract-provider/api/v1/${path}`, {
                method,
                headers,
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
            new BankingError({
              message:
                data.errors
                  ?.map((e) => e.defaultUserMessage)
                  .filter(Boolean)
                  .join("; ") ||
                data.defaultUserMessage ||
                data.error ||
                `Banking operation declined (${response.status}).`,
              status: response.status >= 500 ? 503 : 422,
              uncertain: response.status >= 500 && method !== "GET",
            }),
          );
        return data as T;
      }),
  });
