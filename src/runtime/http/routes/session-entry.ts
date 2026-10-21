import { Effect, Schema } from "effect";
import { scenarioBank } from "../../../demo/scenarios/demo-scenarios";
import { requiredBank } from "../../../platform/banking-workspace/application/banking";
import { type Session } from "../../../platform/banking-workspace/domain/banking";
import { Store } from "../../../platform/banking-workspace/domain/ports";
import { customerDashboard } from "../../../platform/customers/application/customer-dashboard";
import type { Environment } from "../environment";
import { failure, getSession, hash } from "../request-context";
import { parseJsonRequest as parse } from "../request-json";
export const sessionEntry = (request: Request, _env: Environment) =>
  Effect.gen(function* () {
    const url = new URL(request.url);
    const path = url.pathname;
    const store = yield* Store;
    if (path === "/api/session" && request.method === "POST") {
      const input = yield* parse(
        request,
        Schema.Struct({
          journey: Schema.optional(Schema.Literal("new", "existing")),
        }),
        true,
      );
      if (input.journey === "existing")
        return yield* Effect.fail(
          failure(
            "Choose a specific registered customer from the directory before entering the existing journey.",
            400,
          ),
        );
      const current = yield* getSession(request).pipe(
        Effect.catchAll((error) =>
          error.status === 401 ? Effect.succeed(null) : Effect.fail(error),
        ),
      );
      if (current) {
        const bank = yield* requiredBank(current);
        if (!input.journey || bank.journey === input.journey)
          return Response.json({
            bankId: bank.id,
            journey: bank.journey,
            resumed: true,
            dashboard: yield* customerDashboard(current, false),
          });
      }
      const limitKey = `${Math.floor(Date.now() / 3600000)}:${yield* hash(request.headers.get("CF-Connecting-IP") ?? "local")}`;
      const usage = yield* store.one<{ attempts: number }>(
        "INSERT INTO usage_limits(key,attempts) VALUES(?,1) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 RETURNING attempts",
        limitKey,
      );
      if ((usage?.attempts ?? 121) > 120)
        return yield* Effect.fail(
          failure(
            "This connection has reached the hourly demo limit. Continue in your existing workspace or try again later.",
            429,
          ),
        );
      const token = crypto.randomUUID() + crypto.randomUUID();
      const bank = yield* scenarioBank(input.journey ?? "new");
      const id = bank.id;
      const session: Session = {
        token_hash: yield* hash(token),
        bank_id: id,
        role: "customer",
        expires_at: Date.now() + 31536000000,
      };
      yield* store.run(
        "INSERT INTO sessions(token_hash,bank_id,role,expires_at) VALUES(?,?,'customer',?)",
        session.token_hash,
        id,
        session.expires_at,
      );
      return Response.json(
        {
          bankId: id,
          journey: bank.journey,
          dashboard: yield* customerDashboard(session, false),
        },
        {
          headers: {
            "Set-Cookie": `of_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=31536000`,
          },
        },
      );
    }
  });
