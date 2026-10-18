import { Effect, Schema } from "effect";
import {
  BankingError,
  type Session,
} from "../../platform/banking-workspace/domain/banking";
import { Store } from "../../platform/banking-workspace/domain/ports";
export const failure = (message: string, status = 400) =>
  new BankingError({ message, status });
export const financialMutation = (request: Request) =>
  request.method === "POST" &&
  [
    "/api/commands",
    "/api/commands/approve",
    "/api/application/review",
  ].includes(new URL(request.url).pathname);
export const io = <A>(f: () => Promise<A>) =>
  Effect.tryPromise({
    try: f,
    catch: () =>
      failure(
        "The operation could not be completed. Refresh and inspect its status before retrying.",
        503,
      ),
  });
export const hash = (value: string) =>
  io(() =>
    crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(value))
      .then((buffer) =>
        Array.from(new Uint8Array(buffer), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join(""),
      ),
  );
export const getSession = (request: Request) =>
  Effect.gen(function* () {
    const token = request.headers
      .get("Cookie")
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith("of_session="))
      ?.slice(11);
    if (!token)
      return yield* Effect.fail(failure("Start a demo workspace first.", 401));
    const store = yield* Store;
    const session = yield* store.one<Session>(
      "SELECT * FROM sessions WHERE token_hash=? AND expires_at>?",
      yield* hash(token),
      Date.now(),
    );
    if (!session)
      return yield* Effect.fail(
        failure("Your demo session expired. Start a new workspace.", 401),
      );
    const expectedScope = request.headers.get("X-Customer-Scope");
    if (expectedScope && expectedScope !== session.bank_id)
      return yield* Effect.fail(
        failure(
          "Customer selection changed. Reload before continuing this operation.",
          409,
        ),
      );
    if (
      request.method !== "GET" &&
      !expectedScope &&
      !["/api/customer-selection", "/api/session"].includes(
        new URL(request.url).pathname,
      )
    ) {
      const registered = yield* store.one(
        "SELECT id FROM customers WHERE bank_id=? AND status='active'",
        session.bank_id,
      );
      if (registered)
        return yield* Effect.fail(
          failure(
            "Confirm the selected customer scope before changing this relationship.",
            409,
          ),
        );
    }
    return session;
  });
export const commandSchema = Schema.Struct({
  kind: Schema.Literal(
    "deposit",
    "withdrawal",
    "transfer",
    "salary",
    "freeze",
    "unfreeze",
    "reverse",
  ),
  amount: Schema.optional(Schema.Number),
  description: Schema.optional(Schema.String),
  beneficiaryId: Schema.optional(Schema.String),
  originalId: Schema.optional(Schema.String),
});
export const appSchema = Schema.Struct({
  name: Schema.String,
  email: Schema.String,
  phone: Schema.String,
  address: Schema.String,
  employment: Schema.String,
});
