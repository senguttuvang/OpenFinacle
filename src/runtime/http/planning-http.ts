import { Effect, Schema } from "effect";
import {
  BankingError,
  type Session,
} from "../../platform/banking-workspace/domain/banking";
import {
  initializePlanning,
  inspectPlanningCommand,
  readPlanning,
  savePlanning,
} from "../../platform/household-planning/application/planning";
import { parseJsonRequest } from "./request-json";

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
    if (url.pathname === "/api/planning/context" && request.method === "GET") {
      if (session.role === "approver")
        return yield* Effect.fail(
          new BankingError({
            message: "Banking approval does not grant planning access.",
            status: 403,
          }),
        );
      return Response.json({
        relationship: session.bank_id,
        readOnly: session.role !== "customer",
        role: session.role,
      });
    }
    if (url.searchParams.get("relationship") !== session.bank_id)
      return yield* Effect.fail(
        new BankingError({
          message:
            "The active relationship changed. Open its planning context again before continuing.",
          status: 409,
        }),
      );
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
        relationship: session.bank_id,
        confirmedKey: key,
      });
    if (request.method === "POST" && url.pathname === "/api/planning") {
      const body = yield* parseJsonRequest(request, Schema.Unknown);
      return Response.json({
        state: yield* savePlanning(session, household, body, key),
        relationship: session.bank_id,
        confirmedKey: key,
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
