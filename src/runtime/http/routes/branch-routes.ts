import { Clock, Effect, Schema } from "effect";
import {
  createCommand,
  executeCommand,
  rejectCommand,
} from "../../../platform/banking-workspace/application/banking";
import type { Session } from "../../../platform/banking-workspace/domain/banking";
import { Store } from "../../../platform/banking-workspace/domain/ports";
import { readAccounting } from "../../../platform/branch-operations/application/accounting";
import {
  assignResponsibility,
  branchCustomer,
  readBranchDay,
} from "../../../platform/branch-operations/application/branch-day";
import { readProcessing } from "../../../platform/branch-operations/application/processing";
import { readRegisteredGl } from "../../../platform/branch-operations/application/registered-gl";
import { relationshipEnquiry } from "../../../platform/branch-operations/application/relationship";
import { commandSchema } from "../request-context";
import { parseJsonRequest } from "../request-json";
import { branchCaseRoutes } from "./branch-case-routes";
import { branchLoanRoutes } from "./branch-loan-routes";
export const branchRoutes = (request: Request, session: Session) =>
  Effect.gen(function* () {
    const url = new URL(request.url);
    if (url.pathname === "/api/branch" && request.method === "GET")
      return Response.json(yield* readBranchDay(session));
    if (url.pathname === "/api/branch/gl-journals" && request.method === "GET")
      return Response.json(
        yield* readRegisteredGl(
          session,
          url.searchParams.get("customerId") ?? "",
          Number(url.searchParams.get("id")),
          Number(url.searchParams.get("offset") ?? "0"),
        ),
      );
    if (url.pathname === "/api/branch/relationship" && request.method === "GET")
      return Response.json(
        yield* relationshipEnquiry(
          session,
          url.searchParams.get("customerId") ?? "",
        ),
      );
    if (url.pathname === "/api/branch/processing" && request.method === "GET")
      return Response.json(
        yield* readProcessing(
          session,
          url.searchParams.get("customerId") ?? "",
        ),
      );
    const loanResponse = yield* branchLoanRoutes(request, session);
    if (loanResponse) return loanResponse;
    const caseResponse = yield* branchCaseRoutes(request, session);
    if (caseResponse) return caseResponse;
    if (url.pathname === "/api/branch/accounting" && request.method === "GET")
      return Response.json(
        yield* readAccounting(
          session,
          url.searchParams.get("customerId") ?? "",
          Number(url.searchParams.get("offset") ?? "0"),
        ),
      );
    if (url.pathname === "/api/branch/assign" && request.method === "POST") {
      const input = yield* parseJsonRequest(
        request,
        Schema.Struct({
          customerId: Schema.String,
          commandId: Schema.String,
          owner: Schema.Literal("teller", "checker", "manager", "accountant"),
          version: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
        }),
      );
      return Response.json(
        yield* assignResponsibility(
          session,
          input.customerId,
          input.commandId,
          input.owner,
          input.version,
        ),
      );
    }
    if (
      url.pathname === "/api/branch/instruction" &&
      request.method === "POST"
    ) {
      const input = yield* parseJsonRequest(
        request,
        Schema.Struct({
          customerId: Schema.String,
          instruction: commandSchema,
        }),
      );
      const { scoped } = yield* branchCustomer(session, input.customerId);
      return Response.json(
        yield* createCommand(
          scoped,
          input.instruction,
          request.headers.get("Idempotency-Key") ?? "",
        ),
      );
    }
    if (url.pathname === "/api/branch/decision" && request.method === "POST") {
      const input = yield* parseJsonRequest(
        request,
        Schema.Struct({
          customerId: Schema.String,
          commandId: Schema.String,
          decision: Schema.Literal("approve", "reject"),
        }),
      );
      const { scoped } = yield* branchCustomer(session, input.customerId);
      const store = yield* Store;
      yield* store.run(
        "UPDATE financial_snapshots SET invalidated_at=? WHERE bank_id=?",
        yield* Clock.currentTimeMillis,
        scoped.bank_id,
      );
      return Response.json(
        yield* input.decision === "approve"
          ? executeCommand(scoped, input.commandId)
          : rejectCommand(scoped, input.commandId),
      );
    }
  });
