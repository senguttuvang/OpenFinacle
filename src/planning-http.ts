import { Effect, Schema } from "effect";
import { parseJsonRequest } from "./adapters/request-json";
import {
  initializePlanning,
  inspectPlanningCommand,
  readPlanning,
  savePlanning,
} from "./application/planning";
import { BankingError, type Session } from "./domain/banking";

/** Called by the shared authenticated router after its existing getSession guard. */
export const planningRequest = (
  request: Request,
  session: Session,
  demoMode: string | undefined,
) =>
  Effect.gen(function* () {
    if (demoMode !== "true")
      return yield* Effect.fail(
        new BankingError({
          message:
            "Synthetic planning is available only in demonstration mode.",
          status: 403,
        }),
      );
    const url = new URL(request.url);
    const household = url.searchParams.get("household") ?? "";
    const key = request.headers.get("Idempotency-Key") ?? "";
    if (request.method === "GET" && url.pathname === "/api/planning/command")
      return Response.json(
        yield* inspectPlanningCommand(
          session,
          household,
          url.searchParams.get("key") ?? "",
        ),
      );
    if (request.method === "GET" && url.pathname === "/api/planning")
      return Response.json(yield* readPlanning(session, household));
    if (
      request.method === "POST" &&
      url.pathname === "/api/planning/initialize"
    )
      return Response.json({
        state: yield* initializePlanning(session, household, key),
      });
    if (request.method === "POST" && url.pathname === "/api/planning") {
      const body = yield* parseJsonRequest(request, Schema.Unknown);
      return Response.json({
        state: yield* savePlanning(session, household, body, key),
      });
    }
    return yield* Effect.fail(
      new BankingError({
        message: "Planning route or method not found.",
        status: 404,
      }),
    );
  }).pipe(
    Effect.mapError(
      (error) =>
        new BankingError({ message: error.message, status: error.status }),
    ),
  );
