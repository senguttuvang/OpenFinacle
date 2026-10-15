import { Effect, Layer } from "effect";
import { BankingError } from "../domain/banking";
import { Store } from "../domain/ports";
export const storeLayer = (db: D1Database) =>
  Layer.succeed(Store, {
    all: <T>(sql: string, ...values: (string | number | null)[]) =>
      Effect.tryPromise({
        try: () =>
          db
            .prepare(sql)
            .bind(...values)
            .all<T>()
            .then((r) => r.results),
        catch: () =>
          new BankingError({
            message: "Could not read workflow records.",
            status: 503,
          }),
      }),
    one: <T>(sql: string, ...values: (string | number | null)[]) =>
      Effect.tryPromise({
        try: () =>
          db
            .prepare(sql)
            .bind(...values)
            .first<T>(),
        catch: () =>
          new BankingError({
            message: "Could not read workflow record.",
            status: 503,
          }),
      }),
    run: (sql: string, ...values: (string | number | null)[]) =>
      Effect.tryPromise({
        try: () =>
          db
            .prepare(sql)
            .bind(...values)
            .run()
            .then((r) => r.meta.changes),
        catch: () =>
          new BankingError({
            message:
              "Could not persist workflow. Refresh and inspect its state before retrying.",
            status: 503,
          }),
      }),
  });
