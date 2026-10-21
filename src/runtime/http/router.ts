import { Effect, Schema } from "effect";
import {
  confirmBeneficiary,
  executeCommand,
  rejectCommand,
  reviewApplication,
} from "../../platform/banking-workspace/application/banking";
import { Store } from "../../platform/banking-workspace/domain/ports";
import { customerDashboard } from "../../platform/customers/application/customer-dashboard";
import { registerOpenedCustomer } from "../../platform/customers/application/customer-registry";
import { admin_routes } from "./admin-routes";
import { customerRoute } from "./customer-http";
import type { Environment } from "./environment";
import { lending_routes } from "./lending-routes";
import { onboardingRoute } from "./onboarding-http";
import { planningRequest } from "./planning-http";
import {
  failure,
  financialMutation,
  getSession,
  hash,
} from "./request-context";
import { parseJsonRequest as parse } from "./request-json";
import { documentRoutes } from "./routes/document-routes";
import { productRoutes } from "./routes/product-routes";
import { readinessRoutes } from "./routes/readiness";
import { serviceRoutes } from "./routes/service-routes";
import { sessionEntry } from "./routes/session-entry";
import { sessionLifecycle } from "./routes/session-lifecycle";
import { workflowRoutes } from "./routes/workflow-routes";

export const handle = (request: Request, env: Environment) =>
  Effect.gen(function* () {
    const url = new URL(request.url);
    const path = url.pathname;
    const store = yield* Store;
    {
      const response = yield* readinessRoutes(request, env);
      if (response) return response;
    }

    if (
      request.method !== "GET" &&
      request.headers.get("Origin") &&
      request.headers.get("Origin") !== url.origin
    )
      return yield* Effect.fail(
        failure("Cross-origin requests are not accepted.", 403),
      );
    if (path.startsWith("/api/admin/"))
      return yield* admin_routes(request, env);
    if (env.DEMO_MODE !== "true")
      return yield* Effect.fail(
        failure(
          "Production customer identity is not configured. Demo sessions and role switching are disabled.",
          503,
        ),
      );
    if (
      path.startsWith("/api/customers") ||
      path.startsWith("/api/customer-transfers/") ||
      path === "/api/customer-selection"
    ) {
      const current = yield* getSession(request).pipe(
        Effect.catchAll((error) =>
          error.status === 401 ? Effect.succeed(null) : Effect.fail(error),
        ),
      );
      return yield* customerRoute(request, current, hash);
    }
    {
      const response = yield* sessionEntry(request, env);
      if (response) return response;
    }
    const session = yield* getSession(request);
    const onboarding = yield* onboardingRoute(request, session);
    if (onboarding) return onboarding;
    if (path === "/api/planning" || path.startsWith("/api/planning/"))
      return yield* planningRequest(request, session, env.DEMO_MODE);
    {
      const response = yield* sessionLifecycle(request, env, session);
      if (response) return response;
    }

    if (path === "/api/dashboard" && request.method === "GET")
      return Response.json(
        yield* customerDashboard(
          session,
          url.searchParams.get("refresh") === "true",
        ),
      );
    if (financialMutation(request))
      yield* store.run(
        "UPDATE financial_snapshots SET invalidated_at=? WHERE bank_id=?",
        Date.now(),
        session.bank_id,
      );
    {
      const response = yield* workflowRoutes(request, env, session);
      if (response) return response;
    }
    if (path === "/api/application/review" && request.method === "POST") {
      const input = yield* parse(
        request,
        Schema.Struct({
          decision: Schema.Literal("needs_changes", "recommend", "approve"),
          note: Schema.String,
        }),
      );
      const result = yield* reviewApplication(
        session,
        input.decision,
        input.note,
      );
      if (
        input.decision === "approve" &&
        (yield* store.one(
          "SELECT bank_id FROM customer_applicant_scopes WHERE bank_id=?",
          session.bank_id,
        ))
      )
        yield* registerOpenedCustomer(session);
      return Response.json(result);
    }

    if (path === "/api/beneficiaries/confirm" && request.method === "POST") {
      const input = yield* parse(
        request,
        Schema.Struct({ id: Schema.String, code: Schema.String }),
      );
      return Response.json(
        yield* confirmBeneficiary(session, input.id, input.code),
      );
    }

    if (path === "/api/commands/approve" && request.method === "POST")
      return Response.json(
        yield* executeCommand(
          session,
          (yield* parse(request, Schema.Struct({ id: Schema.String }))).id,
        ),
      );
    if (path === "/api/commands/reject" && request.method === "POST")
      return Response.json(
        yield* rejectCommand(
          session,
          (yield* parse(request, Schema.Struct({ id: Schema.String }))).id,
        ),
      );
    {
      const response = yield* documentRoutes(request, env, session);
      if (response) return response;
    }

    if (path === "/api/loans" || path.startsWith("/api/loans/")) {
      const lending = yield* lending_routes(request, session);
      if (lending) return lending;
    }
    {
      const response = yield* productRoutes(request, env, session);
      if (response) return response;
    }

    {
      const response = yield* serviceRoutes(request, env, session);
      if (response) return response;
    }

    if (
      request.method === "POST" &&
      ["/api/requests", "/api/requests/resolve"].includes(path)
    )
      return yield* Effect.fail(
        failure(
          "Use the service centre to submit or process a versioned request with its required review and authorization.",
          409,
        ),
      );
    return yield* Effect.fail(failure("Route not found.", 404));
  });
