import { Effect, Schema } from "effect";
import { BankingError } from "../domain/banking";

export const parseJsonRequest = <A, I>(
  request: Request,
  schema: Schema.Schema<A, I, never>,
  allowEmptyObject = false,
) =>
  Effect.gen(function* () {
    const text = yield* Effect.tryPromise({
      try: () => request.text(),
      catch: () =>
        new BankingError({
          message: "Could not read the request.",
          status: 400,
        }),
    });
    if (text.length > 20000)
      return yield* Effect.fail(
        new BankingError({ message: "Request is too large.", status: 413 }),
      );
    const data = yield* Effect.try({
      try: () =>
        allowEmptyObject && text.trim() === ""
          ? {}
          : (JSON.parse(text) as unknown),
      catch: () =>
        new BankingError({ message: "Send valid JSON.", status: 400 }),
    });
    return yield* Schema.decodeUnknown(schema)(data).pipe(
      Effect.mapError(
        () =>
          new BankingError({
            message: "Some required fields are missing or invalid.",
            status: 400,
          }),
      ),
    );
  });
