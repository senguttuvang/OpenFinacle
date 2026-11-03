import { Effect } from "effect";
import type { Session } from "../../../platform/banking-workspace/domain/banking";
import { readLoanAccounting } from "../../../platform/branch-operations/application/loan-accounting";
import {
  readBranchLoan,
  readLoanExposure,
} from "../../../platform/branch-operations/application/loans";
export const branchLoanRoutes = (request: Request, session: Session) =>
  Effect.gen(function* () {
    if (request.method !== "GET") return;
    const url = new URL(request.url);
    const customerId = url.searchParams.get("customerId") ?? "";
    if (url.pathname === "/api/branch/advances")
      return Response.json(yield* readLoanExposure(session, customerId));
    if (url.pathname === "/api/branch/loan-accounting")
      return Response.json(
        yield* readLoanAccounting(
          session,
          customerId,
          Number(url.searchParams.get("id")),
          Number(url.searchParams.get("offset") ?? "0"),
        ),
      );
    if (url.pathname === "/api/branch/loan")
      return Response.json(
        yield* readBranchLoan(
          session,
          customerId,
          Number(url.searchParams.get("id")),
        ),
      );
  });
