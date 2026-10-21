import { Effect } from "effect";
import { type Session } from "../../../platform/banking-workspace/domain/banking";
import {
  actOnDeposit,
  depositDetail,
  depositForKey,
  listDeposits,
  submitDeposit,
} from "../../../platform/deposits/application/deposits";
import {
  actOnRecurringPlan,
  listRecurringPlans,
  recurringDetail,
  recurringForKey,
  submitRecurringPlan,
} from "../../../platform/deposits/application/recurring-deposits";
import {
  DepositCommand,
  DepositTerms,
} from "../../../platform/deposits/domain/deposits";
import {
  RecurringCommand,
  RecurringTerms,
} from "../../../platform/deposits/domain/recurring-deposits";
import { failure } from "../request-context";
import { parseJsonRequest as parse } from "../request-json";
export const depositsRoutes = (request: Request, session: Session) =>
  Effect.gen(function* () {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === "/api/recurring-deposits" && request.method === "GET") {
      const id = url.searchParams.get("id");
      const key = url.searchParams.get("key");
      if (id !== null && key !== null)
        return yield* Effect.fail(
          failure("Choose a recurring plan or command reference."),
        );
      return Response.json(
        key !== null
          ? yield* recurringForKey(session, key)
          : id !== null
            ? yield* recurringDetail(session, id)
            : yield* listRecurringPlans(session),
      );
    }
    if (path === "/api/recurring-deposits" && request.method === "POST")
      return Response.json(
        yield* submitRecurringPlan(
          session,
          yield* parse(request, RecurringTerms, false, true),
          request.headers.get("Idempotency-Key") ?? "",
        ),
      );
    if (path === "/api/deposits" && request.method === "GET") {
      const id = url.searchParams.get("id");
      const key = url.searchParams.get("key");
      if (id !== null && key !== null)
        return yield* Effect.fail(
          failure("Choose a deposit or command reference."),
        );
      return Response.json(
        key !== null
          ? yield* depositForKey(session, key)
          : id !== null
            ? yield* depositDetail(session, id)
            : yield* listDeposits(session),
      );
    }
    if (path === "/api/deposits" && request.method === "POST")
      return Response.json(
        yield* submitDeposit(
          session,
          yield* parse(request, DepositTerms, false, true),
          request.headers.get("Idempotency-Key") ?? "",
        ),
      );
    if (path === "/api/recurring-deposits/action" && request.method === "POST")
      return Response.json(
        yield* actOnRecurringPlan(
          session,
          yield* parse(request, RecurringCommand, false, true),
          request.headers.get("Idempotency-Key") ?? "",
        ),
      );
    if (path === "/api/deposits/action" && request.method === "POST")
      return Response.json(
        yield* actOnDeposit(
          session,
          yield* parse(request, DepositCommand, false, true),
          request.headers.get("Idempotency-Key") ?? "",
        ),
      );
  });
