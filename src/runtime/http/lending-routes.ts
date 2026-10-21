import { Effect, Schema } from "effect";
import { type Session } from "../../platform/banking-workspace/domain/banking";
import { Store } from "../../platform/banking-workspace/domain/ports";
import {
  actOnLoan,
  createLoanQuote,
  inspectOriginalLoan,
  refreshLoanCoreView,
  submitLoanApplication,
} from "../../platform/lending/application/loan-origination";
import {
  listLoanApplications,
  savedLoanDetail,
  savedLoanForKey,
} from "../../platform/lending/application/loan-records";
import { savedLoanStatement } from "../../platform/lending/application/loan-statements";
import { LoanSubmission } from "../../platform/lending/domain/origination/loan-workflow";
import {
  LoanCommand,
  LoanTerms,
} from "../../platform/lending/domain/origination/loans";
import { failure } from "./request-context";
import { parseJsonRequest as parse } from "./request-json";
export const lending_routes = (request: Request, session: Session) =>
  Effect.gen(function* () {
    const url = new URL(request.url);
    const path = url.pathname;
    yield* Store;
    if (path === "/api/loans/statement" && request.method === "GET") {
      const id = url.searchParams.get("id");
      if (
        [...url.searchParams.keys()].length !== 1 ||
        !id ||
        !/^[a-zA-Z0-9_-]{8,100}$/.test(id)
      )
        return yield* Effect.fail(
          failure("Choose one valid owned loan application reference."),
        );
      const statement = yield* savedLoanStatement(session, id);
      return new Response(statement.csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="openfinacle-loan-${statement.core_id}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }
    if (path === "/api/loans" && request.method === "GET") {
      const keys = [...url.searchParams.keys()];
      const id = url.searchParams.get("id");
      const key = url.searchParams.get("key");
      if (
        new Set(keys).size !== keys.length ||
        keys.some((name) => name !== "id" && name !== "key") ||
        (id !== null && key !== null) ||
        [id, key].some(
          (value) => value !== null && !/^[a-zA-Z0-9_-]{8,100}$/.test(value),
        )
      )
        return yield* Effect.fail(
          failure(
            "Choose one valid application or original instruction reference.",
          ),
        );
      return Response.json(
        key !== null
          ? yield* savedLoanForKey(session, key)
          : id !== null
            ? yield* savedLoanDetail(session, id)
            : yield* listLoanApplications(session),
      );
    }
    if (path === "/api/loans/quote" && request.method === "POST")
      return Response.json(
        yield* createLoanQuote(
          session,
          yield* parse(request, LoanTerms, false, true),
        ),
      );
    if (path === "/api/loans" && request.method === "POST")
      return Response.json(
        yield* submitLoanApplication(
          session,
          yield* parse(request, LoanSubmission, false, true),
          request.headers.get("Idempotency-Key") ?? "",
        ),
      );
    if (path === "/api/loans/action" && request.method === "POST")
      return Response.json(
        yield* actOnLoan(
          session,
          yield* parse(request, LoanCommand, false, true),
          request.headers.get("Idempotency-Key") ?? "",
        ),
      );
    if (
      (path === "/api/loans/inspect" || path === "/api/loans/refresh") &&
      request.method === "POST"
    ) {
      const input = yield* parse(
        request,
        Schema.Struct({
          id: Schema.String.pipe(Schema.pattern(/^[a-zA-Z0-9_-]{8,100}$/)),
        }),
        false,
        true,
      );
      return Response.json(
        path === "/api/loans/inspect"
          ? yield* inspectOriginalLoan(session, input.id)
          : yield* refreshLoanCoreView(session, input.id),
      );
    }
  });
