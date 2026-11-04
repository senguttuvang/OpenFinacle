import { Effect, Schema } from "effect";
import {
  BankingError,
  type Session,
} from "../../../platform/banking-workspace/domain/banking";
import {
  actCashCount,
  declareCashCount,
  readCashCount,
  readCashCountForKey,
  readCashCounts,
} from "../../../platform/branch-operations/application/cash-counts";
import {
  CashCountAction,
  CashCountInput,
  CashCountKey,
} from "../../../platform/branch-operations/domain/cash-counts";
import { parseJsonRequest } from "../request-json";

export const branchCashCountRoutes = (request: Request, session: Session) =>
  Effect.gen(function* () {
    const url = new URL(request.url);
    if (
      url.pathname === "/api/branch/cash-counts" &&
      request.method === "GET"
    ) {
      const customer = url.searchParams.get("customerId") ?? "";
      const id = url.searchParams.get("id"),
        key = url.searchParams.get("key");
      if (id !== null && key !== null)
        return yield* Effect.fail(
          new BankingError({
            message: "Choose a count or original action reference, not both.",
            status: 400,
          }),
        );
      return Response.json(
        yield* key !== null
          ? readCashCountForKey(session, customer, key)
          : id !== null
            ? readCashCount(session, customer, id)
            : readCashCounts(session, customer),
      );
    }
    if (request.method !== "POST") return null;
    if (url.pathname === "/api/branch/cash-counts") {
      const input = yield* parseJsonRequest(
        request,
        Schema.Struct({
          customerId: Schema.String,
          key: CashCountKey,
          command: CashCountInput,
        }),
        false,
        true,
      );
      return Response.json(
        yield* declareCashCount(
          session,
          input.customerId,
          input.command,
          input.key,
        ),
      );
    }
    if (url.pathname === "/api/branch/cash-count-action") {
      const input = yield* parseJsonRequest(
        request,
        Schema.Struct({
          customerId: Schema.String,
          key: CashCountKey,
          command: CashCountAction,
        }),
        false,
        true,
      );
      return Response.json(
        yield* actCashCount(
          session,
          input.customerId,
          input.command,
          input.key,
        ),
      );
    }
    return null;
  });
