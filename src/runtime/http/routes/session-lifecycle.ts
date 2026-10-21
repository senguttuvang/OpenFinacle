import { Effect, Schema } from "effect";
import type { Session } from "../../../platform/banking-workspace/domain/banking";
import { RoleSchema } from "../../../platform/banking-workspace/domain/banking";
import { Store } from "../../../platform/banking-workspace/domain/ports";
import type { Environment } from "../environment";
import { parseJsonRequest as parse } from "../request-json";
export const sessionLifecycle = (
  request: Request,
  env: Environment,
  session: Session,
) =>
  Effect.gen(function* () {
    const path = new URL(request.url).pathname;
    const store = yield* Store;
    if (path === "/api/session/end" && request.method === "POST") {
      yield* store.run(
        "DELETE FROM sessions WHERE token_hash=?",
        session.token_hash,
      );
      return Response.json(
        { ended: true },
        {
          headers: {
            "Set-Cookie":
              "of_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0",
          },
        },
      );
    }
    if (path === "/api/session/role" && request.method === "POST") {
      const { role } = yield* parse(
        request,
        Schema.Struct({ role: RoleSchema }),
      );
      yield* store.run(
        "UPDATE sessions SET role=? WHERE token_hash=?",
        role,
        session.token_hash,
      );
      return Response.json({ role });
    }
  });
