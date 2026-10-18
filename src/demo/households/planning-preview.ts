import { Clock, Effect, Schema } from "effect";
import { BankingError } from "../../platform/banking-workspace/domain/banking";
import { Store } from "../../platform/banking-workspace/domain/ports";
import type { Environment } from "../../runtime/http/environment";
import { handleRequest } from "../../runtime/http/http";
import { parseJsonRequest } from "../../runtime/http/request-json";
import { storeLayer } from "../../runtime/storage/store";
import { planningPortalFixture } from "./planning-portal-fixture";

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
        "INSERT INTO banks(id,status,journey) VALUES(?,'ready','existing') ON CONFLICT(id) DO NOTHING",
        input.relationship,
      );
      yield* store.run(
        "INSERT INTO financial_snapshots(bank_id,payload,synced_at,invalidated_at) VALUES(?,?,?,0) ON CONFLICT(bank_id) DO NOTHING",
        input.relationship,
        JSON.stringify(planningPortalFixture()),
        yield* Clock.currentTimeMillis,
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
            "Set-Cookie": `of_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600`,
          },
        },
      );
    }
    if (
      !(
        url.pathname === "/api/planning" ||
        url.pathname.startsWith("/api/planning/") ||
        [
          "/api/dashboard",
          "/api/session/role",
          "/api/telemetry-config",
        ].includes(url.pathname)
      )
    )
      return yield* fail(
        "This isolated preview permits planning and a synthetic portal shell only. Banking operations require the existing core-backed workspace.",
        403,
      );
    if (
      url.pathname === "/api/dashboard" &&
      url.searchParams.get("refresh") === "true"
    )
      return yield* fail(
        "This local portal fixture cannot refresh or call the banking core.",
        403,
      );
    // Only the allowlisted routes above reach the real HTTP/session adapter.
    // This local config intentionally has no Core/R2 binding and cannot perform bank operations.
    return yield* Effect.tryPromise({
      try: () =>
        handleRequest(request, {
          ...env,
          DEMO_MODE: "true",
        } as unknown as Environment),
      catch: () =>
        new BankingError({
          message:
            "The local portal request failed; inspect its retained reference before retrying.",
          status: 503,
        }),
    });
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
