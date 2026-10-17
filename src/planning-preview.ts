import { Clock, Effect, Schema } from "effect";
import { parseJsonRequest } from "./adapters/request-json";
import { storeLayer } from "./adapters/store";
import { BankingError, type Session } from "./domain/banking";
import { Store } from "./domain/ports";
import { planningRequest } from "./planning-http";

type PreviewEnvironment = {
  DB: D1Database;
  ASSETS: Fetcher;
  LOCAL_PLANNING_PREVIEW: string;
  APP_REVISION: string;
};
const fail = (message: string, status = 400) =>
  Effect.fail(new BankingError({ message, status }));
const hash = (token: string) =>
  Effect.tryPromise({
    try: () =>
      crypto.subtle
        .digest("SHA-256", new TextEncoder().encode(token))
        .then((bytes) =>
          Array.from(new Uint8Array(bytes), (v) =>
            v.toString(16).padStart(2, "0"),
          ).join(""),
        ),
    catch: () =>
      new BankingError({
        message: "Local planning session could not be verified.",
        status: 503,
      }),
  });
const handle = (request: Request, env: PreviewEnvironment) =>
  Effect.gen(function* () {
    const url = new URL(request.url);
    if (
      request.method === "POST" &&
      request.headers.has("Origin") &&
      request.headers.get("Origin") !== url.origin
    )
      return yield* fail(
        "Local planning commands require the same origin.",
        403,
      );
    const store = yield* Store;
    if (url.pathname === "/api/planning-preview/info")
      return Response.json({ localOnly: true, revision: env.APP_REVISION });
    if (
      url.pathname === "/api/planning-preview/session" &&
      request.method === "POST"
    ) {
      const input = yield* parseJsonRequest(
        request,
        Schema.Struct({
          relationship: Schema.String.pipe(
            Schema.pattern(/^synthetic-preview-[a-z0-9-]{1,60}$/),
          ),
          role: Schema.Literal("customer", "officer", "approver"),
        }),
      );
      const token = crypto.randomUUID();
      yield* store.run(
        "INSERT INTO banks(id) VALUES(?) ON CONFLICT(id) DO NOTHING",
        input.relationship,
      );
      yield* store.run(
        "INSERT INTO sessions(token_hash,bank_id,role,expires_at) VALUES(?,?,?,?)",
        yield* hash(token),
        input.relationship,
        input.role,
        (yield* Clock.currentTimeMillis) + 3600000,
      );
      return Response.json(
        { relationship: input.relationship, role: input.role },
        {
          headers: {
            "Set-Cookie": `of_planning_preview=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600`,
          },
        },
      );
    }
    if (!url.pathname.startsWith("/api/planning"))
      return yield* fail(
        "This isolated preview serves planning only. Banking remains in its existing workspace.",
        404,
      );
    const token = request.headers
      .get("Cookie")
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith("of_planning_preview="))
      ?.slice(20);
    if (!token)
      return yield* fail(
        "Choose an explicit local planning preview session first.",
        401,
      );
    const session = yield* store.one<Session>(
      "SELECT * FROM sessions WHERE token_hash=? AND expires_at>?",
      yield* hash(token),
      yield* Clock.currentTimeMillis,
    );
    if (!session)
      return yield* fail(
        "The local preview session expired. Choose its relationship and role again.",
        401,
      );
    return yield* planningRequest(request, session, "true");
  });
export default {
  fetch(request: Request, env: PreviewEnvironment): Promise<Response> {
    const url = new URL(request.url);
    if (
      env.LOCAL_PLANNING_PREVIEW !== "true" ||
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
    )
      return Promise.resolve(
        Response.json(
          {
            error:
              "This planning preview accepts loopback development requests only.",
          },
          { status: 403 },
        ),
      );
    if (url.pathname === "/")
      return Promise.resolve(Response.redirect(`${url.origin}/planning`, 302));
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    return Effect.runPromise(
      handle(request, env).pipe(
        Effect.provide(storeLayer(env.DB)),
        Effect.catchAll((error) =>
          Effect.succeed(
            Response.json({ error: error.message }, { status: error.status }),
          ),
        ),
        Effect.catchAllDefect(() =>
          Effect.succeed(
            Response.json(
              {
                error:
                  "The local preview failed. Inspect the original command reference before retrying.",
              },
              { status: 500 },
            ),
          ),
        ),
        Effect.map((response) => {
          const result = new Response(response.body, response);
          result.headers.set("Cache-Control", "no-store");
          result.headers.set("X-Content-Type-Options", "nosniff");
          return result;
        }),
      ),
    );
  },
};
