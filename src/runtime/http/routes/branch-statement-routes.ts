import { Effect } from "effect";
import {
  BankingError,
  type Session,
} from "../../../platform/banking-workspace/domain/banking";
import { readSavingsStatement } from "../../../platform/branch-operations/application/savings-statement";

export const branchStatementRoutes = (request: Request, session: Session) =>
  Effect.gen(function* () {
    const url = new URL(request.url);
    if (
      url.pathname !== "/api/branch/savings-statement" ||
      request.method !== "GET"
    )
      return null;
    const allowed = ["customerId", "from", "to", "page", "mode", "revision"];
    const keys = [...url.searchParams.keys()];
    const page = url.searchParams.get("page") ?? "0",
      mode = url.searchParams.get("mode") ?? "page";
    if (
      keys.some((k) => !allowed.includes(k)) ||
      new Set(keys).size !== keys.length ||
      !/^\d{1,7}$/.test(page) ||
      (mode !== "page" && mode !== "export")
    )
      return yield* Effect.fail(
        new BankingError({
          message:
            "Choose one registered customer, valid native dates and a page or complete-range export.",
          status: 400,
        }),
      );
    const result = yield* readSavingsStatement(
      session,
      url.searchParams.get("customerId") ?? "",
      {
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to"),
        page: Number(page),
        mode,
      },
    );
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  });
