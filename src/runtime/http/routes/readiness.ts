import { Effect } from "effect";
import { Core, Store } from "../../../platform/banking-workspace/domain/ports";
import type { Environment } from "../environment";
import { failure } from "../request-context";
export const readinessRoutes = (request: Request, env: Environment) =>
  Effect.gen(function* () {
    const path = new URL(request.url).pathname;
    const store = yield* Store;
    if (path === "/api/health")
      return Response.json({
        status: "ok",
        app: "OpenFinacle",
        revision: env.APP_REVISION,
        engine: "Apache Fineract 1.15.0",
      });
    if (path === "/api/telemetry-config")
      return Response.json({ dsn: env.SENTRY_DSN, release: env.APP_REVISION });
    if (path === "/api/ready" && request.method === "GET") {
      yield* store.one("SELECT 1 AS ready").pipe(
        Effect.timeoutFail({
          duration: "5 seconds",
          onTimeout: () => failure("Workflow storage is not ready.", 503),
        }),
      );
      const core = yield* Core;
      yield* core.request("GET", "offices/1").pipe(
        Effect.timeoutFail({
          duration: "35 seconds",
          onTimeout: () =>
            failure(
              "The banking engine is starting or unavailable. No demo accounts have been created. Please check again shortly.",
              503,
            ),
        }),
      );
      return Response.json({ status: "ready", revision: env.APP_REVISION });
    }
  });
